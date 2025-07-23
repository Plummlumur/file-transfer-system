const { sequelize, SystemSetting } = require('../models');
const logger = require('../utils/logger');

async function migrate() {
  try {
    logger.info('Starting database migration...');

    // Test database connection
    await sequelize.authenticate();
    logger.info('Database connection established');

    // Sync all models (create tables if they don't exist)
    await sequelize.sync({ alter: true });
    logger.info('Database tables synchronized');

    // Initialize default system settings
    await SystemSetting.initializeDefaults();
    logger.info('Default system settings initialized');

    logger.info('Database migration completed successfully');
    process.exit(0);

  } catch (error) {
    logger.error('Database migration failed:', error);
    process.exit(1);
  }
}

// Run migration if this file is executed directly
if (require.main === module) {
  migrate();
}

module.exports = migrate;
