const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const path = require('path');

// Create logs directory if it doesn't exist
const logDir = process.env.LOG_DIR || './logs';
require('fs').mkdirSync(logDir, { recursive: true });

// Define log levels
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4
};

// Define colors for each level
const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'white'
};

// Tell winston that you want to link the colors
winston.addColors(colors);

// Define log format
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.prettyPrint()
);

// Define console format for development
const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.colorize({ all: true }),
  winston.format.printf(
    (info) => `${info.timestamp} ${info.level}: ${info.message}${info.stack ? '\n' + info.stack : ''}`
  )
);

// Create transports array
const transports = [];

// Console transport for development
if (process.env.NODE_ENV === 'development') {
  transports.push(
    new winston.transports.Console({
      level: 'debug',
      format: consoleFormat
    })
  );
} else {
  // Console transport for production (less verbose)
  transports.push(
    new winston.transports.Console({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      )
    })
  );
}

// File transport for all logs
transports.push(
  new DailyRotateFile({
    filename: path.join(logDir, 'application-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    zippedArchive: true,
    maxSize: process.env.LOG_MAX_SIZE || '20m',
    maxFiles: process.env.LOG_MAX_FILES || '30d',
    level: process.env.LOG_LEVEL || 'info',
    format: logFormat
  })
);

// Separate file transport for errors
transports.push(
  new DailyRotateFile({
    filename: path.join(logDir, 'error-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    zippedArchive: true,
    maxSize: process.env.LOG_MAX_SIZE || '20m',
    maxFiles: process.env.LOG_MAX_FILES || '30d',
    level: 'error',
    format: logFormat
  })
);

// Separate file transport for HTTP requests
transports.push(
  new DailyRotateFile({
    filename: path.join(logDir, 'http-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    zippedArchive: true,
    maxSize: process.env.LOG_MAX_SIZE || '20m',
    maxFiles: process.env.LOG_MAX_FILES || '14d',
    level: 'http',
    format: logFormat
  })
);

// Separate file transport for security events
transports.push(
  new DailyRotateFile({
    filename: path.join(logDir, 'security-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    zippedArchive: true,
    maxSize: process.env.LOG_MAX_SIZE || '20m',
    maxFiles: process.env.LOG_MAX_FILES || '90d',
    level: 'warn',
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.json(),
      winston.format.printf((info) => {
        // Only log security-related events to this file
        if (info.message && (
          info.message.includes('security') ||
          info.message.includes('auth') ||
          info.message.includes('unauthorized') ||
          info.message.includes('forbidden') ||
          info.tags?.includes('security')
        )) {
          return JSON.stringify(info);
        }
        return false;
      })
    )
  })
);

// Create the logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  levels,
  format: logFormat,
  transports,
  exitOnError: false
});

// Handle uncaught exceptions and unhandled rejections
logger.exceptions.handle(
  new DailyRotateFile({
    filename: path.join(logDir, 'exceptions-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    zippedArchive: true,
    maxSize: '20m',
    maxFiles: '30d',
    format: logFormat
  })
);

logger.rejections.handle(
  new DailyRotateFile({
    filename: path.join(logDir, 'rejections-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    zippedArchive: true,
    maxSize: '20m',
    maxFiles: '30d',
    format: logFormat
  })
);

// Add custom methods for specific log types
logger.security = (message, meta = {}) => {
  logger.warn(message, { ...meta, tags: ['security'] });
};

logger.audit = (message, meta = {}) => {
  logger.info(message, { ...meta, tags: ['audit'] });
};

logger.performance = (message, meta = {}) => {
  logger.info(message, { ...meta, tags: ['performance'] });
};

logger.http = (message, meta = {}) => {
  logger.log('http', message, meta);
};

// Add method to change log level dynamically
logger.setLevel = (level) => {
  logger.level = level;
  logger.transports.forEach(transport => {
    if (transport.level !== 'error') { // Don't change error log level
      transport.level = level;
    }
  });
  logger.info(`Log level changed to: ${level}`);
};

// Add method to get current configuration
logger.getConfig = () => {
  return {
    level: logger.level,
    transports: logger.transports.map(t => ({
      type: t.constructor.name,
      level: t.level,
      filename: t.filename
    }))
  };
};

// Add method to flush logs (useful for testing)
logger.flush = () => {
  return new Promise((resolve) => {
    let pending = 0;
    
    logger.transports.forEach(transport => {
      if (transport.close) {
        pending++;
        transport.close(() => {
          pending--;
          if (pending === 0) resolve();
        });
      }
    });
    
    if (pending === 0) resolve();
  });
};

// Log startup information
logger.info('Logger initialized', {
  level: logger.level,
  logDir: logDir,
  nodeEnv: process.env.NODE_ENV,
  transports: logger.transports.length
});

module.exports = logger;
