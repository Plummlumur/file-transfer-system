const express = require('express');
const { query, validationResult } = require('express-validator');
const { optionalAuth } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const { SystemSetting } = require('../models');
const logger = require('../utils/logger');
const packageJson = require('../../package.json');

const router = express.Router();

// Public system information
router.get('/info',
  asyncHandler(async (req, res) => {
    const systemName = await SystemSetting.getSetting('SYSTEM_NAME', 'File Transfer System');
    const logoUrl = await SystemSetting.getSetting('SYSTEM_LOGO_URL', null);
    const maintenanceMode = await SystemSetting.getSetting('MAINTENANCE_MODE', false);
    const maxFileSize = await SystemSetting.getSetting('MAX_FILE_SIZE', 5368709120);
    const allowedExtensions = await SystemSetting.getSetting('ALLOWED_EXTENSIONS', []);
    const sessionTimeout = await SystemSetting.getSetting('SESSION_TIMEOUT_MINUTES', 480);

    res.json({
      name: systemName,
      version: packageJson.version,
      logoUrl,
      maintenanceMode,
      maxFileSize,
      allowedExtensions,
      sessionTimeout,
      features: {
        ldapAuth: true,
        resumableUploads: true,
        emailNotifications: true,
        auditLogging: true,
        adminPanel: true
      }
    });
  })
);

// System health check
router.get('/health',
  asyncHandler(async (req, res) => {
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: packageJson.version,
      environment: process.env.NODE_ENV || 'development'
    };

    // Basic checks
    const checks = {};

    try {
      // Database connectivity check
      const { sequelize } = require('../models');
      await sequelize.authenticate();
      checks.database = { status: 'healthy', responseTime: Date.now() };
    } catch (error) {
      checks.database = { status: 'unhealthy', error: error.message };
      health.status = 'unhealthy';
    }

    try {
      // File system check
      const fs = require('fs').promises;
      const uploadDir = process.env.UPLOAD_DIR || './uploads';
      await fs.access(uploadDir);
      checks.filesystem = { status: 'healthy' };
    } catch (error) {
      checks.filesystem = { status: 'unhealthy', error: error.message };
      health.status = 'degraded';
    }

    // Memory usage
    const memUsage = process.memoryUsage();
    checks.memory = {
      status: memUsage.heapUsed < 1024 * 1024 * 1024 ? 'healthy' : 'warning', // 1GB threshold
      heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024) + 'MB',
      heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024) + 'MB',
      external: Math.round(memUsage.external / 1024 / 1024) + 'MB'
    };

    health.checks = checks;

    // Set appropriate status code
    const statusCode = health.status === 'healthy' ? 200 : 
                      health.status === 'degraded' ? 200 : 503;

    res.status(statusCode).json(health);
  })
);

// Public settings (non-sensitive)
router.get('/settings',
  asyncHandler(async (req, res) => {
    const publicSettings = await SystemSetting.getPublicSettings();
    
    const settings = {};
    publicSettings.forEach(setting => {
      settings[setting.key_name] = setting.value;
    });

    res.json(settings);
  })
);

// Privacy policy
router.get('/privacy-policy',
  asyncHandler(async (req, res) => {
    const privacyPolicy = await SystemSetting.getSetting('PRIVACY_POLICY', 
      'Diese Anwendung verarbeitet Ihre Daten gemäß der DSGVO. Weitere Informationen erhalten Sie von Ihrem Administrator.'
    );

    res.json({
      policy: privacyPolicy,
      lastUpdated: new Date().toISOString()
    });
  })
);

// System statistics (public, limited)
router.get('/stats',
  optionalAuth,
  [
    query('period').optional().isIn(['day', 'week', 'month']).withMessage('Invalid period')
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const period = req.query.period || 'week';
    const { File, FileRecipient } = require('../models');
    const { Op } = require('sequelize');

    const periodMap = {
      day: 24,
      week: 7 * 24,
      month: 30 * 24
    };

    const hours = periodMap[period];
    const startDate = new Date(Date.now() - (hours * 60 * 60 * 1000));

    // Public statistics (aggregated, no sensitive data)
    const stats = await Promise.all([
      // Total files uploaded in period
      File.count({
        where: {
          upload_date: { [Op.gte]: startDate },
          status: { [Op.ne]: 'deleted' }
        }
      }),

      // Total downloads in period
      FileRecipient.count({
        where: {
          downloaded_at: { 
            [Op.gte]: startDate,
            [Op.ne]: null
          }
        }
      }),

      // Total file size in period
      File.sum('file_size', {
        where: {
          upload_date: { [Op.gte]: startDate },
          status: { [Op.ne]: 'deleted' }
        }
      })
    ]);

    const [totalFiles, totalDownloads, totalSize] = stats;

    res.json({
      period,
      stats: {
        totalFiles: totalFiles || 0,
        totalDownloads: totalDownloads || 0,
        totalSize: totalSize || 0,
        formattedSize: formatBytes(totalSize || 0)
      },
      generatedAt: new Date().toISOString()
    });
  })
);

// System capabilities
router.get('/capabilities',
  asyncHandler(async (req, res) => {
    const maxFileSize = await SystemSetting.getSetting('MAX_FILE_SIZE', 5368709120);
    const allowedExtensions = await SystemSetting.getSetting('ALLOWED_EXTENSIONS', []);
    const maxDownloads = await SystemSetting.getSetting('MAX_DOWNLOADS_PER_FILE', 1);
    const defaultRetention = await SystemSetting.getSetting('DEFAULT_FILE_RETENTION_DAYS', 14);

    res.json({
      upload: {
        maxFileSize,
        formattedMaxSize: formatBytes(maxFileSize),
        allowedExtensions,
        resumableUploads: true,
        chunkSize: 1024 * 1024, // 1MB chunks
        maxConcurrentUploads: 3
      },
      download: {
        maxDownloadsPerFile: maxDownloads,
        supportedMethods: ['direct', 'token-based'],
        resumableDownloads: true
      },
      retention: {
        defaultDays: defaultRetention,
        minDays: 1,
        maxDays: 365
      },
      notifications: {
        email: true,
        downloadNotifications: true,
        expiryWarnings: true
      },
      security: {
        ldapAuthentication: true,
        auditLogging: true,
        encryptionAtRest: false, // Can be enabled in future
        encryptionInTransit: true
      }
    });
  })
);

// Server time (for client synchronization)
router.get('/time',
  asyncHandler(async (req, res) => {
    res.json({
      timestamp: new Date().toISOString(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      unixTimestamp: Math.floor(Date.now() / 1000)
    });
  })
);

// System status for monitoring
router.get('/status',
  asyncHandler(async (req, res) => {
    const maintenanceMode = await SystemSetting.getSetting('MAINTENANCE_MODE', false);
    
    if (maintenanceMode) {
      return res.status(503).json({
        status: 'maintenance',
        message: 'System is currently under maintenance',
        timestamp: new Date().toISOString()
      });
    }

    res.json({
      status: 'operational',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: packageJson.version
    });
  })
);

// API version information
router.get('/version',
  asyncHandler(async (req, res) => {
    res.json({
      api: {
        version: 'v1',
        build: packageJson.version,
        releaseDate: '2024-01-01', // Would be set during build
        compatibility: {
          minClientVersion: '1.0.0',
          deprecatedFeatures: [],
          newFeatures: [
            'resumable-uploads',
            'bulk-operations',
            'advanced-audit-logging'
          ]
        }
      },
      server: {
        name: packageJson.name,
        version: packageJson.version,
        node: process.version,
        platform: process.platform,
        arch: process.arch
      }
    });
  })
);

// Rate limit information
router.get('/limits',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const limits = {
      upload: {
        maxFileSize: await SystemSetting.getSetting('MAX_FILE_SIZE', 5368709120),
        maxFilesPerHour: 50,
        maxFilesPerDay: 200
      },
      download: {
        maxDownloadsPerHour: 100,
        maxConcurrentDownloads: 5
      },
      api: {
        requestsPerMinute: 100,
        requestsPerHour: 1000
      }
    };

    // Add user-specific limits if authenticated
    if (req.user) {
      limits.user = {
        dailyQuota: req.user.upload_quota_daily,
        monthlyQuota: req.user.upload_quota_monthly,
        dailyUsed: req.user.upload_used_daily,
        monthlyUsed: req.user.upload_used_monthly,
        quotaStatus: req.user.getUploadQuotaStatus()
      };
    }

    res.json(limits);
  })
);

// Supported file types with descriptions
router.get('/file-types',
  asyncHandler(async (req, res) => {
    const allowedExtensions = await SystemSetting.getSetting('ALLOWED_EXTENSIONS', []);
    
    const fileTypeDescriptions = {
      // Documents
      'pdf': { category: 'document', description: 'PDF Document', icon: '📄' },
      'doc': { category: 'document', description: 'Microsoft Word Document', icon: '📝' },
      'docx': { category: 'document', description: 'Microsoft Word Document', icon: '📝' },
      'xls': { category: 'spreadsheet', description: 'Microsoft Excel Spreadsheet', icon: '📊' },
      'xlsx': { category: 'spreadsheet', description: 'Microsoft Excel Spreadsheet', icon: '📊' },
      'ppt': { category: 'presentation', description: 'Microsoft PowerPoint Presentation', icon: '📽️' },
      'pptx': { category: 'presentation', description: 'Microsoft PowerPoint Presentation', icon: '📽️' },
      'txt': { category: 'text', description: 'Text File', icon: '📄' },
      
      // Archives
      'zip': { category: 'archive', description: 'ZIP Archive', icon: '🗜️' },
      'rar': { category: 'archive', description: 'RAR Archive', icon: '🗜️' },
      
      // Images
      'jpg': { category: 'image', description: 'JPEG Image', icon: '🖼️' },
      'jpeg': { category: 'image', description: 'JPEG Image', icon: '🖼️' },
      'png': { category: 'image', description: 'PNG Image', icon: '🖼️' },
      'gif': { category: 'image', description: 'GIF Image', icon: '🖼️' },
      
      // Videos
      'mp4': { category: 'video', description: 'MP4 Video', icon: '🎥' },
      'avi': { category: 'video', description: 'AVI Video', icon: '🎥' },
      'mov': { category: 'video', description: 'QuickTime Video', icon: '🎥' }
    };

    const supportedTypes = allowedExtensions.map(ext => ({
      extension: ext,
      ...fileTypeDescriptions[ext] || { 
        category: 'other', 
        description: `${ext.toUpperCase()} File`, 
        icon: '📎' 
      }
    }));

    // Group by category
    const groupedTypes = supportedTypes.reduce((acc, type) => {
      if (!acc[type.category]) {
        acc[type.category] = [];
      }
      acc[type.category].push(type);
      return acc;
    }, {});

    res.json({
      supportedTypes,
      groupedTypes,
      totalTypes: supportedTypes.length,
      maxFileSize: await SystemSetting.getSetting('MAX_FILE_SIZE', 5368709120),
      formattedMaxSize: formatBytes(await SystemSetting.getSetting('MAX_FILE_SIZE', 5368709120))
    });
  })
);

// Utility function to format bytes
function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

module.exports = router;
