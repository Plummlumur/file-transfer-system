const { User, SystemSetting, AuditLog } = require('../models');
const logger = require('../utils/logger');

async function seed() {
  try {
    logger.info('Starting database seeding...');

    // Create demo admin user (for development only)
    if (process.env.NODE_ENV === 'development') {
      const [adminUser, created] = await User.findOrCreate({
        where: { username: 'admin' },
        defaults: {
          username: 'admin',
          email: 'admin@example.com',
          display_name: 'System Administrator',
          is_admin: true,
          is_active: true,
          ldap_groups: ['file-transfer-admins'],
          preferences: {
            language: 'de',
            email_notifications: true,
            default_retention_days: 14
          }
        }
      });

      if (created) {
        logger.info('Demo admin user created: admin@example.com');
      } else {
        logger.info('Demo admin user already exists');
      }

      // Create demo regular user
      const [regularUser, regularCreated] = await User.findOrCreate({
        where: { username: 'user' },
        defaults: {
          username: 'user',
          email: 'user@example.com',
          display_name: 'Demo User',
          is_admin: false,
          is_active: true,
          ldap_groups: ['file-transfer-users'],
          preferences: {
            language: 'de',
            email_notifications: true,
            default_retention_days: 7
          }
        }
      });

      if (regularCreated) {
        logger.info('Demo regular user created: user@example.com');
      } else {
        logger.info('Demo regular user already exists');
      }
    }

    // Seed additional system settings for demo
    const additionalSettings = [
      {
        key_name: 'DEMO_MODE',
        value: process.env.NODE_ENV === 'development',
        description: 'Enable demo mode features',
        category: 'SYSTEM',
        data_type: 'BOOLEAN',
        is_public: true
      },
      {
        key_name: 'WELCOME_MESSAGE',
        value: 'Willkommen beim sicheren Dateitransfer-System',
        description: 'Welcome message displayed on login page',
        category: 'SYSTEM',
        data_type: 'STRING',
        is_public: true
      },
      {
        key_name: 'SUPPORT_EMAIL',
        value: 'support@example.com',
        description: 'Support contact email address',
        category: 'SYSTEM',
        data_type: 'STRING',
        is_public: true
      },
      {
        key_name: 'TERMS_OF_SERVICE_URL',
        value: null,
        description: 'URL to terms of service document',
        category: 'SYSTEM',
        data_type: 'STRING',
        is_public: true
      },
      {
        key_name: 'HELP_URL',
        value: null,
        description: 'URL to help documentation',
        category: 'SYSTEM',
        data_type: 'STRING',
        is_public: true
      },
      {
        key_name: 'COMPANY_NAME',
        value: 'Ihre Organisation',
        description: 'Company/Organization name',
        category: 'SYSTEM',
        data_type: 'STRING',
        is_public: true
      },
      {
        key_name: 'COMPANY_URL',
        value: 'https://www.example.com',
        description: 'Company/Organization website URL',
        category: 'SYSTEM',
        data_type: 'STRING',
        is_public: true
      },
      {
        key_name: 'ENABLE_REGISTRATION',
        value: false,
        description: 'Allow user self-registration (when not using LDAP)',
        category: 'SECURITY',
        data_type: 'BOOLEAN',
        is_public: false
      },
      {
        key_name: 'REQUIRE_EMAIL_VERIFICATION',
        value: true,
        description: 'Require email verification for new accounts',
        category: 'SECURITY',
        data_type: 'BOOLEAN',
        is_public: false
      },
      {
        key_name: 'PASSWORD_MIN_LENGTH',
        value: 8,
        description: 'Minimum password length for local accounts',
        category: 'SECURITY',
        data_type: 'NUMBER',
        is_public: false
      },
      {
        key_name: 'PASSWORD_REQUIRE_SPECIAL_CHARS',
        value: true,
        description: 'Require special characters in passwords',
        category: 'SECURITY',
        data_type: 'BOOLEAN',
        is_public: false
      },
      {
        key_name: 'MAX_LOGIN_ATTEMPTS',
        value: 5,
        description: 'Maximum login attempts before account lockout',
        category: 'SECURITY',
        data_type: 'NUMBER',
        is_public: false
      },
      {
        key_name: 'ACCOUNT_LOCKOUT_DURATION',
        value: 30,
        description: 'Account lockout duration in minutes',
        category: 'SECURITY',
        data_type: 'NUMBER',
        is_public: false
      },
      {
        key_name: 'ENABLE_FILE_ENCRYPTION',
        value: false,
        description: 'Enable file encryption at rest',
        category: 'SECURITY',
        data_type: 'BOOLEAN',
        is_public: false
      },
      {
        key_name: 'ENCRYPTION_ALGORITHM',
        value: 'AES-256-GCM',
        description: 'Encryption algorithm for file encryption',
        category: 'SECURITY',
        data_type: 'STRING',
        is_public: false
      },
      {
        key_name: 'BACKUP_RETENTION_DAYS',
        value: 30,
        description: 'Number of days to keep database backups',
        category: 'SYSTEM',
        data_type: 'NUMBER',
        is_public: false
      },
      {
        key_name: 'ENABLE_API_DOCUMENTATION',
        value: process.env.NODE_ENV === 'development',
        description: 'Enable API documentation endpoint',
        category: 'SYSTEM',
        data_type: 'BOOLEAN',
        is_public: false
      },
      {
        key_name: 'API_RATE_LIMIT_WINDOW',
        value: 15,
        description: 'API rate limit window in minutes',
        category: 'SYSTEM',
        data_type: 'NUMBER',
        is_public: false
      },
      {
        key_name: 'API_RATE_LIMIT_MAX_REQUESTS',
        value: 100,
        description: 'Maximum API requests per window',
        category: 'SYSTEM',
        data_type: 'NUMBER',
        is_public: false
      },
      {
        key_name: 'ENABLE_METRICS_COLLECTION',
        value: true,
        description: 'Enable system metrics collection',
        category: 'MONITORING',
        data_type: 'BOOLEAN',
        is_public: false
      },
      {
        key_name: 'METRICS_RETENTION_DAYS',
        value: 90,
        description: 'Number of days to keep metrics data',
        category: 'MONITORING',
        data_type: 'NUMBER',
        is_public: false
      },
      {
        key_name: 'ENABLE_PERFORMANCE_MONITORING',
        value: true,
        description: 'Enable performance monitoring',
        category: 'MONITORING',
        data_type: 'BOOLEAN',
        is_public: false
      },
      {
        key_name: 'SLOW_QUERY_THRESHOLD',
        value: 1000,
        description: 'Slow query threshold in milliseconds',
        category: 'MONITORING',
        data_type: 'NUMBER',
        is_public: false
      },
      {
        key_name: 'NOTIFICATION_CHANNELS',
        value: ['email'],
        description: 'Available notification channels',
        category: 'NOTIFICATIONS',
        data_type: 'ARRAY',
        is_public: false
      },
      {
        key_name: 'DEFAULT_NOTIFICATION_CHANNEL',
        value: 'email',
        description: 'Default notification channel',
        category: 'NOTIFICATIONS',
        data_type: 'STRING',
        is_public: false
      },
      {
        key_name: 'ENABLE_SLACK_NOTIFICATIONS',
        value: false,
        description: 'Enable Slack notifications for admins',
        category: 'NOTIFICATIONS',
        data_type: 'BOOLEAN',
        is_public: false
      },
      {
        key_name: 'SLACK_WEBHOOK_URL',
        value: null,
        description: 'Slack webhook URL for notifications',
        category: 'NOTIFICATIONS',
        data_type: 'STRING',
        is_public: false
      },
      {
        key_name: 'ENABLE_TEAMS_NOTIFICATIONS',
        value: false,
        description: 'Enable Microsoft Teams notifications',
        category: 'NOTIFICATIONS',
        data_type: 'BOOLEAN',
        is_public: false
      },
      {
        key_name: 'TEAMS_WEBHOOK_URL',
        value: null,
        description: 'Microsoft Teams webhook URL',
        category: 'NOTIFICATIONS',
        data_type: 'STRING',
        is_public: false
      }
    ];

    // Insert additional settings
    for (const setting of additionalSettings) {
      await SystemSetting.findOrCreate({
        where: { key_name: setting.key_name },
        defaults: setting
      });
    }

    logger.info('Additional system settings seeded');

    // Create initial audit log entry
    await AuditLog.logSystemAction('SYSTEM_SEEDED', {
      message: 'Database seeding completed',
      environment: process.env.NODE_ENV,
      timestamp: new Date().toISOString()
    });

    logger.info('Database seeding completed successfully');

    // Log summary
    const userCount = await User.count();
    const settingCount = await SystemSetting.count();
    
    logger.info('Seeding summary:', {
      users: userCount,
      settings: settingCount,
      environment: process.env.NODE_ENV
    });

    process.exit(0);

  } catch (error) {
    logger.error('Database seeding failed:', error);
    process.exit(1);
  }
}

// Run seeding if this file is executed directly
if (require.main === module) {
  seed();
}

module.exports = seed;
