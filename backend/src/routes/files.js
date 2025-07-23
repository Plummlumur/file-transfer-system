const express = require('express');
const { body, validationResult, param, query } = require('express-validator');
const path = require('path');
const fs = require('fs').promises;
const { authenticateToken, optionalAuth } = require('../middleware/auth');
const { uploadSingle, uploadMultiple, uploadChunk, combineChunks, validateUploadedFile } = require('../middleware/upload');
const { uploadRateLimit, downloadRateLimit, createUserRateLimit } = require('../middleware/rateLimiter');
const { asyncHandler } = require('../middleware/errorHandler');
const { logFileOperation } = require('../middleware/auditLogger');
const { File, FileRecipient, User, AuditLog, SystemSetting } = require('../models');
const emailService = require('../services/emailService');
const fileService = require('../services/fileService');
const logger = require('../utils/logger');

const router = express.Router();

// Get user's files
router.get('/',
  authenticateToken,
  [
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
    query('sort').optional().isIn(['name', 'size', 'date', 'status']).withMessage('Invalid sort field'),
    query('order').optional().isIn(['asc', 'desc']).withMessage('Order must be asc or desc'),
    query('status').optional().isIn(['uploading', 'ready', 'expired', 'deleted']).withMessage('Invalid status filter'),
    query('search').optional().isLength({ max: 255 }).withMessage('Search term too long')
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    const sort = req.query.sort || 'date';
    const order = req.query.order || 'desc';
    const status = req.query.status;
    const search = req.query.search;

    // Build where clause
    const where = { uploaded_by: req.user.id };
    if (status) {
      where.status = status;
    }
    if (search) {
      where[Op.or] = [
        { original_filename: { [Op.like]: `%${search}%` } },
        { description: { [Op.like]: `%${search}%` } }
      ];
    }

    // Build order clause
    const orderField = {
      name: 'original_filename',
      size: 'file_size',
      date: 'upload_date',
      status: 'status'
    }[sort];

    const files = await File.findAndCountAll({
      where,
      limit,
      offset,
      order: [[orderField, order.toUpperCase()]],
      include: [
        {
          model: FileRecipient,
          as: 'recipients',
          attributes: ['id', 'email', 'downloaded_at', 'email_sent_at', 'email_delivery_status']
        }
      ]
    });

    // Add computed fields
    const filesWithDetails = files.rows.map(file => {
      const fileData = file.toJSON();
      return {
        ...fileData,
        formatted_size: file.getFormattedSize(),
        days_until_expiry: file.getDaysUntilExpiry(),
        can_be_downloaded: file.canBeDownloaded(),
        is_expired: file.isExpired(),
        has_preview: file.hasPreview(),
        recipient_count: file.recipients.length,
        downloaded_count: file.recipients.filter(r => r.downloaded_at).length
      };
    });

    res.json({
      files: filesWithDetails,
      pagination: {
        page,
        limit,
        total: files.count,
        pages: Math.ceil(files.count / limit),
        hasNext: page < Math.ceil(files.count / limit),
        hasPrev: page > 1
      }
    });
  })
);

// Upload single file
router.post('/upload',
  authenticateToken,
  uploadRateLimit,
  createUserRateLimit({ max: 20, windowMs: 60 * 60 * 1000 }), // 20 uploads per hour per user
  uploadSingle('file'),
  validateUploadedFile,
  logFileOperation('UPLOAD'),
  [
    body('recipients')
      .isArray({ min: 1 })
      .withMessage('At least one recipient is required'),
    body('recipients.*')
      .isEmail()
      .withMessage('All recipients must be valid email addresses'),
    body('description')
      .optional()
      .isLength({ max: 1000 })
      .withMessage('Description must not exceed 1000 characters'),
    body('retention_days')
      .optional()
      .isInt({ min: 1, max: 365 })
      .withMessage('Retention days must be between 1 and 365'),
    body('max_downloads')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Max downloads must be between 1 and 100'),
    body('custom_message')
      .optional()
      .isLength({ max: 2000 })
      .withMessage('Custom message must not exceed 2000 characters')
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      // Clean up uploaded file if validation fails
      if (req.file) {
        await fs.unlink(req.file.path).catch(() => {});
      }
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    if (!req.file) {
      return res.status(400).json({
        error: 'No file uploaded'
      });
    }

    try {
      const { recipients, description, retention_days, max_downloads, custom_message } = req.body;
      
      // Calculate expiry date
      const retentionDays = retention_days || await SystemSetting.getSetting('DEFAULT_FILE_RETENTION_DAYS', 14);
      const expiryDate = new Date(Date.now() + (retentionDays * 24 * 60 * 60 * 1000));
      
      // Generate file checksum
      const checksum = await fileService.generateChecksum(req.file.path);
      
      // Create file record
      const file = await File.create({
        filename: req.file.filename,
        original_filename: req.file.originalname,
        file_size: req.file.size,
        mime_type: req.file.mimetype,
        file_path: path.relative(process.env.UPLOAD_DIR || './uploads', req.file.path),
        expiry_date: expiryDate,
        uploaded_by: req.user.id,
        max_downloads: max_downloads || await SystemSetting.getSetting('MAX_DOWNLOADS_PER_FILE', 1),
        description,
        checksum,
        status: 'ready'
      });

      // Create recipient records
      const recipientRecords = await Promise.all(
        recipients.map(email => 
          FileRecipient.create({
            file_id: file.id,
            email: email.toLowerCase().trim(),
            custom_message
          })
        )
      );

      // Update user upload quota
      await req.user.updateUploadUsage(req.file.size);

      // Generate thumbnail if it's an image or video
      if (file.isImage() || file.isVideo()) {
        fileService.generateThumbnail(req.file.path, file.id).catch(error => {
          logger.error('Thumbnail generation failed:', error);
        });
      }

      // Send email notifications
      const emailPromises = recipientRecords.map(recipient => 
        emailService.sendFileNotification(file, recipient, req.user)
          .catch(error => {
            logger.error('Email sending failed:', error);
            recipient.markEmailAsFailed(error.message);
          })
      );

      // Don't wait for emails to complete
      Promise.all(emailPromises).then(() => {
        logger.info(`File ${file.id} uploaded and emails sent to ${recipients.length} recipients`);
      });

      logger.info(`File uploaded successfully`, {
        fileId: file.id,
        filename: file.original_filename,
        size: file.file_size,
        userId: req.user.id,
        recipientCount: recipients.length
      });

      res.status(201).json({
        message: 'File uploaded successfully',
        file: {
          id: file.id,
          filename: file.original_filename,
          size: file.file_size,
          formatted_size: file.getFormattedSize(),
          mime_type: file.mime_type,
          upload_date: file.upload_date,
          expiry_date: file.expiry_date,
          days_until_expiry: file.getDaysUntilExpiry(),
          max_downloads: file.max_downloads,
          description: file.description,
          status: file.status,
          recipients: recipientRecords.map(r => ({
            id: r.id,
            email: r.email,
            download_url: r.getDownloadUrl()
          }))
        }
      });

    } catch (error) {
      // Clean up uploaded file on error
      if (req.file) {
        await fs.unlink(req.file.path).catch(() => {});
      }
      throw error;
    }
  })
);

// Upload multiple files
router.post('/upload-multiple',
  authenticateToken,
  uploadRateLimit,
  createUserRateLimit({ max: 10, windowMs: 60 * 60 * 1000 }), // 10 bulk uploads per hour per user
  uploadMultiple('files', 10),
  validateUploadedFile,
  logFileOperation('BULK_UPLOAD'),
  [
    body('recipients')
      .isArray({ min: 1 })
      .withMessage('At least one recipient is required'),
    body('recipients.*')
      .isEmail()
      .withMessage('All recipients must be valid email addresses'),
    body('description')
      .optional()
      .isLength({ max: 1000 })
      .withMessage('Description must not exceed 1000 characters'),
    body('retention_days')
      .optional()
      .isInt({ min: 1, max: 365 })
      .withMessage('Retention days must be between 1 and 365')
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      // Clean up uploaded files if validation fails
      if (req.files) {
        await Promise.all(req.files.map(file => 
          fs.unlink(file.path).catch(() => {})
        ));
      }
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        error: 'No files uploaded'
      });
    }

    try {
      const { recipients, description, retention_days } = req.body;
      const retentionDays = retention_days || await SystemSetting.getSetting('DEFAULT_FILE_RETENTION_DAYS', 14);
      const expiryDate = new Date(Date.now() + (retentionDays * 24 * 60 * 60 * 1000));
      
      const uploadedFiles = [];
      const totalSize = req.files.reduce((sum, file) => sum + file.size, 0);

      // Process each file
      for (const uploadedFile of req.files) {
        const checksum = await fileService.generateChecksum(uploadedFile.path);
        
        const file = await File.create({
          filename: uploadedFile.filename,
          original_filename: uploadedFile.originalname,
          file_size: uploadedFile.size,
          mime_type: uploadedFile.mimetype,
          file_path: path.relative(process.env.UPLOAD_DIR || './uploads', uploadedFile.path),
          expiry_date: expiryDate,
          uploaded_by: req.user.id,
          max_downloads: await SystemSetting.getSetting('MAX_DOWNLOADS_PER_FILE', 1),
          description,
          checksum,
          status: 'ready'
        });

        // Create recipient records
        const recipientRecords = await Promise.all(
          recipients.map(email => 
            FileRecipient.create({
              file_id: file.id,
              email: email.toLowerCase().trim()
            })
          )
        );

        uploadedFiles.push({
          file,
          recipients: recipientRecords
        });

        // Generate thumbnail if needed
        if (file.isImage() || file.isVideo()) {
          fileService.generateThumbnail(uploadedFile.path, file.id).catch(error => {
            logger.error('Thumbnail generation failed:', error);
          });
        }
      }

      // Update user upload quota
      await req.user.updateUploadUsage(totalSize);

      // Send email notifications for all files
      const emailPromises = uploadedFiles.flatMap(({ file, recipients: fileRecipients }) =>
        fileRecipients.map(recipient => 
          emailService.sendFileNotification(file, recipient, req.user)
            .catch(error => {
              logger.error('Email sending failed:', error);
              recipient.markEmailAsFailed(error.message);
            })
        )
      );

      Promise.all(emailPromises).then(() => {
        logger.info(`${uploadedFiles.length} files uploaded and emails sent`);
      });

      logger.info(`Multiple files uploaded successfully`, {
        fileCount: uploadedFiles.length,
        totalSize,
        userId: req.user.id,
        recipientCount: recipients.length
      });

      res.status(201).json({
        message: `${uploadedFiles.length} files uploaded successfully`,
        files: uploadedFiles.map(({ file, recipients: fileRecipients }) => ({
          id: file.id,
          filename: file.original_filename,
          size: file.file_size,
          formatted_size: file.getFormattedSize(),
          mime_type: file.mime_type,
          upload_date: file.upload_date,
          expiry_date: file.expiry_date,
          status: file.status,
          recipients: fileRecipients.map(r => ({
            id: r.id,
            email: r.email,
            download_url: r.getDownloadUrl()
          }))
        }))
      });

    } catch (error) {
      // Clean up uploaded files on error
      if (req.files) {
        await Promise.all(req.files.map(file => 
          fs.unlink(file.path).catch(() => {})
        ));
      }
      throw error;
    }
  })
);

// Chunked upload endpoint
router.post('/upload-chunk',
  authenticateToken,
  uploadRateLimit,
  uploadChunk(),
  asyncHandler(async (req, res) => {
    const { chunkNumber, totalChunks, filename, fileId } = req.chunkInfo;
    
    logger.debug(`Received chunk ${chunkNumber}/${totalChunks} for file ${fileId}`);

    // Check if this is the last chunk
    if (chunkNumber === totalChunks) {
      try {
        // Combine all chunks
        const finalPath = await combineChunks(req.chunkInfo.tempDir, filename, totalChunks);
        
        // Get file stats
        const stats = await fs.stat(finalPath);
        
        // Update file record to mark as ready
        const file = await File.findByPk(fileId);
        if (file) {
          await file.update({
            status: 'ready',
            upload_progress: 100,
            file_size: stats.size,
            file_path: path.relative(process.env.UPLOAD_DIR || './uploads', finalPath)
          });
          
          // Update user quota
          await req.user.updateUploadUsage(stats.size);
          
          logger.info(`Chunked upload completed for file ${fileId}`, {
            filename,
            size: stats.size,
            chunks: totalChunks
          });
        }
        
        res.json({
          message: 'Upload completed',
          fileId,
          filename,
          size: stats.size,
          status: 'ready'
        });
      } catch (error) {
        logger.error('Error combining chunks:', error);
        res.status(500).json({
          error: 'Failed to combine file chunks'
        });
      }
    } else {
      res.json({
        message: 'Chunk received',
        chunkNumber,
        totalChunks,
        fileId
      });
    }
  })
);

// Get file details
router.get('/:id',
  authenticateToken,
  [
    param('id').isUUID().withMessage('Invalid file ID')
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const file = await File.findOne({
      where: {
        id: req.params.id,
        uploaded_by: req.user.id
      },
      include: [
        {
          model: FileRecipient,
          as: 'recipients',
          attributes: ['id', 'email', 'downloaded_at', 'email_sent_at', 'email_delivery_status', 'access_count', 'last_access_at']
        }
      ]
    });

    if (!file) {
      return res.status(404).json({
        error: 'File not found'
      });
    }

    const fileData = file.toJSON();
    res.json({
      ...fileData,
      formatted_size: file.getFormattedSize(),
      days_until_expiry: file.getDaysUntilExpiry(),
      can_be_downloaded: file.canBeDownloaded(),
      is_expired: file.isExpired(),
      has_preview: file.hasPreview(),
      download_stats: {
        total_recipients: file.recipients.length,
        downloaded_count: file.recipients.filter(r => r.downloaded_at).length,
        pending_count: file.recipients.filter(r => !r.downloaded_at).length
      }
    });
  })
);

// Download file (for authenticated users - their own files)
router.get('/:id/download',
  authenticateToken,
  downloadRateLimit,
  [
    param('id').isUUID().withMessage('Invalid file ID')
  ],
  logFileOperation('DOWNLOAD'),
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const file = await File.findOne({
      where: {
        id: req.params.id,
        uploaded_by: req.user.id
      }
    });

    if (!file) {
      return res.status(404).json({
        error: 'File not found'
      });
    }

    if (file.status !== 'ready') {
      return res.status(400).json({
        error: 'File is not ready for download'
      });
    }

    const filePath = path.join(process.env.UPLOAD_DIR || './uploads', file.file_path);
    
    try {
      await fs.access(filePath);
    } catch {
      return res.status(404).json({
        error: 'File not found on disk'
      });
    }

    logger.info(`File downloaded by owner`, {
      fileId: file.id,
      filename: file.original_filename,
      userId: req.user.id
    });

    res.download(filePath, file.original_filename);
  })
);

// Public download endpoint (using token)
router.get('/download/:token',
  downloadRateLimit,
  [
    param('token').isLength({ min: 32, max: 255 }).withMessage('Invalid download token')
  ],
  logFileOperation('PUBLIC_DOWNLOAD'),
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Invalid download link'
      });
    }

    const recipient = await FileRecipient.findOne({
      where: { download_token: req.params.token },
      include: [
        {
          model: File,
          as: 'file',
          include: [
            {
              model: User,
              as: 'uploader',
              attributes: ['username', 'display_name', 'email']
            }
          ]
        }
      ]
    });

    if (!recipient || !recipient.file) {
      return res.status(404).json({
        error: 'Download link not found or expired'
      });
    }

    const file = recipient.file;

    // Check if file can be downloaded
    if (!recipient.canDownload()) {
      let reason = 'Download not available';
      if (recipient.hasDownloaded()) {
        reason = 'File has already been downloaded';
      } else if (recipient.isExpired()) {
        reason = 'Download link has expired';
      } else if (!recipient.is_active) {
        reason = 'Download link has been deactivated';
      }

      return res.status(410).json({
        error: reason,
        downloaded_at: recipient.downloaded_at,
        expiry_date: recipient.expiry_date || file.expiry_date
      });
    }

    if (file.status !== 'ready') {
      return res.status(400).json({
        error: 'File is not ready for download'
      });
    }

    const filePath = path.join(process.env.UPLOAD_DIR || './uploads', file.file_path);
    
    try {
      await fs.access(filePath);
    } catch {
      return res.status(404).json({
        error: 'File not found'
      });
    }

    // Mark as downloaded
    await recipient.markAsDownloaded(req.ip, req.get('User-Agent'));
    await file.incrementDownloadCount();

    // Notify sender
    emailService.sendDownloadNotification(file, recipient, file.uploader).catch(error => {
      logger.error('Download notification failed:', error);
    });

    logger.info(`File downloaded via public link`, {
      fileId: file.id,
      filename: file.original_filename,
      recipientEmail: recipient.email,
      ip: req.ip
    });

    res.download(filePath, file.original_filename);
  })
);

// Delete file
router.delete('/:id',
  authenticateToken,
  [
    param('id').isUUID().withMessage('Invalid file ID')
  ],
  logFileOperation('DELETE'),
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const file = await File.findOne({
      where: {
        id: req.params.id,
        uploaded_by: req.user.id
      }
    });

    if (!file) {
      return res.status(404).json({
        error: 'File not found'
      });
    }

    // Mark file as deleted
    await file.markAsDeleted();

    // Delete physical file
    const filePath = path.join(process.env.UPLOAD_DIR || './uploads', file.file_path);
    await fs.unlink(filePath).catch(error => {
      logger.warn('Failed to delete physical file:', error);
    });

    // Delete thumbnail if exists
    if (file.thumbnail_path) {
      const thumbnailPath = path.join(process.env.UPLOAD_DIR || './uploads', file.thumbnail_path);
      await fs.unlink(thumbnailPath).catch(() => {});
    }

    logger.info(`File deleted`, {
      fileId: file.id,
      filename: file.original_filename,
      userId: req.user.id
    });

    res.json({
      message: 'File deleted successfully'
    });
  })
);

// Resend email notifications
router.post('/:id/resend-emails',
  authenticateToken,
  createUserRateLimit({ max: 5, windowMs: 60 * 60 * 1000 }), // 5 resends per hour per user
  [
    param('id').isUUID().withMessage('Invalid file ID'),
    body('recipients').optional().isArray().withMessage('Recipients must be an array'),
    body('recipients.*').optional().isEmail().withMessage('Invalid email address')
  ],
  logFileOperation('RESEND_EMAIL'),
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const file = await File.findOne({
      where: {
        id: req.params.id,
        uploaded_by: req.user.id
      },
      include: [
        {
          model: FileRecipient,
          as: 'recipients'
        }
      ]
    });

    if (!file) {
      return res.status(404).json({
        error: 'File not found'
      });
    }

    if (file.status !== 'ready') {
      return res.status(400).json({
        error: 'File is not ready'
      });
    }

    const { recipients: targetEmails } = req.body;
    let recipientsToNotify = file.recipients;

    // Filter recipients if specific emails provided
    if (targetEmails && targetEmails.length > 0) {
      recipientsToNotify = file.recipients.filter(r => 
        targetEmails.includes(r.email)
      );
    }

    // Only resend to recipients who haven't downloaded yet
    recipientsToNotify = recipientsToNotify.filter(r => !r.hasDownloaded());

    if (recipientsToNotify.length === 0) {
      return res.status(400).json({
        error: 'No eligible recipients for email resend'
      });
    }

    // Send emails
    const emailPromises = recipientsToNotify.map(recipient => 
      emailService.sendFileNotification(file, recipient, req.user)
        .then(() => recipient.markEmailAsSent())
        .catch(error => {
          logger.error('Email resend failed:', error);
          recipient.markEmailAsFailed(error.message);
        })
    );

    await Promise.all(emailPromises);

    logger.info(`Emails resent for file ${file.id} to ${recipientsToNotify.length} recipients`);

    res.json({
      message: `Emails resent to ${recipientsToNotify.length} recipients`,
      recipients: recipientsToNotify.map(r => r.email)
    });
  })
);

// Email tracking pixel
router.get('/track-email/:token',
  [
    param('token').isLength({ min: 32, max: 255 }).withMessage('Invalid token')
  ],
  asyncHandler(async (req, res) => {
    const recipient = await FileRecipient.findOne({
      where: { download_token: req.params.token }
    });

    if (recipient) {
      await recipient.markEmailAsOpened();
    }

    // Return 1x1 transparent pixel
    const pixel = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
      'base64'
    );

    res.set({
      'Content-Type': 'image/png',
      'Content-Length': pixel.length,
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    });

    res.send(pixel);
  })
);

module.exports = router;
