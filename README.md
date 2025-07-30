# File Transfer System

A secure, enterprise-grade file transfer application with LDAP authentication, built with Node.js and React. Designed for on-premises deployment with modern UI inspired by minimalist design principles.

## 🚀 Features

### Core Functionality
- **Secure File Upload**: Large file support with resumable uploads
- **Email Notifications**: Automatic email delivery with download links
- **One-time Downloads**: Secure download links with configurable usage limits
- **File Management**: Comprehensive file lifecycle management
- **Bulk Operations**: Multiple file uploads and recipient management

### Security & Authentication
- **LDAP/Active Directory Integration**: Enterprise authentication
- **Group-based Access Control**: Role-based permissions
- **JWT Token Management**: Secure session handling
- **Audit Logging**: Comprehensive activity tracking
- **GDPR Compliance**: Data protection and privacy controls

### Administration
- **Admin Dashboard**: System monitoring and management
- **User Management**: LDAP group configuration
- **System Settings**: Configurable parameters
- **File Type Controls**: Whitelist-based file restrictions
- **Quota Management**: Upload limits and monitoring
- **Email Templates**: Customizable notification templates

### Technical Features
- **Modern UI**: Clean, minimalist design inspired by mumok.at
- **Responsive Design**: Mobile-friendly interface
- **Internationalization**: Multi-language support (German/English)
- **Health Monitoring**: System status and diagnostics
- **Automatic Cleanup**: Scheduled file maintenance
- **Error Handling**: Comprehensive error management

## 🏗️ Architecture

### Backend (Node.js)
- **Framework**: Express.js with TypeScript-like structure
- **Database**: MySQL/MSSQL with Sequelize ORM
- **Authentication**: Passport.js with LDAP strategy
- **File Handling**: Multer with resumable upload support
- **Email**: Nodemailer with template engine
- **Logging**: Winston with rotation
- **Security**: Helmet, CORS, rate limiting

### Frontend (React)
- **Framework**: React 18 with modern hooks
- **UI Library**: Ant Design with custom theming
- **State Management**: Zustand for lightweight state
- **Routing**: React Router v6
- **HTTP Client**: Axios with interceptors
- **Internationalization**: react-i18next
- **Build Tool**: Create React App

### Database Schema
```sql
-- Core tables
users (id, username, email, ldap_groups, ...)
files (id, filename, file_size, upload_date, expiry_date, ...)
file_recipients (id, file_id, email, download_token, ...)
audit_logs (id, user_id, action, resource_type, ...)
system_settings (key_name, value, updated_at, ...)
```

## 📋 Requirements

### System Requirements
- **Node.js**: 16.0.0 or higher
- **Database**: MySQL 8.0+ or SQL Server 2019+
- **Memory**: 2GB RAM minimum (4GB recommended)
- **Storage**: 10GB minimum (depends on usage)
- **OS**: Windows Server 2019+, Ubuntu 20.04+, CentOS 8+

### Network Requirements
- **LDAP/AD**: Access to directory server
- **SMTP**: Email server for notifications
- **Ports**: 8080 (API), 3000 (Frontend dev), 80/443 (Production)

## 🛠️ Installation

### Docker Setup (Recommended for Testing)

#### Automated Local Setup with SSL Support
```bash
# Clone the repository
git clone <repository-url>
cd file-transfer-system

# Run automated setup (includes SSL option)
./scripts/setup-local.sh
```

This script will:
- Set up environment files with secure passwords
- Optionally generate self-signed SSL certificates
- Build and start all services with Docker
- Run database migrations
- Show access URLs and management commands

#### Manual Docker Setup
```bash
# Clone and setup
git clone <repository-url>
cd file-transfer-system

# Create environment file
cp .env.example .env
# Edit .env with your configuration

# Generate SSL certificates for HTTPS (optional)
./scripts/generate-ssl-cert.sh localhost 365

# Start services
docker compose up -d

# Run database migrations
docker compose exec backend npm run migrate
docker compose exec backend npm run seed
```

#### Access URLs
- **HTTP**: http://localhost:8081
- **HTTPS**: https://localhost:8443 (if SSL certificates are generated)
- **API**: http://localhost:8080
- **Database**: localhost:3306
- **Redis**: localhost:6379

#### SSL Certificates for Local Testing

For local/test installations where Let's Encrypt certificates cannot be obtained, you can generate self-signed certificates:

```bash
# Generate certificates for localhost
./scripts/generate-ssl-cert.sh localhost 365

# Generate certificates for custom domain
./scripts/generate-ssl-cert.sh myapp.local 365

# Generate certificates for IP address
./scripts/generate-ssl-cert.sh 192.168.1.100 90
```

**Note**: Self-signed certificates will show browser security warnings. Click "Advanced" → "Proceed to localhost" to accept them.

### Node.js Development Setup

#### Quick Setup
```bash
# Clone the repository
git clone <repository-url>
cd file-transfer-system

# Run setup script
npm run setup

# Start development servers
npm run dev
```

#### Manual Setup

1. **Install Dependencies**
```bash
npm install
cd backend && npm install
cd ../frontend && npm install
```

2. **Configure Environment**
```bash
# Backend configuration
cp backend/.env.example backend/.env
# Edit backend/.env with your settings

# Frontend configuration
cp frontend/.env.example frontend/.env
# Edit frontend/.env with your settings
```

3. **Database Setup**
```bash
cd backend
npm run migrate
npm run seed
```

4. **Start Services**
```bash
# Development (both frontend and backend)
npm run dev

# Production
npm run build
npm start
```

## ⚙️ Configuration

### Environment Variables

#### Backend (.env)
```bash
# Database
DB_HOST=localhost
DB_NAME=file_transfer
DB_USER=root
DB_PASSWORD=password

# LDAP
LDAP_URL=ldap://your-ldap-server:389
LDAP_BIND_DN=cn=admin,dc=example,dc=com
LDAP_SEARCH_BASE=ou=users,dc=example,dc=com

# Email
SMTP_HOST=smtp.example.com
SMTP_USER=noreply@example.com
SMTP_PASSWORD=password

# File Storage
MAX_FILE_SIZE=5368709120  # 5GB
ALLOWED_EXTENSIONS=pdf,doc,docx,jpg,png,zip
DEFAULT_RETENTION_DAYS=14
```

#### Frontend (.env)
```bash
REACT_APP_API_URL=http://localhost:8080/api/v1
REACT_APP_NAME=File Transfer System
```

### System Settings
Configure through the admin interface:
- File size limits
- Allowed file types
- Retention policies
- Email templates
- User quotas
- LDAP groups

## 🚀 Deployment

### Production Deployment

1. **Build Frontend**
```bash
cd frontend
npm run build
```

2. **Configure Reverse Proxy (nginx)**
```nginx
server {
    listen 80;
    server_name your-domain.com;
    
    location / {
        root /path/to/frontend/build;
        try_files $uri $uri/ /index.html;
    }
    
    location /api/ {
        proxy_pass http://localhost:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

3. **Start Backend Service**
```bash
cd backend
NODE_ENV=production npm start
```

### Docker Deployment
```bash
# Build and run with Docker Compose
docker-compose up -d
```

### Windows Service
```bash
# Install as Windows service
npm install -g node-windows
node install-service.js
```

## 📊 Monitoring

### Health Checks
- **Endpoint**: `/api/v1/system/health`
- **Metrics**: Database, LDAP, SMTP, disk space
- **Format**: Standard health check response

### Logging
- **Application Logs**: `backend/logs/app.log`
- **Audit Logs**: Database table with configurable retention
- **Error Logs**: Separate error log files
- **Access Logs**: HTTP request logging

### Metrics
- Upload/download statistics
- User activity tracking
- System resource usage
- Error rate monitoring

## 🔧 Administration

### Admin Interface
Access via `/admin` (requires admin privileges):
- User management
- File oversight
- System configuration
- Audit log review
- Statistics dashboard

### CLI Commands
```bash
# Database operations
npm run migrate
npm run seed
npm run db:reset

# Maintenance
npm run cleanup
npm run test-email
npm run health-check

# Development
npm run dev
npm run lint
npm run test
```

### Backup & Recovery
- **Database**: Regular MySQL/MSSQL backups
- **Files**: File system backup of upload directory
- **Configuration**: Backup of .env files and settings

## 🔒 Security

### Authentication Flow
1. User enters LDAP credentials
2. Backend validates against LDAP/AD
3. JWT token issued for session
4. Group membership determines permissions

### File Security
- Files stored outside web root
- Unique file identifiers (UUIDs)
- Download tokens with expiration
- File type validation
- Size limits enforcement

### Data Protection
- GDPR-compliant data handling
- Configurable retention periods
- Secure deletion processes
- Audit trail maintenance
- Privacy policy integration

## 🐛 Troubleshooting

### Common Issues

**LDAP Connection Failed**
```bash
# Check LDAP configuration
ldapsearch -x -H ldap://server -D "bind-dn" -W

# Verify network connectivity
telnet ldap-server 389
```

**Database Connection Error**
```bash
# Test MySQL connection
mysql -h host -u user -p database

# Check Sequelize configuration
cd backend && npm run db:test
```

**File Upload Issues**
- Check disk space: `df -h`
- Verify upload directory permissions
- Review file size limits
- Check network timeouts

**Email Delivery Problems**
```bash
# Test SMTP configuration
cd backend && npm run test-email

# Check email logs
tail -f backend/logs/email.log
```

### Debug Mode
```bash
# Enable debug logging
NODE_ENV=development DEBUG=* npm run dev

# Frontend debug mode
REACT_APP_LOG_LEVEL=debug npm start
```

## 📚 API Documentation

### Authentication Endpoints
```
POST /api/v1/auth/login
POST /api/v1/auth/logout
GET  /api/v1/auth/profile
POST /api/v1/auth/refresh
```

### File Management
```
GET    /api/v1/files
POST   /api/v1/files/upload
GET    /api/v1/files/:id/download
DELETE /api/v1/files/:id
POST   /api/v1/files/:id/resend-emails
```

### Admin Endpoints
```
GET  /api/v1/admin/files
GET  /api/v1/admin/users
GET  /api/v1/admin/statistics
PUT  /api/v1/admin/settings
GET  /api/v1/admin/logs
```

### System Endpoints
```
GET /api/v1/system/health
GET /api/v1/system/info
GET /api/v1/system/capabilities
```

## 🤝 Contributing

### Development Setup
```bash
# Install development dependencies
npm run install:all

# Run tests
npm test

# Lint code
npm run lint

# Format code
npm run format
```

### Code Style
- ESLint configuration for JavaScript
- Prettier for code formatting
- Conventional commits for git messages
- JSDoc for documentation

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

### Documentation
- [Installation Guide](docs/installation.md)
- [Configuration Reference](docs/configuration.md)
- [API Documentation](docs/api.md)
- [Troubleshooting Guide](docs/troubleshooting.md)

### Community
- GitHub Issues for bug reports
- GitHub Discussions for questions
- Wiki for additional documentation

### Commercial Support
Contact for enterprise support, custom development, and professional services.

---

**File Transfer System** - Secure, scalable, and user-friendly file sharing for enterprises.
