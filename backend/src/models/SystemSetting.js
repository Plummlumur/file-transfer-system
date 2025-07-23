const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const SystemSetting = sequelize.define('SystemSetting', {
    key_name: {
      type: DataTypes.STRING(100),
      primaryKey: true,
      allowNull: false,
      validate: {
        notEmpty: true,
        is: /^[A-Z_][A-Z0-9_]*$/i // Only alphanumeric and underscore, starting with letter or underscore
      }
    },
    value: {
      type: DataTypes.JSON,
      allowNull: false,
      comment: 'Setting value stored as JSON'
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Human-readable description of the setting'
    },
    category: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: 'GENERAL',
      comment: 'Category for grouping settings'
    },
    data_type: {
      type: DataTypes.ENUM('STRING', 'NUMBER', 'BOOLEAN', 'JSON', 'ARRAY'),
      allowNull: false,
      defaultValue: 'STRING',
      comment: 'Expected data type for validation'
    },
    is_public: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      comment: 'Whether this setting can be read by non-admin users'
    },
    is_readonly: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      comment: 'Whether this setting can be modified through the UI'
    },
    validation_rules: {
      type: DataTypes.JSON,
      allowNull: true,
      comment: 'Validation rules for the setting value'
    },
    default_value: {
      type: DataTypes.JSON,
      allowNull: true,
      comment: 'Default value for the setting'
    },
    updated_by: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    version: {
      type: DataTypes.INTEGER,
      defaultValue: 1,
      comment: 'Version number for optimistic locking'
    }
  }, {
    tableName: 'system_settings',
    indexes: [
      {
        fields: ['category']
      },
      {
        fields: ['is_public']
      },
      {
        fields: ['updated_at']
      },
      {
        fields: ['updated_by']
      }
    ],
    hooks: {
      beforeUpdate: (setting) => {
        // Increment version for optimistic locking
        setting.version += 1;
      }
    }
  });

  // Static methods for common settings operations
  SystemSetting.getSetting = async function(key, defaultValue = null) {
    try {
      const setting = await this.findByPk(key);
      return setting ? setting.value : defaultValue;
    } catch (error) {
      return defaultValue;
    }
  };

  SystemSetting.setSetting = async function(key, value, userId = null, description = null) {
    const [setting, created] = await this.findOrCreate({
      where: { key_name: key },
      defaults: {
        key_name: key,
        value,
        description,
        updated_by: userId
      }
    });

    if (!created) {
      setting.value = value;
      setting.updated_by = userId;
      if (description) setting.description = description;
      await setting.save();
    }

    return setting;
  };

  SystemSetting.getSettingsByCategory = async function(category, includePrivate = false) {
    const where = { category };
    if (!includePrivate) {
      where.is_public = true;
    }

    return await this.findAll({
      where,
      order: [['key_name', 'ASC']]
    });
  };

  SystemSetting.getPublicSettings = async function() {
    return await this.findAll({
      where: { is_public: true },
      attributes: ['key_name', 'value', 'description', 'category'],
      order: [['category', 'ASC'], ['key_name', 'ASC']]
    });
  };

  SystemSetting.initializeDefaults = async function() {
    const defaults = [
      // File Upload Settings
      {
        key_name: 'MAX_FILE_SIZE',
        value: 5368709120, // 5GB
        description: 'Maximum file size in bytes',
        category: 'UPLOAD',
        data_type: 'NUMBER',
        is_public: true
      },
      {
        key_name: 'ALLOWED_EXTENSIONS',
        value: ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'zip', 'rar', 'jpg', 'jpeg', 'png', 'gif'],
        description: 'Allowed file extensions',
        category: 'UPLOAD',
        data_type: 'ARRAY',
        is_public: true
      },
      {
        key_name: 'DEFAULT_FILE_RETENTION_DAYS',
        value: 14,
        description: 'Default number of days to keep files',
        category: 'UPLOAD',
        data_type: 'NUMBER',
        is_public: true
      },
      {
        key_name: 'MAX_DOWNLOADS_PER_FILE',
        value: 1,
        description: 'Maximum number of downloads per file',
        category: 'UPLOAD',
        data_type: 'NUMBER',
        is_public: true
      },

      // Email Settings
      {
        key_name: 'EMAIL_TEMPLATE_SUBJECT',
        value: 'Datei für Sie bereitgestellt',
        description: 'Default email subject template',
        category: 'EMAIL',
        data_type: 'STRING',
        is_public: false
      },
      {
        key_name: 'EMAIL_TEMPLATE_BODY',
        value: `Hallo,

eine Datei wurde für Sie bereitgestellt:

Dateiname: {{filename}}
Größe: {{filesize}}
Gültig bis: {{expiry_date}}

Download-Link: {{download_url}}

Mit freundlichen Grüßen`,
        description: 'Default email body template',
        category: 'EMAIL',
        data_type: 'STRING',
        is_public: false
      },
      {
        key_name: 'EMAIL_RETENTION_DAYS',
        value: 30,
        description: 'Number of days to keep email addresses',
        category: 'EMAIL',
        data_type: 'NUMBER',
        is_public: false
      },

      // Security Settings
      {
        key_name: 'ALLOWED_LDAP_GROUPS',
        value: ['file-transfer-users'],
        description: 'LDAP groups allowed to use the system',
        category: 'SECURITY',
        data_type: 'ARRAY',
        is_public: false
      },
      {
        key_name: 'ADMIN_LDAP_GROUPS',
        value: ['file-transfer-admins'],
        description: 'LDAP groups with admin privileges',
        category: 'SECURITY',
        data_type: 'ARRAY',
        is_public: false
      },
      {
        key_name: 'SESSION_TIMEOUT_MINUTES',
        value: 480, // 8 hours
        description: 'Session timeout in minutes',
        category: 'SECURITY',
        data_type: 'NUMBER',
        is_public: true
      },

      // System Settings
      {
        key_name: 'SYSTEM_NAME',
        value: 'File Transfer System',
        description: 'Name of the system displayed in UI',
        category: 'SYSTEM',
        data_type: 'STRING',
        is_public: true
      },
      {
        key_name: 'SYSTEM_LOGO_URL',
        value: null,
        description: 'URL to system logo',
        category: 'SYSTEM',
        data_type: 'STRING',
        is_public: true
      },
      {
        key_name: 'MAINTENANCE_MODE',
        value: false,
        description: 'Whether system is in maintenance mode',
        category: 'SYSTEM',
        data_type: 'BOOLEAN',
        is_public: true
      },
      {
        key_name: 'CLEANUP_INTERVAL_HOURS',
        value: 24,
        description: 'Interval for cleanup job in hours',
        category: 'SYSTEM',
        data_type: 'NUMBER',
        is_public: false
      },

      // Storage Settings
      {
        key_name: 'STORAGE_WARNING_THRESHOLD',
        value: 90,
        description: 'Storage usage percentage to trigger warnings',
        category: 'STORAGE',
        data_type: 'NUMBER',
        is_public: false
      },
      {
        key_name: 'STORAGE_CRITICAL_THRESHOLD',
        value: 95,
        description: 'Storage usage percentage to trigger critical alerts',
        category: 'STORAGE',
        data_type: 'NUMBER',
        is_public: false
      },

      // Logging Settings
      {
        key_name: 'LOG_LEVEL',
        value: 'info',
        description: 'Logging level (debug, info, warn, error)',
        category: 'LOGGING',
        data_type: 'STRING',
        is_public: false
      },
      {
        key_name: 'LOG_RETENTION_DAYS',
        value: 90,
        description: 'Number of days to keep log files',
        category: 'LOGGING',
        data_type: 'NUMBER',
        is_public: false
      },
      {
        key_name: 'AUDIT_LOG_RETENTION_DAYS',
        value: 365,
        description: 'Number of days to keep audit logs',
        category: 'LOGGING',
        data_type: 'NUMBER',
        is_public: false
      },

      // Privacy Settings
      {
        key_name: 'PRIVACY_POLICY',
        value: 'Diese Anwendung verarbeitet Ihre Daten gemäß der DSGVO...',
        description: 'Privacy policy text',
        category: 'PRIVACY',
        data_type: 'STRING',
        is_public: true
      },
      {
        key_name: 'GDPR_COMPLIANCE_MODE',
        value: true,
        description: 'Enable GDPR compliance features',
        category: 'PRIVACY',
        data_type: 'BOOLEAN',
        is_public: true
      }
    ];

    for (const setting of defaults) {
      await this.findOrCreate({
        where: { key_name: setting.key_name },
        defaults: setting
      });
    }
  };

  // Instance methods
  SystemSetting.prototype.toJSON = function() {
    const values = { ...this.get() };
    return values;
  };

  SystemSetting.prototype.validateValue = function(value) {
    // Basic type validation
    switch (this.data_type) {
      case 'NUMBER':
        return typeof value === 'number' && !isNaN(value);
      case 'BOOLEAN':
        return typeof value === 'boolean';
      case 'STRING':
        return typeof value === 'string';
      case 'ARRAY':
        return Array.isArray(value);
      case 'JSON':
        return typeof value === 'object';
      default:
        return true;
    }
  };

  SystemSetting.prototype.getTypedValue = function() {
    const value = this.value;
    
    switch (this.data_type) {
      case 'NUMBER':
        return typeof value === 'number' ? value : parseFloat(value);
      case 'BOOLEAN':
        return typeof value === 'boolean' ? value : Boolean(value);
      case 'STRING':
        return String(value);
      case 'ARRAY':
      case 'JSON':
        return value;
      default:
        return value;
    }
  };

  return SystemSetting;
};
