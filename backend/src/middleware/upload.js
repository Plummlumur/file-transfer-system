const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');
const { SystemSetting } = require('../models');
const logger = require('../utils/logger');

// Create upload directory if it doesn't exist
const createUploadDir = async (dir) => {
  try {
    await fs.access(dir);
  } catch {
    await fs.mkdir(dir, { recursive: true });
  }
};

// Generate unique filename
const generateFilename = (originalname) => {
  const timestamp = Date.now();
  const random = crypto.randomBytes(8).toString('hex');
  const ext = path.extname(originalname);
  const basename = path.basename(originalname, ext);
  
  // Sanitize basename
  const sanitizedBasename = basename
    .replace(/[^a-zA-Z0-9\-_\s]/g, '')
    .replace(/\s+/g, '_')
    .substring(0, 100);
  
  return `${timestamp}_${random}_${sanitizedBasename}${ext}`;
};

// Generate file path based on date
const generateFilePath = (filename) => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  
  return path.join(year.toString(), month, day, filename);
};

// Multer storage configuration
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    try {
      const uploadDir = process.env.UPLOAD_DIR || './uploads';
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      
      const fullPath = path.join(uploadDir, year.toString(), month, day);
      await createUploadDir(fullPath);
      
      cb(null, fullPath);
    } catch (error) {
      logger.error('Error creating upload directory:', error);
      cb(error);
    }
  },
  filename: (req, file, cb) => {
    try {
      const filename = generateFilename(file.originalname);
      cb(null, filename);
    } catch (error) {
      logger.error('Error generating filename:', error);
      cb(error);
    }
  }
});

// File filter function
const fileFilter = async (req, file, cb) => {
  try {
    // Get allowed extensions from system settings
    const allowedExtensions = await SystemSetting.getSetting('ALLOWED_EXTENSIONS', []);
    
    if (allowedExtensions.length === 0) {
      // If no extensions are configured, reject all files
      return cb(new Error('File uploads are currently disabled'), false);
    }
    
    const fileExtension = path.extname(file.originalname).toLowerCase().substring(1);
    
    if (!allowedExtensions.includes(fileExtension)) {
      const error = new Error(`File type .${fileExtension} is not allowed. Allowed types: ${allowedExtensions.join(', ')}`);
      error.code = 'INVALID_FILE_TYPE';
      return cb(error, false);
    }
    
    // Additional MIME type validation
    const allowedMimeTypes = {
      'pdf': ['application/pdf'],
      'doc': ['application/msword'],
      'docx': ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
      'xls': ['application/vnd.ms-excel'],
      'xlsx': ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
      'ppt': ['application/vnd.ms-powerpoint'],
      'pptx': ['application/vnd.openxmlformats-officedocument.presentationml.presentation'],
      'txt': ['text/plain'],
      'zip': ['application/zip', 'application/x-zip-compressed'],
      'rar': ['application/vnd.rar', 'application/x-rar-compressed'],
      'jpg': ['image/jpeg'],
      'jpeg': ['image/jpeg'],
      'png': ['image/png'],
      'gif': ['image/gif'],
      'mp4': ['video/mp4'],
      'avi': ['video/x-msvideo'],
      'mov': ['video/quicktime']
    };
    
    const expectedMimeTypes = allowedMimeTypes[fileExtension];
    if (expectedMimeTypes && !expectedMimeTypes.includes(file.mimetype)) {
      const error = new Error(`MIME type ${file.mimetype} does not match file extension .${fileExtension}`);
      error.code = 'MIME_TYPE_MISMATCH';
      return cb(error, false);
    }
    
    cb(null, true);
  } catch (error) {
    logger.error('Error in file filter:', error);
    cb(error, false);
  }
};

// Create multer instance
const createUploadMiddleware = () => {
  return multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
      fileSize: parseInt(process.env.MAX_FILE_SIZE) || 5368709120, // 5GB default
      files: 10, // Maximum 10 files per request
      fields: 20, // Maximum 20 non-file fields
      fieldNameSize: 100, // Maximum field name size
      fieldSize: 1024 * 1024 // Maximum field value size (1MB)
    }
  });
};

// Single file upload middleware
const uploadSingle = (fieldName = 'file') => {
  const upload = createUploadMiddleware();
  
  return async (req, res, next) => {
    try {
      // Check user quota before upload
      if (req.user) {
        const maxFileSize = await SystemSetting.getSetting('MAX_FILE_SIZE', 5368709120);
        
        if (!req.user.canUpload(maxFileSize)) {
          return res.status(413).json({
            error: 'Upload quota exceeded',
            quota: req.user.getUploadQuotaStatus()
          });
        }
      }
      
      upload.single(fieldName)(req, res, (err) => {
        if (err) {
          logger.error('File upload error:', err);
          
          if (err instanceof multer.MulterError) {
            switch (err.code) {
              case 'LIMIT_FILE_SIZE':
                return res.status(413).json({
                  error: 'File too large',
                  maxSize: parseInt(process.env.MAX_FILE_SIZE) || 5368709120
                });
              case 'LIMIT_FILE_COUNT':
                return res.status(400).json({
                  error: 'Too many files'
                });
              case 'LIMIT_UNEXPECTED_FILE':
                return res.status(400).json({
                  error: 'Unexpected file field'
                });
              default:
                return res.status(400).json({
                  error: 'File upload error',
                  details: err.message
                });
            }
          }
          
          if (err.code === 'INVALID_FILE_TYPE' || err.code === 'MIME_TYPE_MISMATCH') {
            return res.status(400).json({
              error: err.message
            });
          }
          
          return res.status(500).json({
            error: 'Upload processing error'
          });
        }
        
        next();
      });
    } catch (error) {
      logger.error('Upload middleware error:', error);
      res.status(500).json({
        error: 'Upload processing error'
      });
    }
  };
};

// Multiple files upload middleware
const uploadMultiple = (fieldName = 'files', maxCount = 10) => {
  const upload = createUploadMiddleware();
  
  return async (req, res, next) => {
    try {
      // Check user quota before upload
      if (req.user) {
        const maxFileSize = await SystemSetting.getSetting('MAX_FILE_SIZE', 5368709120);
        
        if (!req.user.canUpload(maxFileSize * maxCount)) {
          return res.status(413).json({
            error: 'Upload quota would be exceeded',
            quota: req.user.getUploadQuotaStatus()
          });
        }
      }
      
      upload.array(fieldName, maxCount)(req, res, (err) => {
        if (err) {
          logger.error('Multiple file upload error:', err);
          
          if (err instanceof multer.MulterError) {
            switch (err.code) {
              case 'LIMIT_FILE_SIZE':
                return res.status(413).json({
                  error: 'One or more files are too large',
                  maxSize: parseInt(process.env.MAX_FILE_SIZE) || 5368709120
                });
              case 'LIMIT_FILE_COUNT':
                return res.status(400).json({
                  error: `Too many files. Maximum ${maxCount} files allowed`
                });
              default:
                return res.status(400).json({
                  error: 'File upload error',
                  details: err.message
                });
            }
          }
          
          return res.status(500).json({
            error: 'Upload processing error'
          });
        }
        
        next();
      });
    } catch (error) {
      logger.error('Multiple upload middleware error:', error);
      res.status(500).json({
        error: 'Upload processing error'
      });
    }
  };
};

// Chunked upload middleware for resumable uploads
const uploadChunk = () => {
  return async (req, res, next) => {
    try {
      const { chunkNumber, totalChunks, filename, fileId } = req.body;
      
      if (!chunkNumber || !totalChunks || !filename || !fileId) {
        return res.status(400).json({
          error: 'Missing required chunk parameters'
        });
      }
      
      const uploadDir = process.env.UPLOAD_DIR || './uploads';
      const tempDir = path.join(uploadDir, 'temp', fileId);
      
      await createUploadDir(tempDir);
      
      // Configure multer for chunk upload
      const chunkStorage = multer.diskStorage({
        destination: tempDir,
        filename: (req, file, cb) => {
          cb(null, `chunk_${chunkNumber}`);
        }
      });
      
      const chunkUpload = multer({
        storage: chunkStorage,
        limits: {
          fileSize: 10 * 1024 * 1024 // 10MB per chunk
        }
      });
      
      chunkUpload.single('chunk')(req, res, (err) => {
        if (err) {
          logger.error('Chunk upload error:', err);
          return res.status(400).json({
            error: 'Chunk upload failed',
            details: err.message
          });
        }
        
        req.chunkInfo = {
          chunkNumber: parseInt(chunkNumber),
          totalChunks: parseInt(totalChunks),
          filename,
          fileId,
          tempDir
        };
        
        next();
      });
    } catch (error) {
      logger.error('Chunk upload middleware error:', error);
      res.status(500).json({
        error: 'Chunk processing error'
      });
    }
  };
};

// Utility function to combine chunks
const combineChunks = async (tempDir, filename, totalChunks) => {
  try {
    const uploadDir = process.env.UPLOAD_DIR || './uploads';
    const finalPath = path.join(uploadDir, generateFilePath(filename));
    const finalDir = path.dirname(finalPath);
    
    await createUploadDir(finalDir);
    
    const writeStream = require('fs').createWriteStream(finalPath);
    
    for (let i = 1; i <= totalChunks; i++) {
      const chunkPath = path.join(tempDir, `chunk_${i}`);
      const chunkData = await fs.readFile(chunkPath);
      writeStream.write(chunkData);
      await fs.unlink(chunkPath); // Delete chunk after combining
    }
    
    writeStream.end();
    
    // Clean up temp directory
    await fs.rmdir(tempDir, { recursive: true });
    
    return finalPath;
  } catch (error) {
    logger.error('Error combining chunks:', error);
    throw error;
  }
};

// Middleware to validate file after upload
const validateUploadedFile = async (req, res, next) => {
  try {
    if (!req.file && !req.files) {
      return res.status(400).json({
        error: 'No file uploaded'
      });
    }
    
    const files = req.files || [req.file];
    
    for (const file of files) {
      // Verify file exists
      try {
        await fs.access(file.path);
      } catch {
        return res.status(500).json({
          error: 'Uploaded file not found'
        });
      }
      
      // Get file stats
      const stats = await fs.stat(file.path);
      file.actualSize = stats.size;
      
      // Verify file size matches
      if (Math.abs(file.size - file.actualSize) > 1024) { // Allow 1KB difference
        logger.warn('File size mismatch:', {
          reported: file.size,
          actual: file.actualSize,
          filename: file.originalname
        });
      }
    }
    
    next();
  } catch (error) {
    logger.error('File validation error:', error);
    res.status(500).json({
      error: 'File validation failed'
    });
  }
};

module.exports = {
  uploadSingle,
  uploadMultiple,
  uploadChunk,
  combineChunks,
  validateUploadedFile,
  generateFilename,
  generateFilePath,
  createUploadDir
};
