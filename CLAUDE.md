# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Full Stack Development
```bash
# Install all dependencies
npm run install:all

# Run development servers (both backend and frontend)
npm run dev

# Run initial setup (creates directories, copies env files)
npm run setup
```

### Backend Commands (run from `/backend`)
```bash
# Development server with hot reload
npm run dev

# Production server
npm start

# Database operations
npm run migrate    # Run database migrations
npm run seed      # Seed database with initial data

# Testing and linting
npm test          # Run Jest tests
npm run lint      # ESLint code checking
```

### Frontend Commands (run from `/frontend`)
```bash
# Development server
npm start

# Production build
npm run build

# Testing and linting
npm test          # React testing library tests
npm run lint      # ESLint code checking
```

### Docker Commands
```bash
# Build and run entire stack
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

## Architecture Overview

### Monorepo Structure
- **Root**: Contains shared scripts and Docker configuration
- **Backend**: Express.js API server with MySQL database
- **Frontend**: React SPA with Ant Design components

### Backend Architecture (Express.js + MySQL)
- **Models**: Sequelize ORM with models in `/backend/src/models/`
  - User, File, FileRecipient, AuditLog, SystemSetting
  - Associations defined in `/backend/src/models/index.js`
- **Routes**: RESTful API endpoints in `/backend/src/routes/`
  - auth.js, files.js, admin.js, system.js
- **Middleware**: Authentication, rate limiting, audit logging, error handling
- **Services**: Business logic (fileService.js, emailService.js)
- **Authentication**: Passport.js with LDAP strategy + JWT tokens
- **File Storage**: Multer for uploads, stored outside web root
- **Database**: MySQL with Sequelize ORM, migrations in `/backend/src/database/`

### Frontend Architecture (React + Ant Design)
- **State Management**: Zustand stores in `/frontend/src/stores/`
  - authStore.js (authentication state)
  - fileStore.js (file operations)
  - configStore.js (app configuration)
- **Routing**: React Router v6 with protected routes
- **Components**: Organized in `/frontend/src/components/common/`
- **Pages**: Main application views in `/frontend/src/pages/`
- **API Communication**: Axios client in `/frontend/src/utils/api.js`
- **Internationalization**: react-i18next with German/English support
- **Theme**: Custom Ant Design theme inspired by minimalist design

### Key Integrations
- **LDAP Authentication**: Users authenticate via Active Directory/LDAP
- **Email Notifications**: Nodemailer with Handlebars templates
- **File Processing**: Sharp for images, pdf-thumbnail for PDFs
- **Audit Logging**: All user actions tracked in audit_logs table
- **Cron Jobs**: Automatic file cleanup via `/backend/src/jobs/cleanupJob.js`

## Database Schema
Core tables: users, files, file_recipients, audit_logs, system_settings
- Files are linked to uploaders (users table)
- Recipients get download tokens with expiration
- All actions logged to audit_logs
- System configuration in system_settings table

## Configuration
- Backend environment: `/backend/.env` (copy from `.env.example`)
- Frontend environment: `/frontend/.env` (copy from `.env.example`)
- Docker environment: `.env` file in root for docker-compose
- LDAP, SMTP, database, and JWT settings required for full functionality

## Testing Strategy
- Backend: Jest with Supertest for API testing
- Frontend: React Testing Library with Jest
- Run `npm test` in respective directories
- Integration tests cover authentication, file operations, and admin functions

## Security Features
- LDAP/AD authentication with group-based permissions
- JWT tokens with configurable expiration
- Rate limiting on all endpoints
- File type validation and size limits
- Audit logging for compliance
- GDPR-compliant data handling

## Deployment Notes
- Production builds with `npm run build` (frontend)
- Docker Compose for containerized deployment
- Nginx reverse proxy configuration included
- Health check endpoints at `/api/v1/system/health`
- Supports Windows Server and Linux deployment