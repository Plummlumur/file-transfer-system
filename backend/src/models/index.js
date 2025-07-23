const { Sequelize } = require('sequelize');
const logger = require('../utils/logger');

// Database configuration
const sequelize = new Sequelize(
  process.env.DB_NAME || 'file_transfer',
  process.env.DB_USER || 'root',
  process.env.DB_PASSWORD || 'password',
  {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    dialect: 'mysql',
    logging: (msg) => logger.debug(msg),
    pool: {
      max: 10,
      min: 0,
      acquire: 30000,
      idle: 10000
    },
    define: {
      timestamps: true,
      underscored: true,
      freezeTableName: true
    }
  }
);

// Import models
const User = require('./User')(sequelize);
const File = require('./File')(sequelize);
const FileRecipient = require('./FileRecipient')(sequelize);
const AuditLog = require('./AuditLog')(sequelize);
const SystemSetting = require('./SystemSetting')(sequelize);

// Define associations
User.hasMany(File, { foreignKey: 'uploaded_by', as: 'uploadedFiles' });
File.belongsTo(User, { foreignKey: 'uploaded_by', as: 'uploader' });

File.hasMany(FileRecipient, { foreignKey: 'file_id', as: 'recipients', onDelete: 'CASCADE' });
FileRecipient.belongsTo(File, { foreignKey: 'file_id', as: 'file' });

User.hasMany(AuditLog, { foreignKey: 'user_id', as: 'auditLogs' });
AuditLog.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

User.hasMany(SystemSetting, { foreignKey: 'updated_by', as: 'updatedSettings' });
SystemSetting.belongsTo(User, { foreignKey: 'updated_by', as: 'updatedBy' });

module.exports = {
  sequelize,
  User,
  File,
  FileRecipient,
  AuditLog,
  SystemSetting
};
