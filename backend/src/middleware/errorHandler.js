const logger = require('../utils/logger');
const { AuditLog } = require('../models');

const errorHandler = (err, req, res, next) => {
  // Log the error
  logger.error('Error occurred:', {
    error: err.message,
    stack: err.stack,
    url: req.originalUrl,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    userId: req.user?.id
  });

  // Log to audit trail for security-related errors
  if (err.name === 'UnauthorizedError' || err.status === 401 || err.status === 403) {
    AuditLog.logSecurityEvent(
      'SECURITY_ERROR',
      req.user?.id,
      req.ip,
      req.get('User-Agent'),
      {
        error: err.message,
        path: req.path,
        method: req.method
      }
    ).catch(auditErr => {
      logger.error('Failed to log security event:', auditErr);
    });
  }

  // Default error status
  let status = err.status || err.statusCode || 500;
  let message = err.message || 'Internal Server Error';

  // Handle specific error types
  switch (err.name) {
    case 'ValidationError':
      status = 400;
      message = 'Validation Error';
      break;
    case 'SequelizeValidationError':
      status = 400;
      message = 'Database Validation Error';
      break;
    case 'SequelizeUniqueConstraintError':
      status = 409;
      message = 'Resource already exists';
      break;
    case 'SequelizeForeignKeyConstraintError':
      status = 400;
      message = 'Invalid reference';
      break;
    case 'MulterError':
      status = 400;
      if (err.code === 'LIMIT_FILE_SIZE') {
        message = 'File too large';
      } else if (err.code === 'LIMIT_FILE_COUNT') {
        message = 'Too many files';
      } else if (err.code === 'LIMIT_UNEXPECTED_FILE') {
        message = 'Unexpected file field';
      } else {
        message = 'File upload error';
      }
      break;
    case 'JsonWebTokenError':
      status = 401;
      message = 'Invalid token';
      break;
    case 'TokenExpiredError':
      status = 401;
      message = 'Token expired';
      break;
    case 'SyntaxError':
      if (err.message.includes('JSON')) {
        status = 400;
        message = 'Invalid JSON';
      }
      break;
  }

  // Prepare error response
  const errorResponse = {
    error: message,
    status: status,
    timestamp: new Date().toISOString()
  };

  // Add additional details in development
  if (process.env.NODE_ENV === 'development') {
    errorResponse.details = {
      name: err.name,
      message: err.message,
      stack: err.stack
    };
  }

  // Add validation details for validation errors
  if (err.name === 'SequelizeValidationError' && err.errors) {
    errorResponse.validationErrors = err.errors.map(e => ({
      field: e.path,
      message: e.message,
      value: e.value
    }));
  }

  // Send error response
  res.status(status).json(errorResponse);
};

// Async error wrapper
const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

// Not found handler
const notFoundHandler = (req, res) => {
  const message = `Route ${req.originalUrl} not found`;
  logger.warn(message, {
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });

  res.status(404).json({
    error: 'Not Found',
    message: message,
    status: 404,
    timestamp: new Date().toISOString()
  });
};

module.exports = {
  errorHandler,
  asyncHandler,
  notFoundHandler
};
