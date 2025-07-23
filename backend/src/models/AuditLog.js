const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const AuditLog = sequelize.define('AuditLog', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    user_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id'
      },
      comment: 'User who performed the action (null for system actions)'
    },
    action: {
      type: DataTypes.STRING(100),
      allowNull: false,
      comment: 'Action performed (e.g., LOGIN, UPLOAD, DOWNLOAD, DELETE)'
    },
    resource_type: {
      type: DataTypes.STRING(50),
      allowNull: true,
      comment: 'Type of resource affected (e.g., FILE, USER, SETTING)'
    },
    resource_id: {
      type: DataTypes.STRING(36),
      allowNull: true,
      comment: 'ID of the affected resource'
    },
    ip_address: {
      type: DataTypes.STRING(45),
      allowNull: true,
      comment: 'IP address of the client'
    },
    user_agent: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'User agent string from the request'
    },
    session_id: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: 'Session identifier'
    },
    request_method: {
      type: DataTypes.STRING(10),
      allowNull: true,
      comment: 'HTTP method used (GET, POST, PUT, DELETE)'
    },
    request_url: {
      type: DataTypes.STRING(500),
      allowNull: true,
      comment: 'Request URL path'
    },
    status_code: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'HTTP response status code'
    },
    duration_ms: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'Request duration in milliseconds'
    },
    details: {
      type: DataTypes.JSON,
      allowNull: true,
      comment: 'Additional details about the action'
    },
    old_values: {
      type: DataTypes.JSON,
      allowNull: true,
      comment: 'Previous values for update operations'
    },
    new_values: {
      type: DataTypes.JSON,
      allowNull: true,
      comment: 'New values for create/update operations'
    },
    error_message: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Error message if action failed'
    },
    severity: {
      type: DataTypes.ENUM('LOW', 'MEDIUM', 'HIGH', 'CRITICAL'),
      defaultValue: 'LOW',
      comment: 'Severity level of the action'
    },
    category: {
      type: DataTypes.ENUM('AUTH', 'FILE', 'ADMIN', 'SYSTEM', 'SECURITY'),
      allowNull: false,
      comment: 'Category of the action'
    },
    tags: {
      type: DataTypes.JSON,
      defaultValue: [],
      comment: 'Tags for categorizing and filtering logs'
    }
  }, {
    tableName: 'audit_logs',
    indexes: [
      {
        fields: ['user_id']
      },
      {
        fields: ['action']
      },
      {
        fields: ['resource_type']
      },
      {
        fields: ['resource_id']
      },
      {
        fields: ['ip_address']
      },
      {
        fields: ['created_at']
      },
      {
        fields: ['severity']
      },
      {
        fields: ['category']
      },
      {
        fields: ['status_code']
      },
      {
        name: 'idx_audit_logs_composite',
        fields: ['category', 'action', 'created_at']
      }
    ]
  });

  // Static methods for creating specific log entries
  AuditLog.logAuth = function(action, userId, ipAddress, userAgent, details = {}) {
    return this.create({
      user_id: userId,
      action,
      category: 'AUTH',
      ip_address: ipAddress,
      user_agent: userAgent,
      details,
      severity: action.includes('FAILED') ? 'HIGH' : 'LOW'
    });
  };

  AuditLog.logFileAction = function(action, userId, fileId, ipAddress, details = {}) {
    return this.create({
      user_id: userId,
      action,
      category: 'FILE',
      resource_type: 'FILE',
      resource_id: fileId,
      ip_address: ipAddress,
      details,
      severity: action === 'DELETE' ? 'MEDIUM' : 'LOW'
    });
  };

  AuditLog.logAdminAction = function(action, userId, resourceType, resourceId, oldValues, newValues, ipAddress) {
    return this.create({
      user_id: userId,
      action,
      category: 'ADMIN',
      resource_type: resourceType,
      resource_id: resourceId,
      old_values: oldValues,
      new_values: newValues,
      ip_address: ipAddress,
      severity: 'HIGH'
    });
  };

  AuditLog.logSystemAction = function(action, details = {}) {
    return this.create({
      action,
      category: 'SYSTEM',
      details,
      severity: 'MEDIUM'
    });
  };

  AuditLog.logSecurityEvent = function(action, userId, ipAddress, userAgent, details = {}) {
    return this.create({
      user_id: userId,
      action,
      category: 'SECURITY',
      ip_address: ipAddress,
      user_agent: userAgent,
      details,
      severity: 'CRITICAL'
    });
  };

  AuditLog.logRequest = function(req, res, duration, userId = null) {
    const statusCode = res.statusCode;
    let severity = 'LOW';
    
    if (statusCode >= 500) severity = 'HIGH';
    else if (statusCode >= 400) severity = 'MEDIUM';
    
    return this.create({
      user_id: userId,
      action: 'HTTP_REQUEST',
      category: 'SYSTEM',
      ip_address: req.ip || req.connection.remoteAddress,
      user_agent: req.get('User-Agent'),
      request_method: req.method,
      request_url: req.originalUrl,
      status_code: statusCode,
      duration_ms: duration,
      severity
    });
  };

  // Instance methods
  AuditLog.prototype.toJSON = function() {
    const values = { ...this.get() };
    return values;
  };

  AuditLog.prototype.isSecurityEvent = function() {
    return this.category === 'SECURITY' || this.severity === 'CRITICAL';
  };

  AuditLog.prototype.isError = function() {
    return this.status_code >= 400 || this.error_message !== null;
  };

  AuditLog.prototype.getFormattedDuration = function() {
    if (!this.duration_ms) return null;
    
    if (this.duration_ms < 1000) {
      return `${this.duration_ms}ms`;
    } else {
      return `${(this.duration_ms / 1000).toFixed(2)}s`;
    }
  };

  AuditLog.prototype.getSeverityColor = function() {
    const colors = {
      LOW: '#52c41a',
      MEDIUM: '#faad14',
      HIGH: '#fa8c16',
      CRITICAL: '#f5222d'
    };
    return colors[this.severity] || '#d9d9d9';
  };

  AuditLog.prototype.getCategoryIcon = function() {
    const icons = {
      AUTH: 'user',
      FILE: 'file',
      ADMIN: 'setting',
      SYSTEM: 'desktop',
      SECURITY: 'shield'
    };
    return icons[this.category] || 'info-circle';
  };

  return AuditLog;
};
