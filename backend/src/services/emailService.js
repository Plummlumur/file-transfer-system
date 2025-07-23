const nodemailer = require('nodemailer');
const handlebars = require('handlebars');
const path = require('path');
const fs = require('fs').promises;
const { SystemSetting } = require('../models');
const logger = require('../utils/logger');

class EmailService {
  constructor() {
    this.transporter = null;
    this.templates = new Map();
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;

    try {
      // Create transporter
      await this.createTransporter();
      
      // Load email templates
      await this.loadTemplates();
      
      this.initialized = true;
      logger.info('Email service initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize email service:', error);
      throw error;
    }
  }

  async createTransporter() {
    const config = {
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD
      },
      tls: {
        rejectUnauthorized: false // Allow self-signed certificates
      }
    };

    this.transporter = nodemailer.createTransporter(config);

    // Verify connection
    try {
      await this.transporter.verify();
      logger.info('SMTP connection verified successfully');
    } catch (error) {
      logger.error('SMTP connection verification failed:', error);
      throw new Error('Email service configuration error');
    }
  }

  async loadTemplates() {
    const templatesDir = path.join(__dirname, '../templates/email');
    
    try {
      // Ensure templates directory exists
      await fs.mkdir(templatesDir, { recursive: true });
      
      // Load default templates if they don't exist
      await this.createDefaultTemplates(templatesDir);
      
      // Load all template files
      const templateFiles = await fs.readdir(templatesDir);
      
      for (const file of templateFiles) {
        if (file.endsWith('.hbs')) {
          const templateName = path.basename(file, '.hbs');
          const templatePath = path.join(templatesDir, file);
          const templateContent = await fs.readFile(templatePath, 'utf8');
          
          this.templates.set(templateName, handlebars.compile(templateContent));
          logger.debug(`Loaded email template: ${templateName}`);
        }
      }
    } catch (error) {
      logger.error('Failed to load email templates:', error);
      // Use fallback templates
      this.createFallbackTemplates();
    }
  }

  async createDefaultTemplates(templatesDir) {
    const templates = {
      'file-notification': `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Datei bereitgestellt</title>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 20px; background-color: #f4f4f4; }
        .container { max-width: 600px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; box-shadow: 0 0 10px rgba(0,0,0,0.1); }
        .header { text-align: center; margin-bottom: 30px; padding-bottom: 20px; border-bottom: 2px solid #eee; }
        .logo { font-size: 24px; font-weight: bold; color: #2c3e50; margin-bottom: 10px; }
        .file-info { background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0; }
        .file-info h3 { margin-top: 0; color: #2c3e50; }
        .file-details { margin: 15px 0; }
        .file-details strong { color: #2c3e50; }
        .download-button { display: inline-block; background: #3498db; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; font-weight: bold; }
        .download-button:hover { background: #2980b9; }
        .expiry-warning { background: #fff3cd; border: 1px solid #ffeaa7; color: #856404; padding: 15px; border-radius: 5px; margin: 20px 0; }
        .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #666; text-align: center; }
        .custom-message { background: #e8f4fd; border-left: 4px solid #3498db; padding: 15px; margin: 20px 0; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="logo">{{systemName}}</div>
            <h2>Eine Datei wurde für Sie bereitgestellt</h2>
        </div>

        <p>Hallo,</p>
        
        <p>{{senderName}} hat eine Datei für Sie bereitgestellt:</p>

        {{#if customMessage}}
        <div class="custom-message">
            <strong>Nachricht:</strong><br>
            {{customMessage}}
        </div>
        {{/if}}

        <div class="file-info">
            <h3>📁 {{filename}}</h3>
            <div class="file-details">
                <strong>Dateigröße:</strong> {{fileSize}}<br>
                <strong>Hochgeladen am:</strong> {{uploadDate}}<br>
                <strong>Gültig bis:</strong> {{expiryDate}}
            </div>
        </div>

        <div style="text-align: center;">
            <a href="{{downloadUrl}}" class="download-button">📥 Datei herunterladen</a>
        </div>

        <div class="expiry-warning">
            <strong>⚠️ Wichtiger Hinweis:</strong><br>
            Diese Datei kann nur {{maxDownloads}} Mal heruntergeladen werden und ist bis zum {{expiryDate}} verfügbar.
            Nach dem Download oder Ablauf der Frist wird der Link ungültig.
        </div>

        <p><strong>Sicherheitshinweis:</strong> Laden Sie nur Dateien herunter, die Sie erwartet haben. 
        Bei Verdacht auf Spam oder Phishing kontaktieren Sie bitte den Absender direkt.</p>

        <div class="footer">
            <p>Diese E-Mail wurde automatisch generiert. Bitte antworten Sie nicht auf diese E-Mail.</p>
            <p>{{systemName}} - Sicherer Dateitransfer</p>
            {{#if trackingPixel}}
            <img src="{{trackingPixel}}" width="1" height="1" style="display:none;">
            {{/if}}
        </div>
    </div>
</body>
</html>`,

      'download-notification': `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Download-Benachrichtigung</title>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 20px; background-color: #f4f4f4; }
        .container { max-width: 600px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; box-shadow: 0 0 10px rgba(0,0,0,0.1); }
        .header { text-align: center; margin-bottom: 30px; padding-bottom: 20px; border-bottom: 2px solid #eee; }
        .logo { font-size: 24px; font-weight: bold; color: #2c3e50; margin-bottom: 10px; }
        .success-icon { font-size: 48px; color: #27ae60; text-align: center; margin: 20px 0; }
        .download-info { background: #d4edda; border: 1px solid #c3e6cb; color: #155724; padding: 20px; border-radius: 8px; margin: 20px 0; }
        .file-details { margin: 15px 0; }
        .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #666; text-align: center; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="logo">{{systemName}}</div>
            <h2>Download-Benachrichtigung</h2>
        </div>

        <div class="success-icon">✅</div>

        <p>Hallo {{senderName}},</p>
        
        <p>Ihre bereitgestellte Datei wurde erfolgreich heruntergeladen:</p>

        <div class="download-info">
            <div class="file-details">
                <strong>📁 Datei:</strong> {{filename}}<br>
                <strong>📧 Heruntergeladen von:</strong> {{recipientEmail}}<br>
                <strong>🕒 Download-Zeit:</strong> {{downloadTime}}<br>
                <strong>🌐 IP-Adresse:</strong> {{ipAddress}}
            </div>
        </div>

        <p>Der Download-Link ist jetzt ungültig und kann nicht mehr verwendet werden.</p>

        <div class="footer">
            <p>Diese E-Mail wurde automatisch generiert. Bitte antworten Sie nicht auf diese E-Mail.</p>
            <p>{{systemName}} - Sicherer Dateitransfer</p>
        </div>
    </div>
</body>
</html>`,

      'admin-notification': `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>System-Benachrichtigung</title>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 20px; background-color: #f4f4f4; }
        .container { max-width: 600px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; box-shadow: 0 0 10px rgba(0,0,0,0.1); }
        .header { text-align: center; margin-bottom: 30px; padding-bottom: 20px; border-bottom: 2px solid #eee; }
        .logo { font-size: 24px; font-weight: bold; color: #2c3e50; margin-bottom: 10px; }
        .alert { padding: 20px; border-radius: 8px; margin: 20px 0; }
        .alert-warning { background: #fff3cd; border: 1px solid #ffeaa7; color: #856404; }
        .alert-danger { background: #f8d7da; border: 1px solid #f5c6cb; color: #721c24; }
        .alert-info { background: #d1ecf1; border: 1px solid #bee5eb; color: #0c5460; }
        .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #666; text-align: center; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="logo">{{systemName}}</div>
            <h2>{{subject}}</h2>
        </div>

        <div class="alert alert-{{alertType}}">
            <strong>{{alertTitle}}</strong><br>
            {{message}}
        </div>

        {{#if details}}
        <div style="background: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <strong>Details:</strong><br>
            <pre style="white-space: pre-wrap; font-family: monospace; font-size: 12px;">{{details}}</pre>
        </div>
        {{/if}}

        <div class="footer">
            <p>Diese E-Mail wurde automatisch generiert.</p>
            <p>{{systemName}} - Administrator-Benachrichtigung</p>
            <p>Zeit: {{timestamp}}</p>
        </div>
    </div>
</body>
</html>`
    };

    for (const [name, content] of Object.entries(templates)) {
      const templatePath = path.join(templatesDir, `${name}.hbs`);
      try {
        await fs.access(templatePath);
      } catch {
        await fs.writeFile(templatePath, content, 'utf8');
        logger.info(`Created default email template: ${name}`);
      }
    }
  }

  createFallbackTemplates() {
    // Simple fallback templates
    this.templates.set('file-notification', handlebars.compile(`
      <h2>Datei bereitgestellt</h2>
      <p>Hallo,</p>
      <p>{{senderName}} hat eine Datei für Sie bereitgestellt:</p>
      <p><strong>Datei:</strong> {{filename}}</p>
      <p><strong>Größe:</strong> {{fileSize}}</p>
      <p><strong>Gültig bis:</strong> {{expiryDate}}</p>
      <p><a href="{{downloadUrl}}">Datei herunterladen</a></p>
      <p>Dieser Link kann nur {{maxDownloads}} Mal verwendet werden.</p>
    `));

    this.templates.set('download-notification', handlebars.compile(`
      <h2>Download-Benachrichtigung</h2>
      <p>Hallo {{senderName}},</p>
      <p>Ihre Datei "{{filename}}" wurde von {{recipientEmail}} heruntergeladen.</p>
      <p>Download-Zeit: {{downloadTime}}</p>
    `));

    logger.warn('Using fallback email templates');
  }

  async sendFileNotification(file, recipient, sender) {
    await this.ensureInitialized();

    try {
      const systemName = await SystemSetting.getSetting('SYSTEM_NAME', 'File Transfer System');
      const subject = await SystemSetting.getSetting('EMAIL_TEMPLATE_SUBJECT', 'Datei für Sie bereitgestellt');
      
      const templateData = {
        systemName,
        filename: file.original_filename,
        fileSize: file.getFormattedSize(),
        uploadDate: file.upload_date.toLocaleDateString('de-DE'),
        expiryDate: file.expiry_date.toLocaleDateString('de-DE'),
        downloadUrl: recipient.getDownloadUrl(),
        maxDownloads: file.max_downloads,
        senderName: sender.display_name || sender.username,
        senderEmail: sender.email,
        customMessage: recipient.custom_message,
        trackingPixel: recipient.getTrackingPixelUrl()
      };

      const template = this.templates.get('file-notification');
      const htmlContent = template(templateData);

      const mailOptions = {
        from: process.env.EMAIL_FROM || `"${systemName}" <noreply@example.com>`,
        to: recipient.email,
        subject: subject,
        html: htmlContent,
        text: this.generateTextVersion(templateData)
      };

      const result = await this.transporter.sendMail(mailOptions);
      
      await recipient.markEmailAsSent();
      
      logger.info(`File notification sent successfully`, {
        fileId: file.id,
        recipientEmail: recipient.email,
        messageId: result.messageId
      });

      return result;
    } catch (error) {
      logger.error('Failed to send file notification:', error);
      await recipient.markEmailAsFailed(error.message);
      throw error;
    }
  }

  async sendDownloadNotification(file, recipient, sender) {
    await this.ensureInitialized();

    try {
      const systemName = await SystemSetting.getSetting('SYSTEM_NAME', 'File Transfer System');
      
      const templateData = {
        systemName,
        filename: file.original_filename,
        recipientEmail: recipient.email,
        downloadTime: recipient.downloaded_at.toLocaleString('de-DE'),
        ipAddress: recipient.download_ip || 'Unbekannt',
        senderName: sender.display_name || sender.username
      };

      const template = this.templates.get('download-notification');
      const htmlContent = template(templateData);

      const mailOptions = {
        from: process.env.EMAIL_FROM || `"${systemName}" <noreply@example.com>`,
        to: sender.email,
        subject: `Download-Benachrichtigung: ${file.original_filename}`,
        html: htmlContent,
        text: `Ihre Datei "${file.original_filename}" wurde von ${recipient.email} am ${templateData.downloadTime} heruntergeladen.`
      };

      const result = await this.transporter.sendMail(mailOptions);
      
      logger.info(`Download notification sent successfully`, {
        fileId: file.id,
        senderEmail: sender.email,
        messageId: result.messageId
      });

      return result;
    } catch (error) {
      logger.error('Failed to send download notification:', error);
      throw error;
    }
  }

  async sendAdminNotification(subject, message, alertType = 'info', details = null) {
    await this.ensureInitialized();

    try {
      const systemName = await SystemSetting.getSetting('SYSTEM_NAME', 'File Transfer System');
      const adminEmails = process.env.ADMIN_EMAILS?.split(',') || [];

      if (adminEmails.length === 0) {
        logger.warn('No admin emails configured for notifications');
        return;
      }

      const templateData = {
        systemName,
        subject,
        message,
        alertType,
        alertTitle: this.getAlertTitle(alertType),
        details,
        timestamp: new Date().toLocaleString('de-DE')
      };

      const template = this.templates.get('admin-notification');
      const htmlContent = template(templateData);

      const mailOptions = {
        from: process.env.EMAIL_FROM || `"${systemName}" <noreply@example.com>`,
        to: adminEmails,
        subject: `[${systemName}] ${subject}`,
        html: htmlContent,
        text: `${subject}\n\n${message}${details ? '\n\nDetails:\n' + details : ''}`
      };

      const result = await this.transporter.sendMail(mailOptions);
      
      logger.info(`Admin notification sent successfully`, {
        subject,
        alertType,
        messageId: result.messageId
      });

      return result;
    } catch (error) {
      logger.error('Failed to send admin notification:', error);
      throw error;
    }
  }

  generateTextVersion(templateData) {
    return `
Hallo,

${templateData.senderName} hat eine Datei für Sie bereitgestellt:

Datei: ${templateData.filename}
Größe: ${templateData.fileSize}
Hochgeladen am: ${templateData.uploadDate}
Gültig bis: ${templateData.expiryDate}

Download-Link: ${templateData.downloadUrl}

${templateData.customMessage ? 'Nachricht: ' + templateData.customMessage + '\n\n' : ''}

Wichtiger Hinweis: Diese Datei kann nur ${templateData.maxDownloads} Mal heruntergeladen werden und ist bis zum ${templateData.expiryDate} verfügbar.

${templateData.systemName} - Sicherer Dateitransfer
    `.trim();
  }

  getAlertTitle(alertType) {
    const titles = {
      info: 'Information',
      warning: 'Warnung',
      danger: 'Kritischer Fehler',
      success: 'Erfolg'
    };
    return titles[alertType] || 'Benachrichtigung';
  }

  async ensureInitialized() {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  async testConnection() {
    await this.ensureInitialized();
    return await this.transporter.verify();
  }

  async sendTestEmail(to) {
    await this.ensureInitialized();

    const systemName = await SystemSetting.getSetting('SYSTEM_NAME', 'File Transfer System');
    
    const mailOptions = {
      from: process.env.EMAIL_FROM || `"${systemName}" <noreply@example.com>`,
      to: to,
      subject: `Test E-Mail von ${systemName}`,
      html: `
        <h2>Test E-Mail</h2>
        <p>Dies ist eine Test-E-Mail vom ${systemName}.</p>
        <p>Wenn Sie diese E-Mail erhalten, ist die E-Mail-Konfiguration korrekt.</p>
        <p>Gesendet am: ${new Date().toLocaleString('de-DE')}</p>
      `,
      text: `Test E-Mail vom ${systemName}\n\nDies ist eine Test-E-Mail. Wenn Sie diese E-Mail erhalten, ist die E-Mail-Konfiguration korrekt.\n\nGesendet am: ${new Date().toLocaleString('de-DE')}`
    };

    return await this.transporter.sendMail(mailOptions);
  }
}

// Create singleton instance
const emailService = new EmailService();

module.exports = emailService;
