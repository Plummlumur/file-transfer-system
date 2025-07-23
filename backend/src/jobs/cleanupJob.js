const cron = require('cron');
const { File, FileRecipient, AuditLog, SystemSetting } = require('../models');
const fileService = require('../services/fileService');
const emailService = require('../services/emailService');
const logger = require('../utils/logger');
const { Op } = require('sequelize');

class CleanupJob {
  constructor() {
    this.job = null;
    this.isRunning = false;
  }

  start() {
    // Get cleanup interval from settings (default: every 24 hours)
    const intervalHours = parseInt(process.env.CLEANUP_INTERVAL_HOURS) || 24;
    const cronPattern = `0 0 */${intervalHours} * * *`; // Every X hours at minute 0

    this.job = new cron.CronJob(cronPattern, async () => {
      await this.runCleanup();
    }, null, true, 'Europe/Berlin');

    logger.info(`Cleanup job scheduled to run every ${intervalHours} hours`);
  }

  stop() {
    if (this.job) {
      this.job.stop();
      logger.info('Cleanup job stopped');
    }
  }

  async runCleanup() {
    if (this.isRunning) {
      logger.warn('Cleanup job already running, skipping this execution');
      return;
    }

    this.isRunning = true;
    const startTime = Date.now();

    try {
      logger.info('Starting cleanup job');

      const results = {
        expiredFiles: 0,
        expiredRecipients: 0,
        oldAuditLogs: 0,
        errors: 0
      };

      // Clean up expired files
      try {
        const fileCleanupResult = await this.cleanupExpiredFiles();
        results.expiredFiles = fileCleanupResult.deletedCount;
        results.errors += fileCleanupResult.errorCount;
      } catch (error) {
        logger.error('File cleanup failed:', error);
        results.errors++;
      }

      // Clean up expired recipients
      try {
        const recipientCleanupResult = await this.cleanupExpiredRecipients();
        results.expiredRecipients = recipientCleanupResult.deletedCount;
      } catch (error) {
        logger.error('Recipient cleanup failed:', error);
        results.errors++;
      }

      // Clean up old audit logs
      try {
        const auditCleanupResult = await this.cleanupOldAuditLogs();
        results.oldAuditLogs = auditCleanupResult.deletedCount;
      } catch (error) {
        logger.error('Audit log cleanup failed:', error);
        results.errors++;
      }

      // Clean up orphaned files
      try {
        await this.cleanupOrphanedFiles();
      } catch (error) {
        logger.error('Orphaned file cleanup failed:', error);
        results.errors++;
      }

      // Update user quotas
      try {
        await this.updateUserQuotas();
      } catch (error) {
        logger.error('User quota update failed:', error);
        results.errors++;
      }

      // Check storage usage and send warnings if needed
      try {
        await this.checkStorageUsage();
      } catch (error) {
        logger.error('Storage usage check failed:', error);
        results.errors++;
      }

      const duration = Date.now() - startTime;
      logger.info('Cleanup job completed', {
        duration: `${duration}ms`,
        results
      });

      // Log cleanup results to audit log
      await AuditLog.logSystemAction('CLEANUP_JOB_COMPLETED', {
        duration,
        results
      });

      // Send admin notification if there were significant cleanups or errors
      if (results.expiredFiles > 10 || results.errors > 0) {
        await this.sendCleanupNotification(results, duration);
      }

    } catch (error) {
      logger.error('Cleanup job failed:', error);
      await AuditLog.logSystemAction('CLEANUP_JOB_FAILED', {
        error: error.message,
        duration: Date.now() - startTime
      });
    } finally {
      this.isRunning = false;
    }
  }

  async cleanupExpiredFiles() {
    logger.info('Cleaning up expired files');

    // Find files that are expired and not already deleted
    const expiredFiles = await File.findAll({
      where: {
        expiry_date: {
          [Op.lt]: new Date()
        },
        status: {
          [Op.ne]: 'deleted'
        }
      },
      include: [
        {
          model: FileRecipient,
          as: 'recipients'
        }
      ]
    });

    let deletedCount = 0;
    let errorCount = 0;

    for (const file of expiredFiles) {
      try {
        // Use file service to clean up
        const result = await fileService.cleanupExpiredFiles();
        deletedCount += result.deletedCount;
        errorCount += result.errorCount;

        logger.debug(`Cleaned up expired file: ${file.original_filename}`);

      } catch (error) {
        logger.error(`Failed to cleanup file ${file.id}:`, error);
        errorCount++;
      }
    }

    logger.info(`Expired files cleanup completed: ${deletedCount} deleted, ${errorCount} errors`);
    return { deletedCount, errorCount };
  }

  async cleanupExpiredRecipients() {
    logger.info('Cleaning up expired recipients');

    const emailRetentionDays = await SystemSetting.getSetting('EMAIL_RETENTION_DAYS', 30);
    const cutoffDate = new Date(Date.now() - (emailRetentionDays * 24 * 60 * 60 * 1000));

    // Find recipients that are old and have been downloaded or are from expired files
    const expiredRecipients = await FileRecipient.findAll({
      where: {
        [Op.or]: [
          {
            // Downloaded recipients older than retention period
            downloaded_at: {
              [Op.lt]: cutoffDate
            }
          },
          {
            // Recipients from deleted files
            '$file.status$': 'deleted'
          }
        ]
      },
      include: [
        {
          model: File,
          as: 'file',
          attributes: ['id', 'status']
        }
      ]
    });

    let deletedCount = 0;

    for (const recipient of expiredRecipients) {
      try {
        await recipient.destroy();
        deletedCount++;
        logger.debug(`Deleted expired recipient: ${recipient.email}`);
      } catch (error) {
        logger.error(`Failed to delete recipient ${recipient.id}:`, error);
      }
    }

    logger.info(`Expired recipients cleanup completed: ${deletedCount} deleted`);
    return { deletedCount };
  }

  async cleanupOldAuditLogs() {
    logger.info('Cleaning up old audit logs');

    const auditRetentionDays = await SystemSetting.getSetting('AUDIT_LOG_RETENTION_DAYS', 365);
    const cutoffDate = new Date(Date.now() - (auditRetentionDays * 24 * 60 * 60 * 1000));

    // Keep critical security events longer
    const criticalRetentionDays = auditRetentionDays * 2;
    const criticalCutoffDate = new Date(Date.now() - (criticalRetentionDays * 24 * 60 * 60 * 1000));

    // Delete old non-critical audit logs
    const deletedCount = await AuditLog.destroy({
      where: {
        created_at: {
          [Op.lt]: cutoffDate
        },
        severity: {
          [Op.notIn]: ['HIGH', 'CRITICAL']
        }
      }
    });

    // Delete very old critical logs
    const deletedCriticalCount = await AuditLog.destroy({
      where: {
        created_at: {
          [Op.lt]: criticalCutoffDate
        }
      }
    });

    const totalDeleted = deletedCount + deletedCriticalCount;
    logger.info(`Old audit logs cleanup completed: ${totalDeleted} deleted`);
    return { deletedCount: totalDeleted };
  }

  async cleanupOrphanedFiles() {
    logger.info('Cleaning up orphaned files');

    const fs = require('fs').promises;
    const path = require('path');
    const uploadDir = process.env.UPLOAD_DIR || './uploads';

    try {
      // Get all files from database
      const dbFiles = await File.findAll({
        attributes: ['file_path', 'thumbnail_path'],
        where: {
          status: {
            [Op.ne]: 'deleted'
          }
        }
      });

      const dbFilePaths = new Set();
      dbFiles.forEach(file => {
        if (file.file_path) {
          dbFilePaths.add(path.resolve(uploadDir, file.file_path));
        }
        if (file.thumbnail_path) {
          dbFilePaths.add(path.resolve(uploadDir, file.thumbnail_path));
        }
      });

      // Recursively scan upload directory
      const orphanedFiles = [];
      await this.scanDirectoryForOrphans(uploadDir, dbFilePaths, orphanedFiles);

      // Delete orphaned files
      let deletedCount = 0;
      for (const orphanedFile of orphanedFiles) {
        try {
          await fs.unlink(orphanedFile);
          deletedCount++;
          logger.debug(`Deleted orphaned file: ${orphanedFile}`);
        } catch (error) {
          logger.warn(`Failed to delete orphaned file ${orphanedFile}:`, error);
        }
      }

      logger.info(`Orphaned files cleanup completed: ${deletedCount} deleted`);

    } catch (error) {
      logger.error('Orphaned files cleanup failed:', error);
      throw error;
    }
  }

  async scanDirectoryForOrphans(dir, dbFilePaths, orphanedFiles) {
    const fs = require('fs').promises;
    const path = require('path');

    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          // Skip system directories
          if (['temp', 'logs', '.git', 'node_modules'].includes(entry.name)) {
            continue;
          }
          await this.scanDirectoryForOrphans(fullPath, dbFilePaths, orphanedFiles);
        } else if (entry.isFile()) {
          const resolvedPath = path.resolve(fullPath);
          if (!dbFilePaths.has(resolvedPath)) {
            orphanedFiles.push(fullPath);
          }
        }
      }
    } catch (error) {
      logger.warn(`Failed to scan directory ${dir}:`, error);
    }
  }

  async updateUserQuotas() {
    logger.info('Updating user quotas');

    const { User } = require('../models');
    const users = await User.findAll();

    for (const user of users) {
      try {
        const now = new Date();
        const lastReset = new Date(user.quota_reset_date);

        // Reset daily quota if it's a new day
        if (now.toDateString() !== lastReset.toDateString()) {
          user.upload_used_daily = 0;
        }

        // Reset monthly quota if it's a new month
        if (now.getMonth() !== lastReset.getMonth() || now.getFullYear() !== lastReset.getFullYear()) {
          user.upload_used_monthly = 0;
          user.quota_reset_date = now;
        }

        await user.save();
      } catch (error) {
        logger.error(`Failed to update quota for user ${user.id}:`, error);
      }
    }

    logger.info('User quota update completed');
  }

  async checkStorageUsage() {
    logger.info('Checking storage usage');

    try {
      const storageStats = await fileService.getStorageStats();
      const warningThreshold = await SystemSetting.getSetting('STORAGE_WARNING_THRESHOLD', 90);
      const criticalThreshold = await SystemSetting.getSetting('STORAGE_CRITICAL_THRESHOLD', 95);

      // Calculate usage percentage (simplified - would need proper disk usage in production)
      const usagePercentage = storageStats.database.activeSize > 0 ? 
        Math.min((storageStats.database.activeSize / (10 * 1024 * 1024 * 1024)) * 100, 100) : 0; // Assume 10GB limit for demo

      if (usagePercentage >= criticalThreshold) {
        await emailService.sendAdminNotification(
          'Kritischer Speicherplatz-Alarm',
          `Der Speicherplatz ist zu ${usagePercentage.toFixed(1)}% ausgelastet. Sofortige Maßnahmen erforderlich.`,
          'danger',
          JSON.stringify(storageStats, null, 2)
        );

        await AuditLog.logSystemAction('STORAGE_CRITICAL', {
          usagePercentage,
          storageStats
        });

      } else if (usagePercentage >= warningThreshold) {
        await emailService.sendAdminNotification(
          'Speicherplatz-Warnung',
          `Der Speicherplatz ist zu ${usagePercentage.toFixed(1)}% ausgelastet. Bitte prüfen Sie die Speichernutzung.`,
          'warning',
          JSON.stringify(storageStats, null, 2)
        );

        await AuditLog.logSystemAction('STORAGE_WARNING', {
          usagePercentage,
          storageStats
        });
      }

      logger.info(`Storage usage check completed: ${usagePercentage.toFixed(1)}% used`);

    } catch (error) {
      logger.error('Storage usage check failed:', error);
      throw error;
    }
  }

  async sendCleanupNotification(results, duration) {
    try {
      const message = `
Cleanup-Job abgeschlossen:

- Abgelaufene Dateien gelöscht: ${results.expiredFiles}
- Abgelaufene Empfänger gelöscht: ${results.expiredRecipients}
- Alte Audit-Logs gelöscht: ${results.oldAuditLogs}
- Fehler aufgetreten: ${results.errors}
- Ausführungsdauer: ${Math.round(duration / 1000)}s

${results.errors > 0 ? 'Bitte prüfen Sie die Logs für Details zu den aufgetretenen Fehlern.' : ''}
      `.trim();

      await emailService.sendAdminNotification(
        'Cleanup-Job Bericht',
        message,
        results.errors > 0 ? 'warning' : 'info'
      );

    } catch (error) {
      logger.error('Failed to send cleanup notification:', error);
    }
  }

  // Manual cleanup trigger for admin
  async runManualCleanup() {
    if (this.isRunning) {
      throw new Error('Cleanup job is already running');
    }

    logger.info('Manual cleanup triggered');
    await this.runCleanup();
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      isScheduled: this.job ? this.job.running : false,
      nextRun: this.job ? this.job.nextDate() : null,
      cronPattern: this.job ? this.job.cronTime.source : null
    };
  }
}

// Create singleton instance
const cleanupJob = new CleanupJob();

module.exports = cleanupJob;
