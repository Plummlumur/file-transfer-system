#!/bin/bash

# File Transfer System - Local Development Setup Script
# This script sets up the File Transfer System for local development/testing

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
ENV_FILE="$PROJECT_DIR/.env"
ENV_EXAMPLE="$PROJECT_DIR/.env.example"

# Helper functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check requirements
check_requirements() {
    log_info "Checking system requirements..."
    
    # Check if Docker is available
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed. Please install Docker first."
        echo "Installation instructions: https://docs.docker.com/get-docker/"
        exit 1
    fi
    
    # Check if Docker Compose is available
    if ! command -v docker compose &> /dev/null; then
        log_error "Docker Compose is not available. Please install Docker Compose first."
        exit 1
    fi
    
    # Check if OpenSSL is available (for SSL certificates)
    if ! command -v openssl &> /dev/null; then
        log_warning "OpenSSL is not installed. SSL certificates cannot be generated."
        log_info "You can still use HTTP (port 8081) for local development."
    fi
    
    log_success "System requirements check completed"
}

# Setup environment file
setup_environment() {
    log_info "Setting up environment configuration..."
    
    if [[ -f "$ENV_FILE" ]]; then
        log_info "Using existing .env file"
        return 0
    fi
    
    if [[ ! -f "$ENV_EXAMPLE" ]]; then
        log_error ".env.example file not found!"
        exit 1
    fi
    
    log_info "Creating .env file from .env.example..."
    cp "$ENV_EXAMPLE" "$ENV_FILE"
    
    # Generate secure random passwords
    log_info "Generating secure random passwords..."
    
    # Generate DB passwords
    DB_ROOT_PASSWORD=$(openssl rand -hex 32)
    DB_PASSWORD=$(openssl rand -hex 32)
    JWT_SECRET=$(openssl rand -hex 64)
    REDIS_PASSWORD=$(openssl rand -hex 32)
    
    # Update passwords in .env file
    sed -i "s/DB_ROOT_PASSWORD=.*/DB_ROOT_PASSWORD=$DB_ROOT_PASSWORD/" "$ENV_FILE"
    sed -i "s/DB_PASSWORD=.*/DB_PASSWORD=$DB_PASSWORD/" "$ENV_FILE"
    sed -i "s/JWT_SECRET=.*/JWT_SECRET=$JWT_SECRET/" "$ENV_FILE"
    sed -i "s/REDIS_PASSWORD=.*/REDIS_PASSWORD=$REDIS_PASSWORD/" "$ENV_FILE"
    
    log_success "Environment file created with secure random passwords"
}

# Setup SSL certificates
setup_ssl() {
    local setup_ssl_choice
    
    echo ""
    log_info "SSL Certificate Setup"
    echo "Do you want to set up HTTPS with self-signed certificates for local development?"
    echo "This will allow you to test HTTPS functionality locally."
    echo ""
    echo "Options:"
    echo "  1) Yes - Generate self-signed certificates (recommended for testing HTTPS)"
    echo "  2) No - Use HTTP only (simpler setup)"
    echo ""
    read -p "Choice [1-2]: " setup_ssl_choice
    
    case $setup_ssl_choice in
        1)
            log_info "Setting up self-signed SSL certificates..."
            if command -v openssl &> /dev/null; then
                "$SCRIPT_DIR/generate-ssl-cert.sh" localhost 365
                log_success "SSL certificates generated successfully!"
                log_info "HTTPS will be available at: https://localhost:8443"
            else
                log_error "OpenSSL not found. Cannot generate SSL certificates."
                log_info "Please install OpenSSL or choose HTTP-only setup."
                exit 1
            fi
            ;;
        2)
            log_info "Skipping SSL certificate generation"
            log_info "Application will be available via HTTP only at: http://localhost:8081"
            ;;
        *)
            log_warning "Invalid choice, skipping SSL setup"
            log_info "Application will be available via HTTP only at: http://localhost:8081"
            ;;
    esac
}

# Build and start services
start_services() {
    log_info "Building and starting Docker services..."
    
    cd "$PROJECT_DIR"
    
    # Pull base images
    log_info "Pulling Docker base images..."
    docker compose pull database redis
    
    # Build custom images
    log_info "Building application images..."
    docker compose build --no-cache
    
    # Start services
    log_info "Starting services..."
    docker compose up -d
    
    # Wait for services to be ready
    log_info "Waiting for services to start..."
    sleep 10
    
    # Check service health
    local retries=12
    while [[ $retries -gt 0 ]]; do
        if docker compose ps | grep -q "Up"; then
            log_success "Services are running!"
            break
        fi
        log_info "Waiting for services... ($retries retries left)"
        sleep 5
        ((retries--))
    done
    
    if [[ $retries -eq 0 ]]; then
        log_error "Services failed to start properly"
        log_info "Checking service logs..."
        docker compose logs --tail=20
        exit 1
    fi
}

# Run database migrations
setup_database() {
    log_info "Setting up database..."
    
    # Wait for database to be ready
    log_info "Waiting for database to be ready..."
    sleep 15
    
    # Run migrations
    log_info "Running database migrations..."
    docker compose exec -T backend npm run migrate || log_warning "Migration failed - database may need manual setup"
    
    # Seed database
    log_info "Seeding database with initial data..."
    docker compose exec -T backend npm run seed || log_warning "Seeding failed - continuing anyway"
    
    log_success "Database setup completed"
}

# Show final instructions
show_final_instructions() {
    echo ""
    log_success "=== File Transfer System Setup Complete ==="
    echo ""
    
    # Check if SSL certificates exist
    local ssl_available=false
    if [[ -f "$PROJECT_DIR/nginx/ssl/cert.pem" && -f "$PROJECT_DIR/nginx/ssl/key.pem" ]]; then
        ssl_available=true
    fi
    
    log_info "🌐 Application URLs:"
    echo "  • HTTP:  http://localhost:8081"
    if [[ "$ssl_available" == "true" ]]; then
        echo "  • HTTPS: https://localhost:8443 (self-signed certificate)"
        log_warning "  ⚠️  Your browser will show a security warning for the self-signed certificate."
        log_info "     Click 'Advanced' → 'Proceed to localhost' to accept it."
    fi
    echo ""
    
    log_info "🔧 Service URLs:"
    echo "  • Backend API: http://localhost:8080"
    echo "  • Database:    localhost:3306"
    echo "  • Redis:       localhost:6379"
    echo ""
    
    log_info "📋 Management Commands:"
    echo "  • View status:    docker compose ps"
    echo "  • View logs:      docker compose logs -f"
    echo "  • Stop services:  docker compose down"
    echo "  • Restart:        docker compose restart"
    echo ""
    
    log_info "📁 Important Files:"
    echo "  • Configuration:  .env"
    echo "  • Logs:          docker compose logs"
    echo "  • SSL Certs:     nginx/ssl/ (if generated)"
    echo ""
    
    log_info "🔐 Default Login (configure LDAP for production):"
    echo "  • Username: admin"
    echo "  • Password: (configured in your LDAP server)"
    echo ""
    
    log_warning "⚠️  Next Steps:"
    echo "  1. Configure LDAP settings in .env file"
    echo "  2. Configure SMTP settings in .env file"
    echo "  3. Test the application by accessing the URLs above"
    echo "  4. Review security settings before production use"
    echo ""
    
    if [[ "$ssl_available" == "true" ]]; then
        log_info "✅ SSL certificates are ready for HTTPS testing"
    else
        log_info "ℹ️  To add HTTPS later, run: $SCRIPT_DIR/generate-ssl-cert.sh"
    fi
    
    log_success "Setup completed successfully! 🎉"
}

# Main function
main() {
    echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║           File Transfer System - Local Setup                ║${NC}"
    echo -e "${BLUE}║                Development/Testing Environment              ║${NC}"
    echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    
    log_info "Starting local development setup..."
    echo ""
    
    check_requirements
    setup_environment
    setup_ssl
    start_services
    setup_database
    show_final_instructions
}

# Show help
if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
    cat << EOF
File Transfer System - Local Setup Script

This script sets up the File Transfer System for local development and testing.

Usage: $0

What this script does:
  1. Checks system requirements (Docker, Docker Compose, OpenSSL)
  2. Creates .env file with secure random passwords
  3. Optionally generates self-signed SSL certificates
  4. Builds and starts all Docker services
  5. Runs database migrations and seeding
  6. Shows access URLs and management commands

Requirements:
  • Docker and Docker Compose
  • OpenSSL (optional, for SSL certificates)

The setup will make the application available at:
  • HTTP:  http://localhost:8081
  • HTTPS: https://localhost:8443 (if SSL is enabled)

For production deployment, use the debian-install.sh script instead.
EOF
    exit 0
fi

# Run main function
main "$@"