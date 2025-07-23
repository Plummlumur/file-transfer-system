# Technische Architektur - File Transfer Anwendung

## 1. System-Architektur Überblick

### 1.1 Komponenten-Diagramm
```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Web Browser   │    │  Reverse Proxy  │    │   File Server   │
│   (React SPA)   │◄──►│ (nginx/Apache)  │◄──►│   (Node.js)     │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                                       │
                                                       ▼
                       ┌─────────────────┐    ┌─────────────────┐
                       │   LDAP/AD       │    │    Database     │
                       │   Server        │◄──►│  (MySQL/MSSQL)  │
                       └─────────────────┘    └─────────────────┘
                                                       │
                                                       ▼
                                              ┌─────────────────┐
                                              │  File Storage   │
                                              │ (Local Filesystem)│
                                              └─────────────────┘
```

### 1.2 Deployment-Architektur
- **Single Server Deployment:** Alle Komponenten auf einem Server
- **Port-Konfiguration:**
  - Frontend: Port 3000 (Development) / Port 80/443 (Production über Reverse Proxy)
  - Backend API: Port 8080
  - Database: Port 3306 (MySQL) / Port 1433 (MSSQL)

## 2. Backend-Architektur (Node.js)

### 2.1 Framework & Libraries
```json
{
  "core": "Express.js",
  "authentication": "passport.js + passport-ldapauth",
  "database": "Sequelize ORM",
  "fileUpload": "multer + resumable-js",
  "email": "nodemailer",
  "logging": "winston",
  "validation": "joi",
  "security": "helmet + cors",
  "encryption": "crypto (built-in)"
}
```

### 2.2 API-Struktur (REST)
```
/api/v1/
├── /auth
│   ├── POST /login
│   ├── POST /logout
│   └── GET /profile
├── /files
│   ├── GET / (list user files)
│   ├── POST /upload
│   ├── GET /:id/download
│   ├── DELETE /:id
│   └── POST /:id/send
├── /admin
│   ├── GET /files (all files)
│   ├── GET /users
│   ├── GET /statistics
│   ├── PUT /settings
│   └── GET /logs
└── /system
    ├── GET /health
    └── GET /info
```

### 2.3 Middleware-Stack
```javascript
app.use(helmet()); // Security headers
app.use(cors()); // CORS handling
app.use(express.json({ limit: '50mb' }));
app.use(rateLimiter); // Rate limiting
app.use(authMiddleware); // Authentication
app.use(auditLogger); // Audit logging
app.use(errorHandler); // Global error handling
```

### 2.4 Modulare Struktur
```
backend/
├── src/
│   ├── controllers/
│   │   ├── authController.js
│   │   ├── fileController.js
│   │   └── adminController.js
│   ├── middleware/
│   │   ├── auth.js
│   │   ├── upload.js
│   │   └── audit.js
│   ├── models/
│   │   ├── User.js
│   │   ├── File.js
│   │   └── AuditLog.js
│   ├── services/
│   │   ├── ldapService.js
│   │   ├── emailService.js
│   │   └── fileService.js
│   ├── routes/
│   └── utils/
└── uploads/ (file storage)
```

## 3. Frontend-Architektur (React)

### 3.1 Technology Stack
```json
{
  "framework": "React 18",
  "routing": "React Router v6",
  "stateManagement": "Zustand",
  "uiLibrary": "Ant Design",
  "httpClient": "Axios",
  "fileUpload": "react-dropzone + resumable-js",
  "forms": "React Hook Form",
  "i18n": "react-i18next"
}
```

### 3.2 Komponenten-Architektur
```
src/
├── components/
│   ├── common/
│   │   ├── Layout.jsx
│   │   ├── Header.jsx
│   │   └── Sidebar.jsx
│   ├── upload/
│   │   ├── FileUploader.jsx
│   │   ├── UploadProgress.jsx
│   │   └── EmailForm.jsx
│   ├── files/
│   │   ├── FileList.jsx
│   │   ├── FilePreview.jsx
│   │   └── FileActions.jsx
│   └── admin/
│       ├── UserManagement.jsx
│       ├── SystemSettings.jsx
│       └── AuditLogs.jsx
├── pages/
│   ├── LoginPage.jsx
│   ├── DashboardPage.jsx
│   ├── UploadPage.jsx
│   └── AdminPage.jsx
├── hooks/
│   ├── useAuth.js
│   ├── useFileUpload.js
│   └── useApi.js
├── stores/
│   ├── authStore.js
│   ├── fileStore.js
│   └── configStore.js
└── utils/
    ├── api.js
    ├── fileUtils.js
    └── validation.js
```

### 3.3 State Management (Zustand)
```javascript
// authStore.js
const useAuthStore = create((set) => ({
  user: null,
  isAuthenticated: false,
  login: (userData) => set({ user: userData, isAuthenticated: true }),
  logout: () => set({ user: null, isAuthenticated: false })
}));

// fileStore.js
const useFileStore = create((set) => ({
  files: [],
  uploadProgress: {},
  addFile: (file) => set((state) => ({ files: [...state.files, file] })),
  updateProgress: (fileId, progress) => set((state) => ({
    uploadProgress: { ...state.uploadProgress, [fileId]: progress }
  }))
}));
```

## 4. Datenbank-Design

### 4.1 Entity Relationship Diagram
```sql
-- Users Table
CREATE TABLE users (
    id INT PRIMARY KEY AUTO_INCREMENT,
    username VARCHAR(255) UNIQUE NOT NULL,
    email VARCHAR(255) NOT NULL,
    display_name VARCHAR(255),
    ldap_groups JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP
);

-- Files Table
CREATE TABLE files (
    id VARCHAR(36) PRIMARY KEY, -- UUID
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
    FOREIGN KEY (uploaded_by) REFERENCES users(id)
);

-- File Recipients Table
CREATE TABLE file_recipients (
    id INT PRIMARY KEY AUTO_INCREMENT,
    file_id VARCHAR(36) NOT NULL,
    email VARCHAR(255) NOT NULL,
    download_token VARCHAR(255) UNIQUE NOT NULL,
    downloaded_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE
);

-- Audit Logs Table
CREATE TABLE audit_logs (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT,
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(50),
    resource_id VARCHAR(36),
    ip_address VARCHAR(45),
    user_agent TEXT,
    details JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- System Settings Table
CREATE TABLE system_settings (
    key_name VARCHAR(100) PRIMARY KEY,
    value JSON NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    updated_by INT,
    FOREIGN KEY (updated_by) REFERENCES users(id)
);
```

### 4.2 Indizes für Performance
```sql
CREATE INDEX idx_files_uploaded_by ON files(uploaded_by);
CREATE INDEX idx_files_expiry_date ON files(expiry_date);
CREATE INDEX idx_files_status ON files(status);
CREATE INDEX idx_file_recipients_token ON file_recipients(download_token);
CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);
```

## 5. Sicherheits-Architektur

### 5.1 Authentifizierung & Autorisierung
```javascript
// JWT-basierte Session mit LDAP
const authFlow = {
  1: "User sendet Credentials an /api/auth/login",
  2: "Backend validiert gegen LDAP/AD",
  3: "Bei Erfolg: JWT-Token generieren",
  4: "Token enthält: userId, groups, permissions, expiry",
  5: "Frontend speichert Token im httpOnly Cookie",
  6: "Jede API-Anfrage validiert Token im authMiddleware"
};
```

### 5.2 File Upload Security
```javascript
const uploadSecurity = {
  fileValidation: [
    "MIME-Type Validation",
    "File Extension Whitelist",
    "Magic Number Validation",
    "File Size Limits"
  ],
  virusScanning: "ClamAV Integration (optional)",
  pathTraversal: "Sanitized filename generation",
  storage: "Files außerhalb des Web-Root"
};
```

### 5.3 Verschlüsselung
```javascript
const encryption = {
  transport: "TLS 1.2+ für alle Verbindungen",
  passwords: "bcrypt für Admin-Accounts",
  tokens: "HMAC-SHA256 für Download-Tokens",
  files: "AES-256 optional für File-at-Rest"
};
```

## 6. Integration-Architektur

### 6.1 LDAP/Active Directory Integration
```javascript
// passport-ldapauth Konfiguration
const ldapConfig = {
  server: {
    url: process.env.LDAP_URL,
    bindDN: process.env.LDAP_BIND_DN,
    bindCredentials: process.env.LDAP_BIND_PASSWORD,
    searchBase: process.env.LDAP_SEARCH_BASE,
    searchFilter: '(sAMAccountName={{username}})',
    groupSearchBase: process.env.LDAP_GROUP_BASE,
    groupSearchFilter: '(member={{dn}})'
  }
};
```

### 6.2 E-Mail-System
```javascript
// Nodemailer mit Template-Engine
const emailConfig = {
  transport: "SMTP",
  templates: "Handlebars-basiert",
  queue: "Bull Queue für Retry-Logic",
  bounce_handling: "Webhook für Delivery-Status"
};
```

### 6.3 File Storage Management
```javascript
const fileStorage = {
  structure: "/uploads/YYYY/MM/DD/uuid-filename",
  cleanup: "Cron Job für expired files",
  metadata: "Separate JSON files für Recovery",
  chunking: "Resumable.js für große Dateien"
};
```

## 7. Performance & Skalierung

### 7.1 Caching-Strategie
```javascript
const caching = {
  redis: "Session Storage & Rate Limiting",
  memory: "System Settings & User Groups",
  http: "Static Assets (nginx)",
  database: "Connection Pooling"
};
```

### 7.2 Upload-Optimierung
```javascript
const uploadOptimization = {
  chunking: "1MB Chunks für Resumable Uploads",
  parallel: "Max 3 simultane Chunks",
  compression: "gzip für kleine Dateien",
  progress: "WebSocket für Real-time Updates"
};
```

## 8. Monitoring & Logging

### 8.1 Logging-Architektur
```javascript
// Winston Logger Konfiguration
const logConfig = {
  levels: ["error", "warn", "info", "debug"],
  transports: [
    "Console (Development)",
    "File Rotation (Production)",
    "Database (Audit Logs)"
  ],
  format: "JSON mit Timestamp, RequestID, User Context"
};
```

### 8.2 Health Monitoring
```javascript
const healthChecks = {
  endpoint: "/api/system/health",
  checks: [
    "Database Connection",
    "File System Access",
    "LDAP Connectivity",
    "SMTP Server",
    "Disk Space"
  ],
  format: "Standard Health Check Response Format"
};
```

## 9. Deployment-Architektur

### 9.1 Container-Struktur (Docker)
```yaml
# docker-compose.yml
version: '3.8'
services:
  app:
    build: .
    ports:
      - "8080:8080"
    volumes:
      - ./uploads:/app/uploads
      - ./logs:/app/logs
    environment:
      - NODE_ENV=production
      - DB_HOST=db
  
  db:
    image: mysql:8.0
    volumes:
      - mysql_data:/var/lib/mysql
    environment:
      - MYSQL_ROOT_PASSWORD=${DB_PASSWORD}
  
  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
      - ./ssl:/etc/nginx/ssl
```

### 9.2 Production Setup
```bash
# Installation Script
#!/bin/bash
1. System Requirements Check
2. Node.js & npm Installation
3. Database Setup (MySQL/MSSQL)
4. SSL Certificate Configuration
5. Environment Variables Setup
6. First Admin User Creation
7. Service Registration (systemd)
8. Nginx/Apache Configuration
9. Firewall Setup
10. Health Check Verification
```

Diese technische Architektur bietet eine solide, skalierbare und sichere Basis für Ihre File-Transfer-Anwendung. Haben Sie Fragen zu bestimmten Aspekten oder möchten Sie Details zu bestimmten Bereichen vertiefen?