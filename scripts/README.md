# File Transfer System - Installation Scripts

## Debian/Ubuntu Automated Installation

### Quick Start

```bash
# Clone the repository
git clone https://github.com/Plummlumur/file-transfer-system.git
cd file-transfer-system

# Run the automated installer
sudo chmod +x scripts/debian-install.sh
./scripts/debian-install.sh
```

### What the script does

The `debian-install.sh` script provides a complete automated installation for Debian/Ubuntu systems:

1. **System Requirements Check**
   - Validates OS version (Debian 11/12, Ubuntu 20.04+)
   - Checks RAM (4GB minimum recommended)
   - Verifies disk space (20GB minimum recommended)

2. **Interactive Configuration**
   - Choose installation type (Docker or Manual)
   - Configure domain name
   - Setup SSL certificate email
   - Review configuration before proceeding

3. **System Preparation**
   - Updates all system packages
   - Installs Docker and Docker Compose
   - Installs Node.js 18.x LTS
   - Installs MySQL (for manual installation)
   - Installs and configures Nginx

4. **Application Deployment**
   - Creates application directories and user
   - Deploys application files
   - Generates secure environment configurations
   - Sets up database with migrations and seeding

5. **Service Configuration**
   - **Docker Mode**: Starts full Docker stack with MySQL, Redis, Backend, and Frontend
   - **Manual Mode**: Configures PM2 process manager and systemd services
   - Configures Nginx reverse proxy with security headers
   - Sets up SSL certificates with Let's Encrypt (if email provided)

6. **Security and Monitoring**
   - Configures UFW firewall
   - Sets up log rotation
   - Creates automated maintenance scripts
   - Configures daily database backups

### Installation Options

#### Docker Installation (Recommended)
- Easier to manage and update
- All services containerized
- Includes MySQL, Redis, Backend, and Frontend
- Automatic health checks and restarts

#### Manual Installation
- Direct installation with PM2 process manager
- Better for environments where Docker is not preferred
- Uses system MySQL installation
- More control over individual components

### Post-Installation

After installation completes:

1. **Configure LDAP Settings**
   ```bash
   nano /opt/file-transfer/backend/.env
   # Update LDAP_* variables
   ```

2. **Configure SMTP Settings**
   ```bash
   nano /opt/file-transfer/backend/.env
   # Update SMTP_* variables
   ```

3. **Restart Services**
   ```bash
   # Docker installation
   cd /opt/file-transfer && docker compose restart
   
   # Manual installation
   sudo systemctl restart file-transfer
   ```

4. **Access Application**
   - Navigate to your configured domain
   - Login with LDAP credentials
   - Configure system settings in admin interface

### Management Commands

#### Docker Installation
```bash
cd /opt/file-transfer

# View service status
docker compose ps

# View logs
docker compose logs -f

# Restart services
docker compose restart

# Stop all services
docker compose down

# Start services
docker compose up -d

# Update application
git pull
docker compose up -d --build
```

#### Manual Installation
```bash
# View application status
sudo -u file-transfer pm2 status

# View logs
sudo -u file-transfer pm2 logs

# Restart application
sudo -u file-transfer pm2 restart file-transfer-api

# Restart nginx
sudo systemctl restart nginx

# View system logs
tail -f /var/log/file-transfer/combined.log
```

### Troubleshooting

#### Installation Issues
- Check log file: `/tmp/file-transfer-install.log`
- Ensure system meets requirements (RAM, disk space)
- Verify internet connectivity for package downloads

#### Service Issues
```bash
# Check service status
systemctl status nginx
systemctl status mysql  # manual installation only

# Check Docker services
docker compose ps
docker compose logs backend

# Check application logs
tail -f /var/log/file-transfer/combined.log
```

#### Common Problems

1. **Port Already in Use**
   ```bash
   # Check what's using the ports
   sudo netstat -tulpn | grep :80
   sudo netstat -tulpn | grep :443
   sudo netstat -tulpn | grep :8080
   ```

2. **Database Connection Issues**
   ```bash
   # Test database connection
   mysql -u fileuser -p file_transfer
   
   # Check Docker database
   docker compose exec database mysql -u root -p
   ```

3. **SSL Certificate Issues**
   ```bash
   # Manual SSL setup
   sudo certbot --nginx -d your-domain.com
   
   # Check certificate status
   sudo certbot certificates
   ```

### Security Notes

- The script generates secure random passwords for all services
- Firewall is automatically configured with minimal required ports
- SSL certificates are automatically obtained and renewed
- All services run with least-privilege principles
- Regular security updates are recommended

### Support

For issues with the installation script:
1. Check the installation log file
2. Review the troubleshooting section
3. Ensure system requirements are met
4. Check the main project documentation in README.md