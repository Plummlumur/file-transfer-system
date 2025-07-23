const rateLimit = require('express-rate-limit');
const { AuditLog } = require('../models');
const logger = require('../utils/logger');

// Default rate limiter for general API endpoints
const defaultRateLimit = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100, // 100 requests per window
  message: {
    error: 'Too many requests from this IP, please try again later.',
    retryAfter: Math.ceil((parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000) / 1000)
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  handler: async (req, res) => {
    logger.warn('Rate limit exceeded', {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      path: req.path,
      method: req.method,
      userId: req.user?.id
    });

    // Log security event
    try {
      await AuditLog.logSecurityEvent(
        'RATE_LIMIT_EXCEEDED',
        req.user?.id || null,
        req.ip,
        req.get('User-Agent'),
        {
          path: req.path,
          method: req.method,
          limit: req.rateLimit.limit,
          current: req.rateLimit.current,
          remaining: req.rateLimit.remaining,
          resetTime: new Date(req.rateLimit.resetTime)
        }
      );
    } catch (error) {
      logger.error('Failed to log rate limit event:', error);
    }

    res.status(429).json({
      error: 'Too many requests from this IP, please try again later.',
      retryAfter: Math.ceil((parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000) / 1000),
      limit: req.rateLimit.limit,
      current: req.rateLimit.current,
      remaining: req.rateLimit.remaining,
      resetTime: new Date(req.rateLimit.resetTime)
    });
  },
  skip: (req) => {
    // Skip rate limiting for health checks
    return req.path === '/health' || req.path === '/api/v1/system/health';
  }
});

// Strict rate limiter for authentication endpoints
const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 login attempts per window
  message: {
    error: 'Too many login attempts from this IP, please try again later.',
    retryAfter: 15 * 60 // 15 minutes in seconds
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: async (req, res) => {
    logger.warn('Auth rate limit exceeded', {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      username: req.body?.username,
      path: req.path
    });

    // Log security event
    try {
      await AuditLog.logSecurityEvent(
        'AUTH_RATE_LIMIT_EXCEEDED',
        null,
        req.ip,
        req.get('User-Agent'),
        {
          username: req.body?.username,
          path: req.path,
          attempts: req.rateLimit.current
        }
      );
    } catch (error) {
      logger.error('Failed to log auth rate limit event:', error);
    }

    res.status(429).json({
      error: 'Too many login attempts from this IP, please try again later.',
      retryAfter: 15 * 60,
      message: 'Account temporarily locked due to multiple failed login attempts'
    });
  }
});

// Rate limiter for file upload endpoints
const uploadRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 50, // 50 uploads per hour
  message: {
    error: 'Too many file uploads from this IP, please try again later.',
    retryAfter: 60 * 60 // 1 hour in seconds
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: async (req, res) => {
    logger.warn('Upload rate limit exceeded', {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      userId: req.user?.id,
      path: req.path
    });

    // Log security event
    try {
      await AuditLog.logSecurityEvent(
        'UPLOAD_RATE_LIMIT_EXCEEDED',
        req.user?.id || null,
        req.ip,
        req.get('User-Agent'),
        {
          path: req.path,
          uploads: req.rateLimit.current
        }
      );
    } catch (error) {
      logger.error('Failed to log upload rate limit event:', error);
    }

    res.status(429).json({
      error: 'Too many file uploads from this IP, please try again later.',
      retryAfter: 60 * 60,
      message: 'Upload limit exceeded. Please wait before uploading more files.'
    });
  }
});

// Rate limiter for download endpoints
const downloadRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 downloads per window
  message: {
    error: 'Too many download requests from this IP, please try again later.',
    retryAfter: 15 * 60 // 15 minutes in seconds
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: async (req, res) => {
    logger.warn('Download rate limit exceeded', {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      path: req.path,
      token: req.params.token
    });

    // Log security event
    try {
      await AuditLog.logSecurityEvent(
        'DOWNLOAD_RATE_LIMIT_EXCEEDED',
        null,
        req.ip,
        req.get('User-Agent'),
        {
          path: req.path,
          token: req.params.token,
          downloads: req.rateLimit.current
        }
      );
    } catch (error) {
      logger.error('Failed to log download rate limit event:', error);
    }

    res.status(429).json({
      error: 'Too many download requests from this IP, please try again later.',
      retryAfter: 15 * 60
    });
  }
});

// Rate limiter for admin endpoints
const adminRateLimit = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 30, // 30 admin actions per window
  message: {
    error: 'Too many admin requests from this IP, please try again later.',
    retryAfter: 5 * 60 // 5 minutes in seconds
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: async (req, res) => {
    logger.warn('Admin rate limit exceeded', {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      userId: req.user?.id,
      path: req.path
    });

    // Log security event
    try {
      await AuditLog.logSecurityEvent(
        'ADMIN_RATE_LIMIT_EXCEEDED',
        req.user?.id || null,
        req.ip,
        req.get('User-Agent'),
        {
          path: req.path,
          actions: req.rateLimit.current
        }
      );
    } catch (error) {
      logger.error('Failed to log admin rate limit event:', error);
    }

    res.status(429).json({
      error: 'Too many admin requests from this IP, please try again later.',
      retryAfter: 5 * 60
    });
  }
});

// Custom rate limiter factory
const createRateLimit = (options = {}) => {
  const defaultOptions = {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100,
    message: {
      error: 'Too many requests, please try again later.'
    },
    standardHeaders: true,
    legacyHeaders: false
  };

  return rateLimit({
    ...defaultOptions,
    ...options,
    handler: async (req, res) => {
      logger.warn('Custom rate limit exceeded', {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        path: req.path,
        limit: options.max || defaultOptions.max
      });

      if (options.handler) {
        return options.handler(req, res);
      }

      res.status(429).json(options.message || defaultOptions.message);
    }
  });
};

// Per-user rate limiting (requires authentication)
const createUserRateLimit = (options = {}) => {
  return rateLimit({
    windowMs: options.windowMs || 15 * 60 * 1000,
    max: options.max || 50,
    keyGenerator: (req) => {
      // Use user ID if authenticated, otherwise fall back to IP
      return req.user?.id?.toString() || req.ip;
    },
    message: options.message || {
      error: 'Too many requests for this user, please try again later.'
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: async (req, res) => {
      logger.warn('User rate limit exceeded', {
        userId: req.user?.id,
        ip: req.ip,
        path: req.path,
        limit: options.max || 50
      });

      if (options.handler) {
        return options.handler(req, res);
      }

      res.status(429).json(options.message || {
        error: 'Too many requests for this user, please try again later.'
      });
    }
  });
};

module.exports = {
  defaultRateLimit,
  authRateLimit,
  uploadRateLimit,
  downloadRateLimit,
  adminRateLimit,
  createRateLimit,
  createUserRateLimit
};
