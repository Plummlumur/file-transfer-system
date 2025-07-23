-- File Transfer System Database Initialization
-- This script creates the initial database structure

-- Create database if it doesn't exist
CREATE DATABASE IF NOT EXISTS file_transfer CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE file_transfer;

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id INT PRIMARY KEY AUTO_INCREMENT,
    username VARCHAR(255) UNIQUE NOT NULL,
    email VARCHAR(255) NOT NULL,
    display_name VARCHAR(255),
    ldap_groups JSON,
    is_admin BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    last_login TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_username (username),
    INDEX idx_email (email),
    INDEX idx_is_admin (is_admin),
    INDEX idx_is_active (is_active)
) ENGINE=InnoDB;

-- Files table
CREATE TABLE IF NOT EXISTS files (
    id VARCHAR(36) PRIMARY KEY,
    filename VARCHAR(255) NOT NULL,
    original_filename VARCHAR(255) NOT NULL,
    file_size BIGINT NOT NULL,
    mime_type VARCHAR(100),
    file_path VARCHAR(500) NOT NULL,
    upload_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expiry_date TIMESTAMP NOT NULL,
    uploaded_by INT NOT NULL,
    download_count INT DEFAULT 0,
    max_downloads INT DEFAULT 1,
    status ENUM('uploading', 'ready', 'expired', 'deleted') DEFAULT 'uploading',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_uploaded_by (uploaded_by),
    INDEX idx_expiry_date (expiry_date),
    INDEX idx_status (status),
    INDEX idx_upload_date (upload_date)
) ENGINE=InnoDB;

-- File recipients table
CREATE TABLE IF NOT EXISTS file_recipients (
    id INT PRIMARY KEY AUTO_INCREMENT,
    file_id VARCHAR(36) NOT NULL,
    email VARCHAR(255) NOT NULL,
    download_token VARCHAR(255) UNIQUE NOT NULL,
    downloaded_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE,
    INDEX idx_file_id (file_id),
    INDEX idx_download_token (download_token),
    INDEX idx_email (email)
) ENGINE=InnoDB;

-- Audit logs table
CREATE TABLE IF NOT EXISTS audit_logs (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT,
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(50),
    resource_id VARCHAR(36),
    ip_address VARCHAR(45),
    user_agent TEXT,
    details JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_user_id (user_id),
    INDEX idx_action (action),
    INDEX idx_resource_type (resource_type),
    INDEX idx_created_at (created_at),
    INDEX idx_ip_address (ip_address)
) ENGINE=InnoDB;

-- System settings table
CREATE TABLE IF NOT EXISTS system_settings (
    key_name VARCHAR(100) PRIMARY KEY,
    value JSON NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    updated_by INT,
    FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_updated_by (updated_by),
    INDEX idx_updated_at (updated_at)
) ENGINE=InnoDB;

-- Insert default system settings
INSERT IGNORE INTO system_settings (key_name, value) VALUES
('MAX_FILE_SIZE', '5368709120'),
('DEFAULT_RETENTION_DAYS', '14'),
('ALLOWED_EXTENSIONS', '["pdf","doc","docx","xls","xlsx","ppt","pptx","txt","jpg","jpeg","png","gif","zip","rar","7z"]'),
('ALLOWED_LDAP_GROUPS', '["FileTransferUsers"]'),
('ADMIN_LDAP_GROUPS', '["FileTransferAdmins"]'),
('MAINTENANCE_MODE', 'false'),
('SYSTEM_NAME', '"File Transfer System"'),
('EMAIL_TEMPLATES', '{"download_notification": {"subject": "Datei zum Download bereit", "body": "Hallo,\\n\\neine Datei wurde für Sie bereitgestellt:\\n\\nDateiname: {{filename}}\\nGröße: {{filesize}}\\nDownload-Link: {{download_link}}\\n\\nDer Link ist gültig bis: {{expiry_date}}\\n\\nMit freundlichen Grüßen\\nIhr File Transfer Team"}}'),
('QUOTA_SETTINGS', '{"daily_limit": 10737418240, "monthly_limit": 107374182400, "enabled": true}'),
('SECURITY_SETTINGS', '{"max_login_attempts": 5, "lockout_duration": 900, "session_timeout": 86400}');

-- Create initial admin user (password will be set via LDAP)
INSERT IGNORE INTO users (username, email, display_name, is_admin, is_active) VALUES
('admin', 'admin@localhost', 'System Administrator', TRUE, TRUE);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_files_composite ON files(status, expiry_date, uploaded_by);
CREATE INDEX IF NOT EXISTS idx_audit_logs_composite ON audit_logs(user_id, created_at, action);
CREATE INDEX IF NOT EXISTS idx_file_recipients_composite ON file_recipients(file_id, downloaded_at);

-- Create views for common queries
CREATE OR REPLACE VIEW active_files AS
SELECT 
    f.*,
    u.username as uploader_username,
    u.display_name as uploader_name,
    COUNT(fr.id) as recipient_count,
    COUNT(CASE WHEN fr.downloaded_at IS NOT NULL THEN 1 END) as downloaded_count
FROM files f
LEFT JOIN users u ON f.uploaded_by = u.id
LEFT JOIN file_recipients fr ON f.id = fr.file_id
WHERE f.status = 'ready' AND f.expiry_date > NOW()
GROUP BY f.id;

CREATE OR REPLACE VIEW user_statistics AS
SELECT 
    u.id,
    u.username,
    u.display_name,
    COUNT(f.id) as total_uploads,
    COALESCE(SUM(f.file_size), 0) as total_size_uploaded,
    COUNT(CASE WHEN f.upload_date >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN 1 END) as uploads_last_30_days,
    COALESCE(SUM(CASE WHEN f.upload_date >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN f.file_size ELSE 0 END), 0) as size_last_30_days
FROM users u
LEFT JOIN files f ON u.id = f.uploaded_by AND f.status != 'deleted'
WHERE u.is_active = TRUE
GROUP BY u.id;

-- Create stored procedures for common operations
DELIMITER //

CREATE PROCEDURE IF NOT EXISTS CleanupExpiredFiles()
BEGIN
    DECLARE done INT DEFAULT FALSE;
    DECLARE file_id VARCHAR(36);
    DECLARE file_path VARCHAR(500);
    DECLARE cur CURSOR FOR 
        SELECT id, file_path FROM files 
        WHERE status = 'ready' AND expiry_date < NOW();
    DECLARE CONTINUE HANDLER FOR NOT FOUND SET done = TRUE;

    OPEN cur;
    read_loop: LOOP
        FETCH cur INTO file_id, file_path;
        IF done THEN
            LEAVE read_loop;
        END IF;
        
        -- Update file status to expired
        UPDATE files SET status = 'expired' WHERE id = file_id;
        
        -- Log the cleanup action
        INSERT INTO audit_logs (action, resource_type, resource_id, details, created_at)
        VALUES ('FILE_EXPIRED', 'file', file_id, JSON_OBJECT('file_path', file_path), NOW());
    END LOOP;
    CLOSE cur;
    
    SELECT ROW_COUNT() as files_expired;
END //

CREATE PROCEDURE IF NOT EXISTS GetSystemStatistics()
BEGIN
    SELECT 
        (SELECT COUNT(*) FROM users WHERE is_active = TRUE) as active_users,
        (SELECT COUNT(*) FROM files WHERE status = 'ready') as active_files,
        (SELECT COALESCE(SUM(file_size), 0) FROM files WHERE status = 'ready') as total_storage_used,
        (SELECT COUNT(*) FROM files WHERE upload_date >= DATE_SUB(NOW(), INTERVAL 24 HOUR)) as uploads_last_24h,
        (SELECT COUNT(*) FROM file_recipients WHERE downloaded_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)) as downloads_last_24h,
        (SELECT COUNT(*) FROM audit_logs WHERE created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)) as audit_events_last_24h;
END //

DELIMITER ;

-- Grant necessary permissions (adjust as needed for your setup)
-- GRANT SELECT, INSERT, UPDATE, DELETE ON file_transfer.* TO 'fileuser'@'%';
-- FLUSH PRIVILEGES;

-- Log successful initialization
INSERT INTO audit_logs (action, resource_type, details, created_at)
VALUES ('DATABASE_INITIALIZED', 'system', JSON_OBJECT('version', '1.0.0', 'timestamp', NOW()), NOW());
