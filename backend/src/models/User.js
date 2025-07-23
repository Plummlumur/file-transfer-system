const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const User = sequelize.define('User', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    username: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true,
      validate: {
        notEmpty: true,
        len: [2, 255]
      }
    },
    email: {
      type: DataTypes.STRING(255),
      allowNull: false,
      validate: {
        isEmail: true,
        notEmpty: true
      }
    },
    display_name: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    ldap_groups: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: []
    },
    is_admin: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    last_login: {
      type: DataTypes.DATE,
      allowNull: true
    },
    upload_quota_daily: {
      type: DataTypes.BIGINT,
      defaultValue: 5368709120, // 5GB in bytes
      comment: 'Daily upload quota in bytes'
    },
    upload_quota_monthly: {
      type: DataTypes.BIGINT,
      defaultValue: 107374182400, // 100GB in bytes
      comment: 'Monthly upload quota in bytes'
    },
    upload_used_daily: {
      type: DataTypes.BIGINT,
      defaultValue: 0,
      comment: 'Used daily upload quota in bytes'
    },
    upload_used_monthly: {
      type: DataTypes.BIGINT,
      defaultValue: 0,
      comment: 'Used monthly upload quota in bytes'
    },
    quota_reset_date: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      comment: 'Date when monthly quota was last reset'
    },
    preferences: {
      type: DataTypes.JSON,
      defaultValue: {
        language: 'de',
        email_notifications: true,
        default_retention_days: 14
      }
    }
  }, {
    tableName: 'users',
    indexes: [
      {
        unique: true,
        fields: ['username']
      },
      {
        fields: ['email']
      },
      {
        fields: ['is_active']
      },
      {
        fields: ['last_login']
      }
    ],
    hooks: {
      beforeCreate: (user) => {
        // Set display name from username if not provided
        if (!user.display_name) {
          user.display_name = user.username;
        }
      },
      beforeUpdate: (user) => {
        // Reset daily quota if it's a new day
        const now = new Date();
        const lastReset = new Date(user.quota_reset_date);
        
        if (now.toDateString() !== lastReset.toDateString()) {
          user.upload_used_daily = 0;
        }
        
        // Reset monthly quota if it's a new month
        if (now.getMonth() !== lastReset.getMonth() || now.getFullYear() !== lastReset.getFullYear()) {
          user.upload_used_monthly = 0;
          user.quota_reset_date = now;
        }
      }
    }
  });

  // Instance methods
  User.prototype.toJSON = function() {
    const values = { ...this.get() };
    // Don't expose sensitive information
    delete values.ldap_groups;
    return values;
  };

  User.prototype.hasGroup = function(groupName) {
    return this.ldap_groups && this.ldap_groups.includes(groupName);
  };

  User.prototype.canUpload = function(fileSize) {
    return (
      this.upload_used_daily + fileSize <= this.upload_quota_daily &&
      this.upload_used_monthly + fileSize <= this.upload_quota_monthly
    );
  };

  User.prototype.updateUploadUsage = function(fileSize) {
    this.upload_used_daily += fileSize;
    this.upload_used_monthly += fileSize;
    return this.save();
  };

  User.prototype.getUploadQuotaStatus = function() {
    return {
      daily: {
        used: this.upload_used_daily,
        total: this.upload_quota_daily,
        percentage: Math.round((this.upload_used_daily / this.upload_quota_daily) * 100)
      },
      monthly: {
        used: this.upload_used_monthly,
        total: this.upload_quota_monthly,
        percentage: Math.round((this.upload_used_monthly / this.upload_quota_monthly) * 100)
      }
    };
  };

  return User;
};
