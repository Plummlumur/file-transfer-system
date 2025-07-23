const express = require('express');
const { body, validationResult, param, query } = require('express-validator');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const { adminRateLimit } = require('../middleware/rateLimiter');
const { asyncHandler } = require('../middleware/errorHandler');
const { logAdminOperation } = require('../middleware/auditLogger');
const { User, File, FileRecipient, AuditLog, SystemSetting } = require('../models');
const fileService = require('../services/fileService');
const emailService = require('../services/emailService');
const cleanupJob = require('../jobs/cleanupJob');
const logger = require('../utils/logger');
const { Op } = require('sequelize');

const router = express.Router();

// Apply authentication and admin requirement to all routes
router.use(authenticateToken);
router.use(requireAdmin);
router.use(adminRateLimit);

// Dashboard statistics
router.get('/dashboard',
  asyncHandler(async (req, res) => {
    const stats = await Promise.all([
      // File statistics
      File.findAll({
        attributes: [
          [require('sequelize').fn('COUNT', require('sequelize').col('id')), 'total_files'],
          [require('sequelize').fn('SUM', require('sequelize').col('file_size')), 'total_size'],
          [require('sequelize').fn('COUNT', require('sequelize').literal("CASE WHEN status = 'ready' THEN 1 END")), 'active_files'],
          [require('sequelize').fn('COUNT', require('sequelize').literal("CASE WHEN status = 'expired' THEN 1 END")), 'expired_files'],
          [require('sequelize').fn('COUNT', require('sequelize').literal("CASE WHEN upload_date >= DATE_SUB(NOW(), INTERVAL 24 HOUR) THEN 1 END")), 'files_today'],
          [require('sequelize').fn('COUNT', require('sequelize').literal("CASE WHEN upload_date >= DATE_SUB(NOW(), INTERVAL 7 DAY) THEN 1 END")), 'files_week']
        ],
        raw: true
      }),

      // User statistics
      User.findAll({
        attributes: [
          [require('sequelize').fn('COUNT', require('sequelize').col('id')), 'total_users'],
          [require('sequelize').fn('COUNT', require('sequelize').literal("CASE WHEN is_active = 1 THEN 1 END")), 'active_users'],
          [require('sequelize').fn('COUNT', require('sequelize').literal("CASE WHEN last_login >= DATE_SUB(NOW(), INTERVAL 24 HOUR) THEN 1 END")), 'users_today'],
          [require('sequelize').fn('COUNT', require('sequelize').literal("CASE WHEN last_login >= DATE_SUB(NOW(), INTERVAL 7 DAY) THEN 1 END")), 'users_week']
        ],
        raw: true
      }),

      // Download statistics
      FileRecipient.findAll({
        attributes: [
          [require('sequelize').fn('COUNT', require('sequelize').col('id')), 'total_recipients'],
          [require('sequelize').fn('COUNT', require('sequelize').literal("CASE WHEN downloaded_at IS NOT NULL THEN 1 END")), 'total_downloads'],
          [require('sequelize').fn('COUNT', require('sequelize').literal("CASE WHEN downloaded_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR) THEN 1 END")), 'downloads_today'],
          [require('sequelize').fn('COUNT', require('sequelize').literal("CASE WHEN downloaded_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) THEN 1 END")), 'downloads_week']
        ],
        raw: true
      }),

      // Storage statistics
      fileService.getStorageStats(),

      // Recent activity
      AuditLog.findAll({
        limit: 10,
        order: [['created_at', 'DESC']],
        include: [
          {
            model: User,
            as: 'user',
            attributes: ['username', 'display_name']
          }
        ]
      })
    ]);

    const [fileStats, userStats, downloadStats, storageStats, recentActivity] = stats;

    res.json({
      files: {
        total: parseInt(fileStats[0].total_files) || 0,
        totalSize: parseInt(fileStats[0].total_size) || 0,
        active: parseInt(fileStats[0].active_files) || 0,
        expired: parseInt(fileStats[0].expired_files) || 0,
        today: parseInt(fileStats[0].files_today) || 0,
        week: parseInt(fileStats[0].files_week) || 0
      },
      users: {
        total: parseInt(userStats[0].total_users) || 0,
        active: parseInt(userStats[0].active_users) || 0,
        today: parseInt(userStats[0].users_today) || 0,
        week: parseInt(userStats[0].users_week) || 0
      },
      downloads: {
        totalRecipients: parseInt(downloadStats[0].total_recipients) || 0,
        totalDownloads: parseInt(downloadStats[0].total_downloads) || 0,
        today: parseInt(downloadStats[0].downloads_today) || 0,
        week: parseInt(downloadStats[0].downloads_week) || 0
      },
      storage: storageStats,
      recentActivity: recentActivity.map(log => ({
        id: log.id,
        action: log.action,
        category: log.category,
        user: log.user ? log.user.display_name || log.user.username : 'System',
        created_at: log.created_at,
        ip_address: log.ip_address
      }))
    });
  })
);

// Get all files (admin view)
router.get('/files',
  [
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
    query('sort').optional().isIn(['name', 'size', 'date', 'user', 'status']).withMessage('Invalid sort field'),
    query('order').optional().isIn(['asc', 'desc']).withMessage('Order must be asc or desc'),
    query('status').optional().isIn(['uploading', 'ready', 'expired', 'deleted']).withMessage('Invalid status filter'),
    query('user').optional().isInt().withMessage('User filter must be an integer'),
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
    const userId = req.query.user;
    const search = req.query.search;

    // Build where clause
    const where = {};
    if (status) where.status = status;
    if (userId) where.uploaded_by = userId;
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
      user: [{ model: User, as: 'uploader' }, 'display_name'],
      status: 'status'
    }[sort];

    const files = await File.findAndCountAll({
      where,
      limit,
      offset,
      order: Array.isArray(orderField) ? [orderField.concat(order.toUpperCase())] : [[orderField, order.toUpperCase()]],
      include: [
        {
          model: User,
          as: 'uploader',
          attributes: ['id', 'username', 'display_name', 'email']
        },
        {
          model: FileRecipient,
          as: 'recipients',
          attributes: ['id', 'email', 'downloaded_at', 'email_delivery_status']
        }
      ]
    });

    const filesWithDetails = files.rows.map(file => {
      const fileData = file.toJSON();
      return {
        ...fileData,
        formatted_size: file.getFormattedSize(),
        days_until_expiry: file.getDaysUntilExpiry(),
        can_be_downloaded: file.canBeDownloaded(),
        is_expired: file.isExpired(),
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

// Delete file (admin)
router.delete('/files/:id',
  [
    param('id').isUUID().withMessage('Invalid file ID')
  ],
  logAdminOperation('DELETE_FILE', 'FILE'),
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const file = await File.findByPk(req.params.id, {
      include: [
        {
          model: User,
          as: 'uploader',
          attributes: ['username', 'display_name', 'email']
        }
      ]
    });

    if (!file) {
      return res.status(404).json({
        error: 'File not found'
      });
    }

    // Mark file as deleted
    await file.markAsDeleted();

    // Delete physical file
    const path = require('path');
    const fs = require('fs').promises;
    const filePath = path.join(process.env.UPLOAD_DIR || './uploads', file.file_path);
    await fs.unlink(filePath).catch(error => {
      logger.warn('Failed to delete physical file:', error);
    });

    // Delete thumbnail if exists
    if (file.thumbnail_path) {
      const thumbnailPath = path.join(process.env.UPLOAD_DIR || './uploads', file.thumbnail_path);
      await fs.unlink(thumbnailPath).catch(() => {});
    }

    logger.info(`File deleted by admin`, {
      fileId: file.id,
      filename: file.original_filename,
      adminId: req.user.id,
      originalUploader: file.uploader.username
    });

    res.json({
      message: 'File deleted successfully'
    });
  })
);

// Get all users
router.get('/users',
  [
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
    query('search').optional().isLength({ max: 255 }).withMessage('Search term too long'),
    query('active').optional().isBoolean().withMessage('Active filter must be boolean')
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
    const search = req.query.search;
    const active = req.query.active;

    const where = {};
    if (active !== undefined) where.is_active = active === 'true';
    if (search) {
      where[Op.or] = [
        { username: { [Op.like]: `%${search}%` } },
        { display_name: { [Op.like]: `%${search}%` } },
        { email: { [Op.like]: `%${search}%` } }
      ];
    }

    const users = await User.findAndCountAll({
      where,
      limit,
      offset,
      order: [['created_at', 'DESC']],
      attributes: { exclude: ['ldap_groups'] },
      include: [
        {
          model: File,
          as: 'uploadedFiles',
          attributes: [
            [require('sequelize').fn('COUNT', require('sequelize').col('uploadedFiles.id')), 'file_count'],
            [require('sequelize').fn('SUM', require('sequelize').col('uploadedFiles.file_size')), 'total_size']
          ],
          where: { status: { [Op.ne]: 'deleted' } },
          required: false
        }
      ],
      group: ['User.id']
    });

    const usersWithStats = users.rows.map(user => {
      const userData = user.toJSON();
      return {
        ...userData,
        quota_status: user.getUploadQuotaStatus(),
        file_count: parseInt(userData.uploadedFiles?.[0]?.file_count) || 0,
        total_upload_size: parseInt(userData.uploadedFiles?.[0]?.total_size) || 0
      };
    });

    res.json({
      users: usersWithStats,
      pagination: {
        page,
        limit,
        total: users.count.length || users.count,
        pages: Math.ceil((users.count.length || users.count) / limit),
        hasNext: page < Math.ceil((users.count.length || users.count) / limit),
        hasPrev: page > 1
      }
    });
  })
);

// Update user
router.put('/users/:id',
  [
    param('id').isInt().withMessage('Invalid user ID'),
    body('is_active').optional().isBoolean().withMessage('is_active must be boolean'),
    body('upload_quota_daily').optional().isInt({ min: 0 }).withMessage('Daily quota must be non-negative'),
    body('upload_quota_monthly').optional().isInt({ min: 0 }).withMessage('Monthly quota must be non-negative'),
    body('display_name').optional().trim().isLength({ min: 1, max: 255 }).withMessage('Display name must be 1-255 characters')
  ],
  logAdminOperation('UPDATE_USER', 'USER'),
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const user = await User.findByPk(req.params.id);
    if (!user) {
      return res.status(404).json({
        error: 'User not found'
      });
    }

    const { is_active, upload_quota_daily, upload_quota_monthly, display_name } = req.body;
    const updateData = {};

    if (is_active !== undefined) updateData.is_active = is_active;
    if (upload_quota_daily !== undefined) updateData.upload_quota_daily = upload_quota_daily;
    if (upload_quota_monthly !== undefined) updateData.upload_quota_monthly = upload_quota_monthly;
    if (display_name !== undefined) updateData.display_name = display_name;

    await user.update(updateData);

    logger.info(`User updated by admin`, {
      userId: user.id,
      username: user.username,
      adminId: req.user.id,
      changes: Object.keys(updateData)
    });

    res.json({
      message: 'User updated successfully',
      user: {
        ...user.toJSON(),
        quota_status: user.getUploadQuotaStatus()
      }
    });
  })
);

// Get system settings
router.get('/settings',
  [
    query('category').optional().isString().withMessage('Category must be a string')
  ],
  asyncHandler(async (req, res) => {
    const category = req.query.category;
    
    const where = {};
    if (category) where.category = category.toUpperCase();

    const settings = await SystemSetting.findAll({
      where,
      order: [['category', 'ASC'], ['key_name', 'ASC']]
    });

    // Group settings by category
    const groupedSettings = settings.reduce((acc, setting) => {
      if (!acc[setting.category]) {
        acc[setting.category] = [];
      }
      acc[setting.category].push(setting);
      return acc;
    }, {});

    res.json({
      settings: groupedSettings,
      categories: Object.keys(groupedSettings)
    });
  })
);

// Update system setting
router.put('/settings/:key',
  [
    param('key').isString().withMessage('Setting key is required'),
    body('value').exists().withMessage('Value is required'),
    body('description').optional().isString().withMessage('Description must be a string')
  ],
  logAdminOperation('UPDATE_SETTING', 'SETTING'),
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { value, description } = req.body;
    const key = req.params.key.toUpperCase();

    const setting = await SystemSetting.setSetting(key, value, req.user.id, description);

    logger.info(`System setting updated`, {
      key,
      adminId: req.user.id,
      adminUsername: req.user.username
    });

    res.json({
      message: 'Setting updated successfully',
      setting
    });
  })
);

// Get audit logs
router.get('/audit-logs',
  [
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
    query('category').optional().isIn(['AUTH', 'FILE', 'ADMIN', 'SYSTEM', 'SECURITY']).withMessage('Invalid category'),
    query('severity').optional().isIn(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).withMessage('Invalid severity'),
    query('user_id').optional().isInt().withMessage('User ID must be integer'),
    query('from_date').optional().isISO8601().withMessage('Invalid from date'),
    query('to_date').optional().isISO8601().withMessage('Invalid to date'),
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
    const limit = parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;

    const where = {};
    if (req.query.category) where.category = req.query.category;
    if (req.query.severity) where.severity = req.query.severity;
    if (req.query.user_id) where.user_id = req.query.user_id;
    if (req.query.from_date || req.query.to_date) {
      where.created_at = {};
      if (req.query.from_date) where.created_at[Op.gte] = new Date(req.query.from_date);
      if (req.query.to_date) where.created_at[Op.lte] = new Date(req.query.to_date);
    }
    if (req.query.search) {
      where[Op.or] = [
        { action: { [Op.like]: `%${req.query.search}%` } },
        { ip_address: { [Op.like]: `%${req.query.search}%` } }
      ];
    }

    const logs = await AuditLog.findAndCountAll({
      where,
      limit,
      offset,
      order: [['created_at', 'DESC']],
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['username', 'display_name'],
          required: false
        }
      ]
    });

    res.json({
      logs: logs.rows,
      pagination: {
        page,
        limit,
        total: logs.count,
        pages: Math.ceil(logs.count / limit),
        hasNext: page < Math.ceil(logs.count / limit),
        hasPrev: page > 1
      }
    });
  })
);

// System statistics
router.get('/statistics',
  [
    query('period').optional().isIn(['day', 'week', 'month', 'year']).withMessage('Invalid period'),
    query('metric').optional().isIn(['uploads', 'downloads', 'users', 'storage']).withMessage('Invalid metric')
  ],
  asyncHandler(async (req, res) => {
    const period = req.query.period || 'week';
    const metric = req.query.metric;

    const periodMap = {
      day: 24,
      week: 7 * 24,
      month: 30 * 24,
      year: 365 * 24
    };

    const hours = periodMap[period];
    const startDate = new Date(Date.now() - (hours * 60 * 60 * 1000));

    const stats = {};

    if (!metric || metric === 'uploads') {
      stats.uploads = await File.findAll({
        attributes: [
          [require('sequelize').fn('DATE', require('sequelize').col('upload_date')), 'date'],
          [require('sequelize').fn('COUNT', require('sequelize').col('id')), 'count'],
          [require('sequelize').fn('SUM', require('sequelize').col('file_size')), 'size']
        ],
        where: {
          upload_date: { [Op.gte]: startDate }
        },
        group: [require('sequelize').fn('DATE', require('sequelize').col('upload_date'))],
        order: [[require('sequelize').fn('DATE', require('sequelize').col('upload_date')), 'ASC']],
        raw: true
      });
    }

    if (!metric || metric === 'downloads') {
      stats.downloads = await FileRecipient.findAll({
        attributes: [
          [require('sequelize').fn('DATE', require('sequelize').col('downloaded_at')), 'date'],
          [require('sequelize').fn('COUNT', require('sequelize').col('id')), 'count']
        ],
        where: {
          downloaded_at: { 
            [Op.gte]: startDate,
            [Op.ne]: null
          }
        },
        group: [require('sequelize').fn('DATE', require('sequelize').col('downloaded_at'))],
        order: [[require('sequelize').fn('DATE', require('sequelize').col('downloaded_at')), 'ASC']],
        raw: true
      });
    }

    if (!metric || metric === 'users') {
      stats.users = await User.findAll({
        attributes: [
          [require('sequelize').fn('DATE', require('sequelize').col('last_login')), 'date'],
          [require('sequelize').fn('COUNT', require('sequelize').col('id')), 'count']
        ],
        where: {
          last_login: { 
            [Op.gte]: startDate,
            [Op.ne]: null
          }
        },
        group: [require('sequelize').fn('DATE', require('sequelize').col('last_login'))],
        order: [[require('sequelize').fn('DATE', require('sequelize').col('last_login')), 'ASC']],
        raw: true
      });
    }

    if (!metric || metric === 'storage') {
      stats.storage = await fileService.getStorageStats();
    }

    res.json({
      period,
      stats
    });
  })
);

// Manual cleanup trigger
router.post('/cleanup',
  logAdminOperation('MANUAL_CLEANUP', 'SYSTEM'),
  asyncHandler(async (req, res) => {
    try {
      await cleanupJob.runManualCleanup();
      
      logger.info(`Manual cleanup triggered by admin`, {
        adminId: req.user.id,
        adminUsername: req.user.username
      });

      res.json({
        message: 'Cleanup job started successfully'
      });
    } catch (error) {
      if (error.message === 'Cleanup job is already running') {
        return res.status(409).json({
          error: 'Cleanup job is already running'
        });
      }
      throw error;
    }
  })
);

// Get cleanup job status
router.get('/cleanup/status',
  asyncHandler(async (req, res) => {
    const status = cleanupJob.getStatus();
    res.json(status);
  })
);

// Test email configuration
router.post('/test-email',
  [
    body('email').isEmail().withMessage('Valid email address required')
  ],
  logAdminOperation('TEST_EMAIL', 'SYSTEM'),
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    try {
      const result = await emailService.sendTestEmail(req.body.email);
      
      logger.info(`Test email sent by admin`, {
        adminId: req.user.id,
        adminUsername: req.user.username,
        testEmail: req.body.email,
        messageId: result.messageId
      });

      res.json({
        message: 'Test email sent successfully',
        messageId: result.messageId
      });
    } catch (error) {
      logger.error('Test email failed:', error);
      res.status(500).json({
        error: 'Failed to send test email',
        details: error.message
      });
    }
  })
);

// Export user data (GDPR compliance)
router.get('/users/:id/export',
  [
    param('id').isInt().withMessage('Invalid user ID')
  ],
  logAdminOperation('EXPORT_USER_DATA', 'USER'),
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const user = await User.findByPk(req.params.id, {
      include: [
        {
          model: File,
          as: 'uploadedFiles',
          include: [
            {
              model: FileRecipient,
              as: 'recipients'
            }
          ]
        },
        {
          model: AuditLog,
          as: 'auditLogs',
          limit: 1000,
          order: [['created_at', 'DESC']]
        }
      ]
    });

    if (!user) {
      return res.status(404).json({
        error: 'User not found'
      });
    }

    const exportData = {
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        display_name: user.display_name,
        created_at: user.created_at,
        last_login: user.last_login,
        preferences: user.preferences
      },
      files: user.uploadedFiles.map(file => ({
        id: file.id,
        filename: file.original_filename,
        size: file.file_size,
        upload_date: file.upload_date,
        expiry_date: file.expiry_date,
        status: file.status,
        recipients: file.recipients.map(r => ({
          email: r.email,
          sent_at: r.email_sent_at,
          downloaded_at: r.downloaded_at
        }))
      })),
      auditLogs: user.auditLogs.map(log => ({
        action: log.action,
        category: log.category,
        ip_address: log.ip_address,
        created_at: log.created_at,
        details: log.details
      })),
      exportedAt: new Date().toISOString(),
      exportedBy: req.user.username
    };

    logger.info(`User data exported by admin`, {
      userId: user.id,
      username: user.username,
      adminId: req.user.id,
      adminUsername: req.user.username
    });

    res.json({
      message: 'User data exported successfully',
      data: exportData
    });
  })
);

// Delete user data (GDPR compliance)
router.delete('/users/:id/data',
  [
    param('id').isInt().withMessage('Invalid user ID'),
    body('confirm').equals('DELETE').withMessage('Confirmation required')
  ],
  logAdminOperation('DELETE_USER_DATA', 'USER'),
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const user = await User.findByPk(req.params.id);
    if (!user) {
      return res.status(404).json({
        error: 'User not found'
      });
    }

    // Delete user's files
    const userFiles = await File.findAll({
      where: { uploaded_by: user.id }
    });

    for (const file of userFiles) {
      await file.markAsDeleted();
      
      // Delete physical file
      const path = require('path');
      const fs = require('fs').promises;
      const filePath = path.join(process.env.UPLOAD_DIR || './uploads', file.file_path);
      await fs.unlink(filePath).catch(() => {});
      
      if (file.thumbnail_path) {
        const thumbnailPath = path.join(process.env.UPLOAD_DIR || './uploads', file.thumbnail_path);
        await fs.unlink(thumbnailPath).catch(() => {});
      }
    }

    // Anonymize audit logs (keep for compliance but remove personal data)
    await AuditLog.update(
      { 
        details: null,
        user_agent: null 
      },
      { 
        where: { user_id: user.id } 
      }
    );

    // Deactivate user account
    await user.update({
      is_active: false,
      email: `deleted_${user.id}@deleted.local`,
      display_name: `Deleted User ${user.id}`,
      preferences: {},
      ldap_groups: []
    });

    logger.info(`User data deleted by admin`, {
      userId: user.id,
      originalUsername: user.username,
      adminId: req.user.id,
      adminUsername: req.user.username,
      filesDeleted: userFiles.length
    });

    res.json({
      message: 'User data deleted successfully',
      filesDeleted: userFiles.length
    });
  })
);

// System health check
router.get('/health',
  asyncHandler(async (req, res) => {
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      checks: {}
    };

    try {
      // Database check
      await User.findOne({ limit: 1 });
      health.checks.database = { status: 'healthy' };
    } catch (error) {
      health.checks.database = { status: 'unhealthy', error: error.message };
      health.status = 'unhealthy';
    }

    try {
      // Email service check
      await emailService.testConnection();
      health.checks.email = { status: 'healthy' };
    } catch (error) {
      health.checks.email = { status: 'unhealthy', error: error.message };
    }

    try {
      // Storage check
      const storageStats = await fileService.getStorageStats();
      health.checks.storage = { 
        status: 'healthy',
        stats: storageStats.formatted
      };
    } catch (error) {
      health.checks.storage = { status: 'unhealthy', error: error.message };
    }

    // Cleanup job check
    const cleanupStatus = cleanupJob.getStatus();
    health.checks.cleanup = {
      status: cleanupStatus.isScheduled ? 'healthy' : 'warning',
      isRunning: cleanupStatus.isRunning,
      nextRun: cleanupStatus.nextRun
    };

    res.json(health);
  })
);

module.exports = router;
