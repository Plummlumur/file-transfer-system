const { AuditLog } = require('../models');
const logger = require('../utils/logger');

// Middleware to log all requests for audit purposes
const auditLogger = (req, res, next) => {
  const startTime = Date.now();
  
  // Store original end function
  const originalEnd = res.end;
  
  // Override res.end to capture response details
  res.end = function(chunk, encoding) {
    const duration = Date.now() - startTime;
    
    // Call original end function
    originalEnd.call(this, chunk, encoding);
    
    // Log the request asynchronously (don't block response)
    setImmediate(() => {
      logRequest(req, res, duration);
    });
  };
  
  next();
};

const logRequest = async (req, res, duration) => {
  try {
    // Skip logging for certain endpoints to reduce noise
    const skipPaths = [
      '/health',
      '/api/v1/system/health',
      '/favicon.ico',
      '/static/',
      '/_next/',
      '/api/v1/files/track-email' // Email tracking pixels
    ];
    
    const shouldSkip = skipPaths.some(path => req.path.startsWith(path));
    if (shouldSkip) return;
    
    // Determine severity based on status code and method
    let severity = 'LOW';
    if (res.statusCode >= 500) {
      severity = 'HIGH';
    } else if (res.statusCode >= 400) {
      severity = 'MEDIUM';
    } else if (['POST', 'PUT', 'DELETE'].includes(req.method)) {
      severity = 'MEDIUM';
    }
    
    // Determine category based on path
    let category = 'SYSTEM';
    if (req.path.startsWith('/api/v1/auth')) {
      category = 'AUTH';
    } else if (req.path.startsWith('/api/v1/files')) {
      category = 'FILE';
    } else if (req.path.startsWith('/api/v1/admin')) {
      category = 'ADMIN';
    }
    
    // Extract relevant request details
    const details = {
      query: req.query,
      params: req.params,
      contentType: req.get('Content-Type'),
      contentLength: req.get('Content-Length'),
      referer: req.get('Referer'),
      origin: req.get('Origin')
    };
    
    // Don't log sensitive data
    if (req.body && !req.path.includes('/login')) {
      const sanitizedBody = { ...req.body };
      delete sanitizedBody.password;
      delete sanitizedBody.token;
      details.body = sanitizedBody;
    }
    
    // Create audit log entry
    await AuditLog.create({
      user_id: req.user?.id || null,
      action: `${req.method}_REQUEST`,
      category: category,
      ip_address: getClientIP(req),
      user_agent: req.get('User-Agent'),
      session_id: req.sessionID,
      request_method: req.method,
      request_url: req.originalUrl,
      status_code: res.statusCode,
      duration_ms: duration,
      details: details,
      severity: severity
    });
    
  } catch (error) {
    // Don't let audit logging errors break the application
    logger.error('Failed to create audit log:', error);
  }
};

// Helper function to get client IP address
const getClientIP = (req) => {
  return req.ip || 
         req.connection.remoteAddress || 
         req.socket.remoteAddress ||
         (req.connection.socket ? req.connection.socket.remoteAddress : null) ||
         req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
         req.headers['x-real-ip'] ||
         'unknown';
};

// Middleware to log specific actions with custom details
const logAction = (action, category = 'SYSTEM', severity = 'LOW') => {
  return (req, res, next) => {
    // Store action details for later logging
    req.auditAction = {
      action,
      category,
      severity,
      timestamp: Date.now()
    };
    next();
  };
};

// Middleware to log successful operations
const logSuccess = (action, resourceType = null, getResourceId = null) => {
  return (req, res, next) => {
    // Store original json function
    const originalJson = res.json;
    
    // Override res.json to capture successful responses
    res.json = function(data) {
      // Log the successful action
      setImmediate(async () => {
        try {
          const resourceId = getResourceId ? getResourceId(req, data) : null;
          
          await AuditLog.create({
            user_id: req.user?.id || null,
            action: action,
            category: req.auditAction?.category || 'SYSTEM',
            resource_type: resourceType,
            resource_id: resourceId,
            ip_address: getClientIP(req),
            user_agent: req.get('User-Agent'),
            details: {
              method: req.method,
              path: req.path,
              success: true
            },
            severity: req.auditAction?.severity || 'LOW'
          });
        } catch (error) {
          logger.error('Failed to log successful action:', error);
        }
      });
      
      // Call original json function
      originalJson.call(this, data);
    };
    
    next();
  };
};

// Middleware to log file operations
const logFileOperation = (action) => {
  return (req, res, next) => {
    res.on('finish', async () => {
      if (res.statusCode < 400) {
        try {
          const fileId = req.params.id || req.params.fileId || req.file?.filename;
          
          await AuditLog.logFileAction(
            action,
            req.user?.id,
            fileId,
            getClientIP(req),
            {
              method: req.method,
              path: req.path,
              statusCode: res.statusCode,
              filename: req.file?.originalname || req.body?.filename
            }
          );
        } catch (error) {
          logger.error('Failed to log file operation:', error);
        }
      }
    });
    next();
  };
};

// Middleware to log admin operations
const logAdminOperation = (action, resourceType) => {
  return (req, res, next) => {
    // Store original request body for comparison
    req.originalBody = { ...req.body };
    
    res.on('finish', async () => {
      if (res.statusCode < 400) {
        try {
          const resourceId = req.params.id || req.params.userId || req.params.settingKey;
          
          await AuditLog.logAdminAction(
            action,
            req.user?.id,
            resourceType,
            resourceId,
            req.originalBody, // old values
            req.body, // new values
            getClientIP(req)
          );
        } catch (error) {
          logger.error('Failed to log admin operation:', error);
        }
      }
    });
    next();
  };
};

// Middleware to log security events
const logSecurityEvent = (action, details = {}) => {
  return async (req, res, next) => {
    try {
      await AuditLog.logSecurityEvent(
        action,
        req.user?.id,
        getClientIP(req),
        req.get('User-Agent'),
        {
          ...details,
          path: req.path,
          method: req.method,
          timestamp: new Date().toISOString()
        }
      );
    } catch (error) {
      logger.error('Failed to log security event:', error);
    }
    next();
  };
};

module.exports = {
  auditLogger,
  logAction,
  logSuccess,
  logFileOperation,
  logAdminOperation,
  logSecurityEvent,
  getClientIP
};
