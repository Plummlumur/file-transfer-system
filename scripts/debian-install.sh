#!/bin/bash

# File Transfer System - Automated Debian Installation Script
# Supports: Debian 11 (Bullseye), Debian 12 (Bookworm), Ubuntu 20.04+
# Version: 1.0.0
# License: MIT

set -euo pipefail  # Exit on error, undefined vars, pipe failures

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration variables
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
APP_DIR="/opt/file-transfer"
APP_USER="file-transfer"
DOMAIN=""
EMAIL=""
INSTALL_TYPE=""
USE_DOCKER="true"
SSL_TYPE=""
USE_SELF_SIGNED="false"

# Logging
LOG_FILE="/tmp/file-transfer-install.log"
exec 1> >(tee -a "$LOG_FILE")
exec 2> >(tee -a "$LOG_FILE" >&2)

# Helper functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] INFO: $1" >> "$LOG_FILE"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] SUCCESS: $1" >> "$LOG_FILE"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] WARNING: $1" >> "$LOG_FILE"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: $1" >> "$LOG_FILE"
}

# Error handler
error_exit() {
    log_error "$1"
    log_error "Installation failed. Check log file: $LOG_FILE"
    exit 1
}

# Check if running as root
check_root() {
    if [[ $EUID -eq 0 ]]; then
        error_exit "This script should not be run as root. Please run as a regular user with sudo privileges."
    fi
    
    # Check sudo access
    if ! sudo -n true 2>/dev/null; then
        log_info "This script requires sudo privileges. You may be prompted for your password."
        sudo -v || error_exit "sudo access required"
    fi
}

# Check system requirements
check_requirements() {
    log_info "Checking system requirements..."
    
    # Check OS
    if [[ ! -f /etc/os-release ]]; then
        error_exit "Cannot determine OS version"
    fi
    
    source /etc/os-release
    log_info "Detected OS: $PRETTY_NAME"
    
    case "$ID" in
        debian)
            if [[ "$VERSION_ID" != "11" && "$VERSION_ID" != "12" && "$VERSION_ID" != "13" ]]; then
                log_warning "This script is tested on Debian 11/12/13. Your version: $VERSION_ID"
            fi
            ;;
        ubuntu)
            local ubuntu_version="${VERSION_ID%.*}"
            if [[ "$ubuntu_version" -lt 20 ]]; then
                error_exit "Ubuntu 20.04 or higher required. Your version: $VERSION_ID"
            elif [[ "$ubuntu_version" -ge 20 ]]; then
                log_info "Ubuntu $VERSION_ID detected - supported"
            fi
            ;;
        *)
            log_warning "Unsupported OS: $ID ($VERSION_ID). Continuing anyway..."
            ;;
    esac
    
    # Check RAM
    local ram_gb=$(free -g | awk '/^Mem:/{print $2}')
    if [[ $ram_gb -lt 4 ]]; then
        log_warning "Recommended minimum RAM is 4GB. Detected: ${ram_gb}GB"
    fi
    
    # Check disk space
    local disk_gb=$(df -BG / | awk 'NR==2{gsub(/G/,""); print $4}')
    if [[ $disk_gb -lt 20 ]]; then
        log_warning "Recommended minimum free space is 20GB. Available: ${disk_gb}GB"
    fi
    
    # Check Node.js version requirement
    local node_version="20"
    log_info "Node.js $node_version.x LTS will be installed"
    
    log_success "System requirements check completed"
}

# Interactive configuration
interactive_config() {
    echo -e "\n${BLUE}=== File Transfer System Installation Configuration ===${NC}\n"
    
    # Installation type
    echo "Select installation type:"
    echo "1) Production (Manual installation with system services)"
    echo "2) Docker (Containerized installation)"
    echo "3) Local Development (Docker with development settings)"
    read -p "Choice [1-3]: " choice
    
    case $choice in
        1) USE_DOCKER="false"; INSTALL_TYPE="production" ;;
        2) USE_DOCKER="true"; INSTALL_TYPE="docker" ;;
        3) USE_DOCKER="true"; INSTALL_TYPE="development" ;;
        *) log_warning "Invalid choice, defaulting to Docker"; USE_DOCKER="true"; INSTALL_TYPE="docker" ;;
    esac
    
    # Domain configuration
    if [[ "$INSTALL_TYPE" == "development" ]]; then
        log_info "Development mode: Using localhost as domain"
        DOMAIN="localhost"
    else
        read -p "Enter your domain name (e.g., files.company.com): " DOMAIN
        if [[ -z "$DOMAIN" ]]; then
            error_exit "Domain name is required"
        fi
    fi
    
    # SSL certificate configuration
    echo ""
    echo "SSL Certificate Configuration:"
    if [[ "$INSTALL_TYPE" == "development" ]]; then
        echo "1) Self-signed certificate (for local HTTPS testing)"
        echo "2) HTTP only (no SSL)"
        read -p "Choice [1-2]: " ssl_choice
        
        case $ssl_choice in
            1) SSL_TYPE="self-signed"; USE_SELF_SIGNED="true" ;;
            2) SSL_TYPE="none"; USE_SELF_SIGNED="false" ;;
            *) log_warning "Invalid choice, defaulting to self-signed"; SSL_TYPE="self-signed"; USE_SELF_SIGNED="true" ;;
        esac
    else
        echo "1) Let's Encrypt certificate (requires public domain)"
        echo "2) Self-signed certificate (for internal/test use)"
        echo "3) Manual SSL setup (I'll configure SSL later)"
        read -p "Choice [1-3]: " ssl_choice
        
        case $ssl_choice in
            1) 
                SSL_TYPE="letsencrypt"
                read -p "Enter email for Let's Encrypt certificate: " EMAIL
                if [[ -z "$EMAIL" ]]; then
                    log_warning "Email required for Let's Encrypt. Falling back to self-signed."
                    SSL_TYPE="self-signed"
                    USE_SELF_SIGNED="true"
                fi
                ;;
            2) SSL_TYPE="self-signed"; USE_SELF_SIGNED="true" ;;
            3) SSL_TYPE="manual" ;;
            *) log_warning "Invalid choice, defaulting to self-signed"; SSL_TYPE="self-signed"; USE_SELF_SIGNED="true" ;;
        esac
    fi
    
    # Confirmation
    echo -e "\n${YELLOW}Configuration Summary:${NC}"
    echo "- Installation Type: $INSTALL_TYPE"
    echo "- Domain: $DOMAIN"
    echo "- SSL Certificate: $SSL_TYPE"
    if [[ "$SSL_TYPE" == "letsencrypt" ]]; then
        echo "- Email: $EMAIL"
    fi
    echo "- Installation Directory: $APP_DIR"
    if [[ "$INSTALL_TYPE" == "development" ]]; then
        echo "- HTTP URL: http://localhost:8081"
        if [[ "$USE_SELF_SIGNED" == "true" ]]; then
            echo "- HTTPS URL: https://localhost:8443"
        fi
    fi
    echo ""
    
    read -p "Continue with installation? [y/N]: " confirm
    if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
        log_info "Installation cancelled by user"
        exit 0
    fi
}

# Update system
update_system() {
    log_info "Updating system packages..."
    
    # Update package lists
    sudo apt update || error_exit "Failed to update package lists"
    
    # Upgrade existing packages
    sudo apt upgrade -y || log_warning "Some packages failed to upgrade"
    
    # Install essential packages
    local essential_packages=(
        "curl"
        "wget" 
        "git"
        "unzip"
        "software-properties-common"
        "apt-transport-https"
        "ca-certificates"
        "gnupg"
        "lsb-release"
        "build-essential"
        "openssl"
        "ufw"
        "logrotate"
    )
    
    log_info "Installing essential packages..."
    for package in "${essential_packages[@]}"; do
        if ! dpkg -l | grep -q "^ii  $package "; then
            log_info "Installing $package..."
            sudo apt install -y "$package" || log_warning "Failed to install $package"
        fi
    done
    
    log_success "System packages updated"
}

# Install Docker
install_docker() {
    if command -v docker &> /dev/null; then
        log_info "Docker already installed: $(docker --version)"
        # Check if user can access docker without sudo
        if ! docker ps &>/dev/null; then
            log_info "Adding current user to docker group..."
            sudo usermod -aG docker $USER
            log_warning "Docker group added. Group changes will take effect for new sessions."
        fi
        return 0
    fi
    
    log_info "Installing Docker..."
    
    # Use Docker's official convenience script for better compatibility
    curl -fsSL https://get.docker.com -o get-docker.sh
    sudo sh get-docker.sh
    rm get-docker.sh
    
    # Add user to docker group
    sudo usermod -aG docker $USER
    
    # Enable and start Docker
    sudo systemctl enable docker
    sudo systemctl start docker
    
    log_success "Docker installed successfully"
    log_warning "Docker group added. Group changes will take effect for new sessions."
}

# Install Node.js
install_nodejs() {
    local required_version=20
    if command -v node &> /dev/null && [[ $(node -v | cut -d'v' -f2 | cut -d'.' -f1) -ge $required_version ]]; then
        log_info "Node.js already installed: $(node --version)"
        return 0
    fi
    
    log_info "Installing Node.js ${required_version}.x LTS..."
    
    # Remove old NodeSource repository if it exists
    sudo rm -f /etc/apt/sources.list.d/nodesource.list
    sudo rm -f /usr/share/keyrings/nodesource.gpg
    
    # Install Node.js using the new NodeSource setup
    curl -fsSL https://deb.nodesource.com/setup_${required_version}.x | sudo -E bash -
    sudo apt install -y nodejs
    
    # Verify installation
    if ! command -v node &> /dev/null; then
        error_exit "Node.js installation failed"
    fi
    
    local installed_version=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
    if [[ $installed_version -lt $required_version ]]; then
        log_warning "Installed Node.js version ($installed_version) is older than recommended ($required_version)"
    fi
    
    log_success "Node.js installed: $(node --version)"
    log_success "npm installed: $(npm --version)"
}

# Install MySQL (for manual installation)
install_mysql() {
    if [[ "$USE_DOCKER" == "true" ]]; then
        log_info "Skipping MySQL installation (using Docker)"
        return 0
    fi
    
    if command -v mysql &> /dev/null; then
        log_info "MySQL already installed"
        return 0
    fi
    
    log_info "Installing MySQL Server..."
    
    # Generate secure root password
    local mysql_root_password=$(openssl rand -hex 32)
    
    # Set MySQL to non-interactive mode
    sudo debconf-set-selections <<< "mysql-server mysql-server/root_password password $mysql_root_password"
    sudo debconf-set-selections <<< "mysql-server mysql-server/root_password_again password $mysql_root_password"
    export DEBIAN_FRONTEND=noninteractive
    
    # Install MySQL server (prefer mysql-server-8.0 for modern installations)
    if sudo apt install -y mysql-server mysql-client 2>/dev/null; then
        log_info "Installed mysql-server"
    else
        error_exit "Failed to install MySQL server. Please install manually."
    fi
    
    unset DEBIAN_FRONTEND
    
    # Start MySQL service
    sudo systemctl start mysql
    sudo systemctl enable mysql
    
    # Wait for MySQL to be ready
    log_info "Waiting for MySQL to start..."
    local retries=10
    while [[ $retries -gt 0 ]]; do
        if sudo mysql -u root -e "SELECT 1;" &>/dev/null || sudo mysql -u root -p"$mysql_root_password" -e "SELECT 1;" &>/dev/null; then
            break
        fi
        log_info "MySQL not ready yet, waiting... ($retries retries left)"
        sleep 3
        ((retries--))
    done
    
    if [[ $retries -eq 0 ]]; then
        error_exit "MySQL failed to start properly"
    fi
    
    # Secure MySQL installation using mysql_secure_installation equivalent
    log_info "Securing MySQL installation..."
    
    # Try to connect without password first (MySQL 8.0+ may use auth_socket)
    local mysql_cmd="sudo mysql -u root"
    if ! $mysql_cmd -e "SELECT 1;" &>/dev/null; then
        mysql_cmd="sudo mysql -u root -p$mysql_root_password"
    fi
    
    # Set root password and secure installation
    $mysql_cmd -e "ALTER USER 'root'@'localhost' IDENTIFIED WITH mysql_native_password BY '$mysql_root_password';" 2>/dev/null || true
    $mysql_cmd -e "DELETE FROM mysql.user WHERE User='';" 2>/dev/null || true
    $mysql_cmd -e "DELETE FROM mysql.user WHERE User='root' AND Host NOT IN ('localhost', '127.0.0.1', '::1');" 2>/dev/null || true
    $mysql_cmd -e "DROP DATABASE IF EXISTS test;" 2>/dev/null || true
    $mysql_cmd -e "DELETE FROM mysql.db WHERE Db='test' OR Db='test\\_%';" 2>/dev/null || true
    $mysql_cmd -e "FLUSH PRIVILEGES;" 2>/dev/null || true
    
    # Create database and user
    log_info "Creating database and user..."
    local db_password=$(openssl rand -hex 32)
    $mysql_cmd -e "CREATE DATABASE file_transfer CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
    $mysql_cmd -e "CREATE USER 'fileuser'@'localhost' IDENTIFIED BY '$db_password';"
    $mysql_cmd -e "GRANT ALL PRIVILEGES ON file_transfer.* TO 'fileuser'@'localhost';"
    $mysql_cmd -e "FLUSH PRIVILEGES;"
    
    # Save credentials
    echo "DB_PASSWORD=$db_password" >> "$APP_DIR/.env.production"
    
    log_success "MySQL installed and configured"
}

# Install Nginx
install_nginx() {
    if command -v nginx &> /dev/null; then
        log_info "Nginx already installed"
        return 0
    fi
    
    log_info "Installing Nginx..."
    sudo apt install -y nginx
    
    # Enable and start Nginx
    sudo systemctl enable nginx
    sudo systemctl start nginx
    
    log_success "Nginx installed and started"
}

# Create application user and directories
setup_application() {
    log_info "Setting up application environment..."
    
    # Create application user (only for manual installation)
    if [[ "$USE_DOCKER" == "false" ]]; then
        if ! id "$APP_USER" &>/dev/null; then
            sudo useradd -r -s /bin/false -d "$APP_DIR" "$APP_USER"
            log_info "Created application user: $APP_USER"
        fi
    fi
    
    # Create application directory
    sudo mkdir -p "$APP_DIR"
    sudo mkdir -p "$APP_DIR/backups"
    sudo mkdir -p "$APP_DIR/logs"
    sudo mkdir -p "/var/log/file-transfer"
    
    # Set ownership
    if [[ "$USE_DOCKER" == "true" ]]; then
        sudo chown -R $USER:$USER "$APP_DIR"
    else
        sudo chown -R $APP_USER:$APP_USER "$APP_DIR"
        sudo chown -R $USER:$USER "$APP_DIR" # Temporary for installation
    fi
    
    log_success "Application environment setup completed"
}

# Deploy application files
deploy_application() {
    log_info "Deploying application files..."
    
    # Copy application files
    sudo cp -r "$PROJECT_DIR"/* "$APP_DIR/"
    sudo chown -R $USER:$USER "$APP_DIR"
    
    # Create environment files
    if [[ ! -f "$APP_DIR/.env" ]]; then
        log_info "Creating Docker environment file..."
        
        # Determine frontend URL based on installation type and SSL
        local frontend_url
        if [[ "$INSTALL_TYPE" == "development" ]]; then
            if [[ "$USE_SELF_SIGNED" == "true" ]]; then
                frontend_url="https://localhost:8443"
            else
                frontend_url="http://localhost:8081"
            fi
        else
            if [[ "$SSL_TYPE" == "none" ]]; then
                frontend_url="http://$DOMAIN"
            else
                frontend_url="https://$DOMAIN"
            fi
        fi
        
        cat > "$APP_DIR/.env" << EOF
# Database Configuration
DB_ROOT_PASSWORD=$(openssl rand -hex 32)
DB_NAME=file_transfer
DB_USER=fileuser
DB_PASSWORD=$(openssl rand -hex 32)

# JWT Configuration
JWT_SECRET=$(openssl rand -hex 64)

# Redis Configuration
REDIS_PASSWORD=$(openssl rand -hex 32)

# LDAP Configuration (CONFIGURE THESE)
LDAP_URL=ldap://your-ldap-server:389
LDAP_BIND_DN=cn=service-account,ou=users,dc=company,dc=com
LDAP_BIND_PASSWORD=ldap-service-password
LDAP_SEARCH_BASE=ou=users,dc=company,dc=com

# SMTP Configuration (CONFIGURE THESE)  
SMTP_HOST=smtp.company.com
SMTP_USER=noreply@company.com
SMTP_PASSWORD=smtp-password

# Application Configuration
FRONTEND_URL=$frontend_url
NODE_ENV=$(if [[ "$INSTALL_TYPE" == "development" ]]; then echo "development"; else echo "production"; fi)
EOF
    fi
    
    # Backend environment
    if [[ ! -f "$APP_DIR/backend/.env" ]]; then
        log_info "Creating backend environment file..."
        cp "$APP_DIR/backend/.env.example" "$APP_DIR/backend/.env"
        
        # Update backend .env with generated values
        sed -i "s|DB_HOST=.*|DB_HOST=${USE_DOCKER:+database}${USE_DOCKER:-localhost}|" "$APP_DIR/backend/.env"
        sed -i "s|DB_NAME=.*|DB_NAME=file_transfer|" "$APP_DIR/backend/.env"
        sed -i "s|DB_USER=.*|DB_USER=fileuser|" "$APP_DIR/backend/.env"
        sed -i "s|NODE_ENV=.*|NODE_ENV=production|" "$APP_DIR/backend/.env"
        sed -i "s|FRONTEND_URL=.*|FRONTEND_URL=$frontend_url|" "$APP_DIR/backend/.env"
    fi
    
    # Frontend environment
    if [[ ! -f "$APP_DIR/frontend/.env" ]]; then
        log_info "Creating frontend environment file..."
        cp "$APP_DIR/frontend/.env.example" "$APP_DIR/frontend/.env"
        # Determine API URL based on installation type
        local api_url
        if [[ "$INSTALL_TYPE" == "development" ]]; then
            api_url="http://localhost:8080/api/v1"
        else
            if [[ "$SSL_TYPE" == "none" ]]; then
                api_url="http://$DOMAIN/api/v1"
            else
                api_url="https://$DOMAIN/api/v1"
            fi
        fi
        sed -i "s|REACT_APP_API_URL=.*|REACT_APP_API_URL=$api_url|" "$APP_DIR/frontend/.env"
    fi
    
    # Update docker-compose.yml for development mode
    if [[ "$INSTALL_TYPE" == "development" ]]; then
        log_info "Configuring Docker Compose for development mode..."
        
        # Update frontend ports for development (8081:80, 8443:443)
        sed -i 's/- "80:80"/- "8081:80"/' "$APP_DIR/docker-compose.yml"
        sed -i 's/- "443:443"/- "8443:443"/' "$APP_DIR/docker-compose.yml"
        
        log_info "Development mode ports configured: HTTP=8081, HTTPS=8443"
    fi
    
    log_success "Application files deployed"
}

# Docker installation
install_docker_stack() {
    if [[ "$USE_DOCKER" != "true" ]]; then
        return 0
    fi
    
    log_info "Starting Docker stack installation..."
    
    cd "$APP_DIR"
    
    # Determine docker command (with or without sudo)
    local docker_cmd="docker"
    if ! docker ps &>/dev/null; then
        log_info "Using sudo for Docker commands (group changes require new session)"
        docker_cmd="sudo docker"
    fi
    
    # Build and start containers
    log_info "Building and starting Docker containers..."
    if ! ${docker_cmd} ps &>/dev/null; then
        error_exit "Cannot connect to Docker daemon. Please ensure Docker is running and user has proper permissions."
    fi
    
    # Force a clean build to avoid cache issues
    log_info "Cleaning Docker build cache..."
    ${docker_cmd} compose down --volumes --remove-orphans 2>/dev/null || true
    ${docker_cmd} system prune -f --filter "until=1h" 2>/dev/null || true
    
    log_info "Building containers with no cache..."
    ${docker_cmd} compose build --no-cache --pull
    
    log_info "Starting containers..."
    ${docker_cmd} compose up -d
    
    # Wait for services to be ready
    log_info "Waiting for services to start..."
    sleep 30
    
    # Check service health
    local retries=12
    while [[ $retries -gt 0 ]]; do
        if ${docker_cmd} compose ps | grep -q "Up"; then
            log_success "Docker services are running"
            break
        fi
        log_info "Waiting for services... ($retries retries left)"
        sleep 10
        ((retries--))
    done
    
    if [[ $retries -eq 0 ]]; then
        log_error "Docker services failed to start properly. Checking logs..."
        ${docker_cmd} compose logs --tail=20
        error_exit "Docker services failed to start properly"
    fi
    
    # Wait for backend service to be fully ready
    log_info "Waiting for backend service to be ready..."
    local backend_retries=20
    while [[ $backend_retries -gt 0 ]]; do
        if ${docker_cmd} compose exec -T backend echo "Backend ready" &>/dev/null; then
            log_success "Backend service is ready"
            break
        fi
        log_info "Backend not ready yet, waiting... ($backend_retries retries left)"
        sleep 5
        ((backend_retries--))
    done
    
    if [[ $backend_retries -eq 0 ]]; then
        log_warning "Backend service not responding, but continuing with migrations"
    fi
    
    # Run database migrations
    log_info "Running database migrations..."
    if ${docker_cmd} compose exec -T backend npm run migrate; then
        log_success "Database migrations completed successfully"
    else
        log_warning "Migration failed - database may need manual setup"
        log_info "You can manually run migrations later with:"
        log_info "  ${docker_cmd} compose exec backend npm run migrate"
    fi
    
    # Seed database
    log_info "Seeding database with initial data..."
    if ${docker_cmd} compose exec -T backend npm run seed; then
        log_success "Database seeding completed successfully"
    else
        log_warning "Seeding failed - continuing anyway"
        log_info "You can manually run seeding later with:"
        log_info "  ${docker_cmd} compose exec backend npm run seed"
    fi
    
    log_success "Docker stack installation completed"
}

# Manual installation
install_manual_stack() {
    if [[ "$USE_DOCKER" == "true" ]]; then
        return 0
    fi
    
    log_info "Starting manual installation..."
    
    cd "$APP_DIR"
    
    # Install application dependencies
    log_info "Installing application dependencies..."
    npm run install:all
    
    # Build frontend
    log_info "Building frontend..."
    cd frontend && npm run build && cd ..
    
    # Run database migrations
    log_info "Running database migrations..."
    cd backend && npm run migrate && npm run seed && cd ..
    
    # Install PM2 globally
    log_info "Installing PM2 process manager..."
    sudo npm install -g pm2
    
    # Create PM2 ecosystem file
    log_info "Creating PM2 configuration..."
    cat > ecosystem.config.js << EOF
module.exports = {
  apps: [{
    name: 'file-transfer-api',
    script: 'backend/src/server.js',
    cwd: '$APP_DIR',
    instances: 1,
    exec_mode: 'fork',
    user: '$APP_USER',
    env: {
      NODE_ENV: 'production',
      PORT: 8080
    },
    log_file: '/var/log/file-transfer/combined.log',
    out_file: '/var/log/file-transfer/out.log',
    error_file: '/var/log/file-transfer/error.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
  }]
};
EOF
    
    # Set final ownership
    sudo chown -R $APP_USER:$APP_USER "$APP_DIR"
    sudo chmod -R 755 "$APP_DIR"
    
    # Start application
    log_info "Starting application with PM2..."
    sudo -u $APP_USER pm2 start ecosystem.config.js
    sudo -u $APP_USER pm2 save
    sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u $APP_USER --hp "$APP_DIR"
    
    log_success "Manual installation completed"
}

# Configure Nginx
configure_nginx() {
    if [[ "$USE_DOCKER" == "true" ]]; then
        log_info "Skipping system nginx configuration (using containerized nginx)"
        return 0
    fi
    
    log_info "Configuring Nginx reverse proxy..."
    
    # Create Nginx configuration
    sudo tee /etc/nginx/sites-available/file-transfer > /dev/null << EOF
# HTTP redirect to HTTPS
server {
    listen 80;
    server_name $DOMAIN;
    return 301 https://\$server_name\$request_uri;
}

# HTTPS server
server {
    listen 443 ssl http2;
    server_name $DOMAIN;
    
    # SSL Configuration (will be updated by certbot)
    # Use secure self-signed cert as fallback instead of snakeoil
    ssl_certificate /etc/ssl/certs/file-transfer-selfsigned.crt;
    ssl_certificate_key /etc/ssl/private/file-transfer-selfsigned.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305:DHE-RSA-AES128-GCM-SHA256:DHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;
    
    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Strict-Transport-Security "max-age=63072000" always;
    
    # File upload size limit
    client_max_body_size 10G;
    
    # Frontend (React build)
    location / {
        root $APP_DIR/frontend/build;
        try_files \$uri \$uri/ /index.html;
        
        # Cache static assets
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
        }
    }
    
    # API proxy
    location /api/ {
        proxy_pass http://localhost:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        
        # Timeouts for large file uploads
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
        proxy_buffering off;
        proxy_request_buffering off;
    }
    
    # Health check
    location /health {
        access_log off;
        return 200 "healthy\\n";
        add_header Content-Type text/plain;
    }
}
EOF
    
    # Configure SSL certificates based on installation type
    if [[ "$USE_SELF_SIGNED" == "true" && "$USE_DOCKER" == "true" ]]; then
        # For Docker with self-signed certificates, certificates are generated in ssl directory
        log_info "Using self-signed certificates from ssl directory for Docker"
    elif [[ "$SSL_TYPE" == "letsencrypt" || "$SSL_TYPE" == "self-signed" ]]; then
        # Generate fallback self-signed certificate for non-Docker installations
        if [[ ! -f /etc/ssl/certs/file-transfer-selfsigned.crt ]]; then
            log_info "Generating fallback self-signed SSL certificate..."
            sudo openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
                -keyout /etc/ssl/private/file-transfer-selfsigned.key \
                -out /etc/ssl/certs/file-transfer-selfsigned.crt \
                -subj "/C=US/ST=State/L=City/O=Organization/OU=OrgUnit/CN=$DOMAIN"
            sudo chmod 600 /etc/ssl/private/file-transfer-selfsigned.key
            sudo chmod 644 /etc/ssl/certs/file-transfer-selfsigned.crt
        fi
    fi
    
    # Enable the site
    sudo ln -sf /etc/nginx/sites-available/file-transfer /etc/nginx/sites-enabled/
    sudo rm -f /etc/nginx/sites-enabled/default
    
    # Test configuration
    sudo nginx -t || error_exit "Nginx configuration test failed"
    
    # Reload Nginx
    sudo systemctl reload nginx
    
    log_success "Nginx configuration completed"
}

# Generate self-signed SSL certificates
generate_self_signed_cert() {
    log_info "Generating self-signed SSL certificate for domain: $DOMAIN"
    
    local ssl_dir="$APP_DIR/nginx/ssl"
    sudo mkdir -p "$ssl_dir"
    
    # Create certificate configuration
    sudo tee "$ssl_dir/cert.conf" > /dev/null << EOF
[req]
default_bits = 2048
prompt = no
default_md = sha256
distinguished_name = dn
req_extensions = v3_req

[dn]
C=DE
ST=Local
L=Local
O=File Transfer System
OU=Development
CN=$DOMAIN

[v3_req]
basicConstraints = CA:FALSE
keyUsage = nonRepudiation, digitalSignature, keyEncipherment
subjectAltName = @alt_names

[alt_names]
DNS.1 = $DOMAIN
DNS.2 = localhost
DNS.3 = *.localhost
IP.1 = 127.0.0.1
IP.2 = ::1
EOF

    # Generate private key
    sudo openssl genrsa -out "$ssl_dir/key.pem" 2048

    # Generate certificate signing request
    sudo openssl req -new -key "$ssl_dir/key.pem" -out "$ssl_dir/cert.csr" -config "$ssl_dir/cert.conf"

    # Generate self-signed certificate
    sudo openssl x509 -req -in "$ssl_dir/cert.csr" -signkey "$ssl_dir/key.pem" -out "$ssl_dir/cert.pem" \
        -days 365 -extensions v3_req -extfile "$ssl_dir/cert.conf"

    # Clean up temporary files
    sudo rm -f "$ssl_dir/cert.csr" "$ssl_dir/cert.conf"
    
    # Create SSL parameters configuration
    sudo tee "$ssl_dir/ssl-params.conf" > /dev/null << 'EOF'
# SSL Configuration for File Transfer System
ssl_protocols TLSv1.2 TLSv1.3;
ssl_prefer_server_ciphers off;
ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305:DHE-RSA-AES128-GCM-SHA256:DHE-RSA-AES256-GCM-SHA384;

# SSL session cache
ssl_session_cache shared:SSL:10m;
ssl_session_timeout 10m;
ssl_session_tickets off;

# Security headers
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
add_header X-Frame-Options "SAMEORIGIN" always;
add_header X-Content-Type-Options "nosniff" always;
add_header X-XSS-Protection "1; mode=block" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
EOF

    # Set proper permissions and ownership
    sudo chmod 600 "$ssl_dir/key.pem"
    sudo chmod 644 "$ssl_dir/cert.pem"
    sudo chmod 644 "$ssl_dir/ssl-params.conf"
    
    # Set ownership for Docker or regular user
    if [[ "$USE_DOCKER" == "true" ]]; then
        sudo chown -R $USER:$USER "$ssl_dir"
    fi
    
    log_success "Self-signed SSL certificate generated successfully"
    log_info "Certificate files created:"
    log_info "  - Private Key: $ssl_dir/key.pem"
    log_info "  - Certificate: $ssl_dir/cert.pem"
    log_info "  - SSL Config: $ssl_dir/ssl-params.conf"
}

# Setup SSL with Let's Encrypt or self-signed certificates
setup_ssl() {
    if [[ "$USE_DOCKER" == "true" ]]; then
        case "$SSL_TYPE" in
            "self-signed")
                generate_self_signed_cert
                ;;
            "none")
                log_info "SSL disabled for Docker installation. Application will use HTTP only."
                ;;
            *)
                log_info "Docker installation: SSL certificates handled by container configuration."
                ;;
        esac
        return 0
    fi
    
    case "$SSL_TYPE" in
        "letsencrypt")
            setup_letsencrypt_ssl
            ;;
        "self-signed")
            generate_self_signed_cert
            ;;
        "manual")
            log_info "SSL setup skipped. You can configure SSL manually later."
            ;;
        "none")
            log_info "SSL disabled. Application will use HTTP only."
            ;;
        *)
            log_warning "Unknown SSL type: $SSL_TYPE. Skipping SSL setup."
            ;;
    esac
}

# Setup SSL with Let's Encrypt
setup_letsencrypt_ssl() {
    if [[ -z "$EMAIL" ]]; then
        log_warning "No email provided, skipping automatic SSL setup"
        log_info "You can manually setup SSL later with: sudo certbot --nginx -d $DOMAIN"
        return 0
    fi
    
    log_info "Setting up SSL certificate with Let's Encrypt..."
    
    # Install certbot - handle different package names across distributions
    if sudo apt install -y certbot python3-certbot-nginx 2>/dev/null; then
        log_info "Installed certbot with Nginx plugin"
    elif sudo apt install -y snapd && sudo snap install --classic certbot 2>/dev/null; then
        sudo ln -sf /snap/bin/certbot /usr/bin/certbot
        log_info "Installed certbot via snap"
    else
        log_warning "Failed to install certbot. SSL setup will need to be done manually."
        return 1
    fi
    
    # Obtain certificate
    sudo certbot --nginx -d "$DOMAIN" --email "$EMAIL" --agree-tos --non-interactive --redirect
    
    # Setup auto-renewal
    (sudo crontab -l 2>/dev/null; echo "0 12 * * * /usr/bin/certbot renew --quiet") | sudo crontab -
    
    log_success "SSL certificate setup completed"
}

# Configure firewall
setup_firewall() {
    if [[ "$USE_DOCKER" == "true" ]]; then
        log_info "Skipping firewall configuration for Docker installation"
        log_info "Docker manages its own network rules. Configure host firewall separately if needed."
        return 0
    fi
    
    log_info "Configuring firewall..."
    
    # Install and configure UFW
    sudo apt install -y ufw
    
    # Configure rules
    sudo ufw --force reset
    sudo ufw default deny incoming
    sudo ufw default allow outgoing
    sudo ufw allow ssh
    sudo ufw allow 'Nginx Full'
    
    # Enable firewall
    sudo ufw --force enable
    
    log_success "Firewall configured and enabled"
}

# Setup monitoring and maintenance
setup_monitoring() {
    if [[ "$USE_DOCKER" == "true" ]]; then
        log_info "Skipping system monitoring setup for Docker installation"
        log_info "Use 'docker compose logs' and 'docker compose ps' for monitoring"
        return 0
    fi
    
    log_info "Setting up monitoring and maintenance..."
    
    # Create maintenance script
    sudo tee "$APP_DIR/maintenance.sh" > /dev/null << 'EOF'
#!/bin/bash
# File Transfer System Maintenance Script

LOG_FILE="/var/log/file-transfer/maintenance.log"
DATE=$(date '+%Y-%m-%d %H:%M:%S')

echo "[$DATE] Starting maintenance..." >> "$LOG_FILE"

# Check if using Docker or manual installation
if command -v docker compose &> /dev/null && [[ -f docker-compose.yml ]]; then
    cd /opt/file-transfer
    
    # Determine docker command
    DOCKER_CMD="docker"
    if ! docker ps &>/dev/null; then
        DOCKER_CMD="sudo docker"
    fi
    
    # Cleanup expired files
    ${DOCKER_CMD} compose exec -T backend node -e "require('./src/jobs/cleanupJob').runCleanup()" >> "$LOG_FILE" 2>&1
    
    # Backup database
    BACKUP_FILE="/opt/file-transfer/backups/db_backup_$(date +%Y%m%d_%H%M%S).sql"
    ${DOCKER_CMD} compose exec -T database mysqldump -u root -p${DB_ROOT_PASSWORD} file_transfer > "$BACKUP_FILE" 2>> "$LOG_FILE"
    
    # Keep only last 30 days of backups
    find /opt/file-transfer/backups -name "db_backup_*.sql" -mtime +30 -delete 2>> "$LOG_FILE"
    
else
    # Manual installation maintenance
    cd /opt/file-transfer/backend
    sudo -u file-transfer node -e "require('./src/jobs/cleanupJob').runCleanup()" >> "$LOG_FILE" 2>&1
    
    # Backup database
    BACKUP_FILE="/opt/file-transfer/backups/db_backup_$(date +%Y%m%d_%H%M%S).sql"
    mysqldump -u fileuser -p file_transfer > "$BACKUP_FILE" 2>> "$LOG_FILE"
fi

# Check disk space
df -h /opt/file-transfer >> "$LOG_FILE"

echo "[$DATE] Maintenance completed" >> "$LOG_FILE"
EOF
    
    sudo chmod +x "$APP_DIR/maintenance.sh"
    
    # Add to crontab for daily execution at 2 AM
    (sudo crontab -l 2>/dev/null; echo "0 2 * * * $APP_DIR/maintenance.sh") | sudo crontab -
    
    # Create logrotate configuration
    sudo tee /etc/logrotate.d/file-transfer > /dev/null << EOF
/var/log/file-transfer/*.log {
    daily
    missingok
    rotate 52
    compress
    delaycompress
    notifempty
    create 644 $USER $USER
    postrotate
        cd /opt/file-transfer
        if [[ "$USE_DOCKER" == "true" ]]; then
            if docker ps &>/dev/null; then
                docker compose restart backend
            else
                sudo docker compose restart backend
            fi
        else
            sudo -u $APP_USER pm2 reload file-transfer-api
        fi
    endscript
}
EOF
    
    log_success "Monitoring and maintenance setup completed"
}

# Final verification
verify_installation() {
    log_info "Verifying installation..."
    
    # Determine docker command (with or without sudo)
    local docker_cmd="docker"
    if [[ "$USE_DOCKER" == "true" ]] && ! docker ps &>/dev/null; then
        docker_cmd="sudo docker"
    fi
    
    # Check services
    if [[ "$USE_DOCKER" == "true" ]]; then
        cd "$APP_DIR"
        if ! ${docker_cmd} compose ps | grep -q "Up"; then
            log_error "Docker services are not running properly"
            ${docker_cmd} compose ps
            return 1
        fi
    else
        if ! sudo systemctl is-active --quiet nginx; then
            log_error "Nginx is not running"
            return 1
        fi
        if ! sudo -u $APP_USER pm2 list | grep -q "online"; then
            log_error "Application is not running"
            return 1
        fi
    fi
    
    # Test HTTP endpoints
    if curl -f -s "http://localhost/health" > /dev/null; then
        log_success "Health check endpoint responding"
    else
        log_warning "Health check endpoint not responding"
    fi
    
    # Check SSL if configured
    if [[ -n "$EMAIL" ]]; then
        if curl -f -s "https://$DOMAIN/health" > /dev/null; then
            log_success "HTTPS endpoint responding"
        else
            log_warning "HTTPS endpoint not responding"
        fi
    fi
    
    log_success "Installation verification completed"
}

# Print final instructions
print_final_instructions() {
    echo -e "\n${GREEN}=== Installation Complete ===${NC}\n"
    
    echo -e "${BLUE}Application URLs:${NC}"
    if [[ "$INSTALL_TYPE" == "development" ]]; then
        echo "- HTTP: http://localhost:8081"
        if [[ "$USE_SELF_SIGNED" == "true" ]]; then
            echo "- HTTPS: https://localhost:8443 (self-signed certificate)"
            log_warning "  ⚠️  Your browser will show a security warning for the self-signed certificate."
            log_info "     Click 'Advanced' → 'Proceed to localhost' to accept it."
        fi
        echo "- API: http://localhost:8080"
        echo "- Health Check: http://localhost:8081/health"
        echo "- API Health: http://localhost:8080/api/v1/system/health"
    else
        if [[ "$SSL_TYPE" == "none" ]]; then
            echo "- HTTP: http://$DOMAIN"
            echo "- Health Check: http://$DOMAIN/health"
            echo "- API Health: http://$DOMAIN/api/v1/system/health"
        else
            echo "- HTTP: http://$DOMAIN"
            echo "- HTTPS: https://$DOMAIN"
            if [[ "$SSL_TYPE" == "self-signed" ]]; then
                log_warning "  ⚠️  Using self-signed certificate - browsers will show security warnings"
            fi
            echo "- Health Check: https://$DOMAIN/health"
            echo "- API Health: https://$DOMAIN/api/v1/system/health"
        fi
    fi
    
    echo -e "\n${BLUE}Configuration Files:${NC}"
    echo "- Application: $APP_DIR"
    echo "- Docker Environment: $APP_DIR/.env"
    echo "- Backend Environment: $APP_DIR/backend/.env"
    echo "- Frontend Environment: $APP_DIR/frontend/.env"
    echo "- Nginx Configuration: /etc/nginx/sites-available/file-transfer"
    
    echo -e "\n${BLUE}Log Files:${NC}"
    echo "- Application Logs: /var/log/file-transfer/"
    echo "- Nginx Logs: /var/log/nginx/"
    echo "- Installation Log: $LOG_FILE"
    
    echo -e "\n${BLUE}Management Commands:${NC}"
    if [[ "$USE_DOCKER" == "true" ]]; then
        echo "- View status: cd $APP_DIR && docker compose ps"
        echo "- View logs: cd $APP_DIR && docker compose logs -f"
        echo "- Restart services: cd $APP_DIR && docker compose restart"
        echo "- Stop services: cd $APP_DIR && docker compose down"
        echo "- Start services: cd $APP_DIR && docker compose up -d"
    else
        echo "- View status: sudo -u $APP_USER pm2 status"
        echo "- View logs: sudo -u $APP_USER pm2 logs"
        echo "- Restart app: sudo -u $APP_USER pm2 restart file-transfer-api"
        echo "- Restart nginx: sudo systemctl restart nginx"
    fi
    
    echo -e "\n${YELLOW}Next Steps:${NC}"
    echo "1. Configure LDAP settings in $APP_DIR/backend/.env"
    echo "2. Configure SMTP settings in $APP_DIR/backend/.env"
    echo "3. Test LDAP authentication by accessing the application"
    echo "4. Configure system settings in the admin interface"
    echo "5. Set up regular backups and monitoring"
    
    if [[ -z "$EMAIL" ]]; then
        echo -e "\n${YELLOW}SSL Certificate:${NC}"
        echo "To setup SSL certificate later, run:"
        echo "sudo certbot --nginx -d $DOMAIN"
    fi
    
    echo -e "\n${GREEN}Installation completed successfully!${NC}"
    echo "For support and documentation, see: $APP_DIR/README.md"
}

# Main installation function
main() {
    echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║           File Transfer System - Debian Installer           ║${NC}"
    echo -e "${BLUE}║              Production | Docker | Development               ║${NC}"
    echo -e "${BLUE}║                     Version 2.0.0                           ║${NC}"
    echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}\n"
    
    log_info "Starting installation at $(date)"
    log_info "Installation log: $LOG_FILE"
    
    # Pre-installation checks
    check_root
    check_requirements
    interactive_config
    
    # System preparation
    update_system
    install_docker
    install_nodejs
    install_mysql
    install_nginx
    
    # Application setup
    setup_application
    deploy_application
    
    # Install application stack
    if [[ "$USE_DOCKER" == "true" ]]; then
        install_docker_stack
    else
        install_manual_stack
    fi
    
    # Post-installation configuration
    configure_nginx
    setup_ssl
    setup_firewall
    setup_monitoring
    
    # Final verification and instructions
    verify_installation
    print_final_instructions
    
    log_success "Installation completed successfully at $(date)"
}

# Trap errors
trap 'error_exit "Installation interrupted"' INT TERM

# Show help
if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
    cat << EOF
File Transfer System - Debian Installer

This script provides comprehensive installation options for different environments:

Installation Types:
  1) Production     - Manual installation with system services (PM2, Nginx)
  2) Docker         - Containerized installation for production
  3) Development    - Docker with development settings and optional HTTPS

SSL Certificate Options:
  • Let's Encrypt   - Automatic certificates for public domains
  • Self-signed     - Generated certificates for local/internal use
  • Manual          - Configure SSL manually later
  • None            - HTTP only (not recommended for production)

Development Mode Features:
  • Uses localhost domain automatically
  • Configures ports 8081 (HTTP) and 8443 (HTTPS)
  • Optional self-signed certificates for HTTPS testing
  • Development environment variables

Usage: $0 [--help]

Requirements:
  • Debian 11/12/13 or Ubuntu 20.04+
  • 4GB+ RAM (recommended)
  • 20GB+ free disk space
  • Internet connection
  • Sudo privileges

The installer will:
  1. Check system requirements
  2. Install required packages (Docker, Node.js, etc.)
  3. Set up the application environment
  4. Configure SSL certificates (if selected)
  5. Deploy and start the application
  6. Run database migrations
  7. Configure system services

Examples:
  $0                    # Interactive installation
  $0 --help           # Show this help

For more information, see: https://github.com/Plummlumur/file-transfer-system
EOF
    exit 0
fi

# Run main function
main "$@"