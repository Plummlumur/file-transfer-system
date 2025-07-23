const { DataTypes } = require('sequelize');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');

module.exports = (sequelize) => {
  const FileRecipient = sequelize.define('FileRecipient', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    file_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'files',
        key: 'id'
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
    download_token: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true
    },
    downloaded_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    download_ip: {
      type: DataTypes.STRING(45),
      allowNull: true,
      comment: 'IP address from which file was downloaded'
    },
    download_user_agent: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'User agent string from download request'
    },
    email_sent_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    email_opened_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    email_delivery_status: {
      type: DataTypes.ENUM('pending', 'sent', 'delivered', 'failed', 'bounced'),
      defaultValue: 'pending'
    },
    email_failure_reason: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    notification_sent: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      comment: 'Whether sender was notified of download'
    },
    expiry_date: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'Custom expiry date for this recipient (overrides file expiry)'
    },
    custom_message: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Custom message for this recipient'
    },
    access_count: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: 'Number of times download page was accessed'
    },
    last_access_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      comment: 'Whether this recipient link is still active'
    }
  }, {
    tableName: 'file_recipients',
    indexes: [
      {
        unique: true,
        fields: ['download_token']
      },
      {
        fields: ['file_id']
      },
      {
        fields: ['email']
      },
      {
        fields: ['downloaded_at']
      },
      {
        fields: ['email_sent_at']
      },
      {
        fields: ['email_delivery_status']
      },
      {
        fields: ['expiry_date']
      },
      {
        fields: ['is_active']
      }
    ],
    hooks: {
      beforeCreate: (recipient) => {
        // Generate unique download token
        if (!recipient.download_token) {
          recipient.download_token = crypto.randomBytes(32).toString('hex');
        }
      }
    }
  });

  // Instance methods
  FileRecipient.prototype.toJSON = function() {
    const values = { ...this.get() };
    // Don't expose sensitive information in general API responses
    delete values.download_token;
    return values;
  };

  FileRecipient.prototype.hasDownloaded = function() {
    return this.downloaded_at !== null;
  };

  FileRecipient.prototype.isExpired = function() {
    const expiryDate = this.expiry_date || (this.file && this.file.expiry_date);
    return expiryDate && new Date() > expiryDate;
  };

  FileRecipient.prototype.canDownload = function() {
    return (
      this.is_active &&
      !this.hasDownloaded() &&
      !this.isExpired()
    );
  };

  FileRecipient.prototype.markAsDownloaded = function(ipAddress, userAgent) {
    this.downloaded_at = new Date();
    this.download_ip = ipAddress;
    this.download_user_agent = userAgent;
    return this.save();
  };

  FileRecipient.prototype.markEmailAsSent = function() {
    this.email_sent_at = new Date();
    this.email_delivery_status = 'sent';
    return this.save();
  };

  FileRecipient.prototype.markEmailAsDelivered = function() {
    this.email_delivery_status = 'delivered';
    return this.save();
  };

  FileRecipient.prototype.markEmailAsFailed = function(reason) {
    this.email_delivery_status = 'failed';
    this.email_failure_reason = reason;
    return this.save();
  };

  FileRecipient.prototype.markEmailAsOpened = function() {
    this.email_opened_at = new Date();
    return this.save();
  };

  FileRecipient.prototype.incrementAccessCount = function() {
    this.access_count += 1;
    this.last_access_at = new Date();
    return this.save();
  };

  FileRecipient.prototype.deactivate = function() {
    this.is_active = false;
    return this.save();
  };

  FileRecipient.prototype.getDownloadUrl = function() {
    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    return `${baseUrl}/download/${this.download_token}`;
  };

  FileRecipient.prototype.getTrackingPixelUrl = function() {
    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    return `${baseUrl}/api/v1/files/track-email/${this.download_token}`;
  };

  FileRecipient.prototype.getDaysUntilExpiry = function() {
    const expiryDate = this.expiry_date || (this.file && this.file.expiry_date);
    if (!expiryDate) return null;
    
    const now = new Date();
    const expiry = new Date(expiryDate);
    const diffTime = expiry - now;
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

  FileRecipient.prototype.getEmailStatus = function() {
    return {
      status: this.email_delivery_status,
      sent_at: this.email_sent_at,
      opened_at: this.email_opened_at,
      failure_reason: this.email_failure_reason,
      access_count: this.access_count,
      last_access_at: this.last_access_at
    };
  };

  return FileRecipient;
};
