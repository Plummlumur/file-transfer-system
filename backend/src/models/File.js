const { DataTypes } = require('sequelize');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

module.exports = (sequelize) => {
  const File = sequelize.define('File', {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: () => uuidv4()
    },
    filename: {
      type: DataTypes.STRING(255),
      allowNull: false,
      comment: 'Sanitized filename for storage'
    },
    original_filename: {
      type: DataTypes.STRING(255),
      allowNull: false,
      comment: 'Original filename as uploaded by user'
    },
    file_size: {
      type: DataTypes.BIGINT,
      allowNull: false,
      validate: {
        min: 1
      }
    },
    mime_type: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    file_extension: {
      type: DataTypes.STRING(10),
      allowNull: true
    },
    file_path: {
      type: DataTypes.STRING(500),
      allowNull: false,
      comment: 'Relative path to file on disk'
    },
    upload_date: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    },
    expiry_date: {
      type: DataTypes.DATE,
      allowNull: false
    },
    uploaded_by: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    download_count: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    max_downloads: {
      type: DataTypes.INTEGER,
      defaultValue: 1,
      validate: {
        min: 1
      }
    },
    status: {
      type: DataTypes.ENUM('uploading', 'ready', 'expired', 'deleted'),
      defaultValue: 'uploading'
    },
    upload_progress: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      validate: {
        min: 0,
        max: 100
      }
    },
    checksum: {
      type: DataTypes.STRING(64),
      allowNull: true,
      comment: 'SHA-256 checksum for file integrity'
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    tags: {
      type: DataTypes.JSON,
      defaultValue: []
    },
    metadata: {
      type: DataTypes.JSON,
      defaultValue: {},
      comment: 'Additional file metadata (dimensions, duration, etc.)'
    },
    thumbnail_path: {
      type: DataTypes.STRING(500),
      allowNull: true,
      comment: 'Path to generated thumbnail for images/videos'
    },
    is_encrypted: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    encryption_key: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: 'Encrypted file encryption key'
    }
  }, {
    tableName: 'files',
    indexes: [
      {
        fields: ['uploaded_by']
      },
      {
        fields: ['expiry_date']
      },
      {
        fields: ['status']
      },
      {
        fields: ['upload_date']
      },
      {
        fields: ['file_size']
      },
      {
        fields: ['mime_type']
      }
    ],
    hooks: {
      beforeCreate: (file) => {
        // Extract file extension
        if (file.original_filename) {
          file.file_extension = path.extname(file.original_filename).toLowerCase().substring(1);
        }
        
        // Set default expiry date if not provided
        if (!file.expiry_date) {
          const defaultRetentionDays = parseInt(process.env.DEFAULT_FILE_RETENTION_DAYS) || 14;
          file.expiry_date = new Date(Date.now() + (defaultRetentionDays * 24 * 60 * 60 * 1000));
        }
      },
      beforeUpdate: (file) => {
        // Update file extension if filename changed
        if (file.changed('original_filename')) {
          file.file_extension = path.extname(file.original_filename).toLowerCase().substring(1);
        }
      }
    }
  });

  // Instance methods
  File.prototype.toJSON = function() {
    const values = { ...this.get() };
    // Don't expose sensitive information
    delete values.file_path;
    delete values.encryption_key;
    return values;
  };

  File.prototype.isExpired = function() {
    return new Date() > this.expiry_date;
  };

  File.prototype.canBeDownloaded = function() {
    return (
      this.status === 'ready' &&
      !this.isExpired() &&
      this.download_count < this.max_downloads
    );
  };

  File.prototype.getFormattedSize = function() {
    const bytes = this.file_size;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    if (bytes === 0) return '0 Bytes';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  };

  File.prototype.getDaysUntilExpiry = function() {
    const now = new Date();
    const expiry = new Date(this.expiry_date);
    const diffTime = expiry - now;
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

  File.prototype.incrementDownloadCount = function() {
    this.download_count += 1;
    return this.save();
  };

  File.prototype.markAsReady = function() {
    this.status = 'ready';
    this.upload_progress = 100;
    return this.save();
  };

  File.prototype.markAsExpired = function() {
    this.status = 'expired';
    return this.save();
  };

  File.prototype.markAsDeleted = function() {
    this.status = 'deleted';
    return this.save();
  };

  File.prototype.updateProgress = function(progress) {
    this.upload_progress = Math.min(100, Math.max(0, progress));
    if (this.upload_progress === 100 && this.status === 'uploading') {
      this.status = 'ready';
    }
    return this.save();
  };

  File.prototype.isImage = function() {
    return this.mime_type && this.mime_type.startsWith('image/');
  };

  File.prototype.isVideo = function() {
    return this.mime_type && this.mime_type.startsWith('video/');
  };

  File.prototype.isPDF = function() {
    return this.mime_type === 'application/pdf';
  };

  File.prototype.hasPreview = function() {
    return this.isImage() || this.isVideo() || this.isPDF() || this.thumbnail_path;
  };

  return File;
};
