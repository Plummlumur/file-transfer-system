#!/bin/bash

# File Transfer System - Self-Signed SSL Certificate Generator
# This script generates self-signed SSL certificates for local/test installations

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
SSL_DIR="$PROJECT_DIR/nginx/ssl"
DOMAIN="${1:-localhost}"
DAYS="${2:-365}"

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

# Create SSL directory if it doesn't exist
create_ssl_directory() {
    log_info "Creating SSL directory: $SSL_DIR"
    mkdir -p "$SSL_DIR"
}

# Generate self-signed certificate
generate_certificate() {
    log_info "Generating self-signed SSL certificate for domain: $DOMAIN"
    log_info "Certificate validity: $DAYS days"
    
    # Create certificate configuration
    cat > "$SSL_DIR/cert.conf" << EOF
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
    log_info "Generating private key..."
    openssl genrsa -out "$SSL_DIR/key.pem" 2048

    # Generate certificate signing request
    log_info "Generating certificate signing request..."
    openssl req -new -key "$SSL_DIR/key.pem" -out "$SSL_DIR/cert.csr" -config "$SSL_DIR/cert.conf"

    # Generate self-signed certificate
    log_info "Generating self-signed certificate..."
    openssl x509 -req -in "$SSL_DIR/cert.csr" -signkey "$SSL_DIR/key.pem" -out "$SSL_DIR/cert.pem" \
        -days "$DAYS" -extensions v3_req -extfile "$SSL_DIR/cert.conf"

    # Set proper permissions
    chmod 600 "$SSL_DIR/key.pem"
    chmod 644 "$SSL_DIR/cert.pem"
    
    # Clean up temporary files
    rm -f "$SSL_DIR/cert.csr" "$SSL_DIR/cert.conf"
    
    log_success "SSL certificate generated successfully!"
}

# Display certificate information
show_certificate_info() {
    log_info "Certificate Information:"
    echo "----------------------------------------"
    openssl x509 -in "$SSL_DIR/cert.pem" -text -noout | grep -E "(Subject:|DNS:|IP Address:|Not Before:|Not After :)"
    echo "----------------------------------------"
    
    log_info "Certificate files created:"
    echo "  - Private Key: $SSL_DIR/key.pem"
    echo "  - Certificate: $SSL_DIR/cert.pem"
}

# Create nginx SSL configuration snippet
create_nginx_ssl_config() {
    log_info "Creating nginx SSL configuration snippet..."
    
    cat > "$SSL_DIR/ssl-params.conf" << 'EOF'
# SSL Configuration for File Transfer System
ssl_protocols TLSv1.2 TLSv1.3;
ssl_prefer_server_ciphers off;
ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305:DHE-RSA-AES128-GCM-SHA256:DHE-RSA-AES256-GCM-SHA384;

# SSL session cache
ssl_session_cache shared:SSL:10m;
ssl_session_timeout 10m;
ssl_session_tickets off;

# OCSP stapling (disabled for self-signed certificates)
# ssl_stapling on;
# ssl_stapling_verify on;

# Security headers
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
add_header X-Frame-Options "SAMEORIGIN" always;
add_header X-Content-Type-Options "nosniff" always;
add_header X-XSS-Protection "1; mode=block" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
EOF

    log_success "SSL configuration snippet created: $SSL_DIR/ssl-params.conf"
}

# Show usage instructions
show_usage_instructions() {
    echo ""
    log_success "=== SSL Certificate Setup Complete ==="
    echo ""
    log_info "To use HTTPS with your File Transfer System:"
    echo ""
    echo "1. The certificate files are ready in: $SSL_DIR/"
    echo "2. Access your application at: https://$DOMAIN:8443"
    echo "3. Your browser will show a security warning (normal for self-signed certificates)"
    echo "4. Click 'Advanced' and 'Proceed to $DOMAIN' to accept the certificate"
    echo ""
    log_warning "Self-signed certificates are NOT suitable for production use!"
    log_info "For production, use certificates from a trusted CA like Let's Encrypt."
    echo ""
    log_info "To regenerate the certificate, run:"
    echo "  $0 [domain] [days]"
    echo ""
    log_info "Examples:"
    echo "  $0 localhost 365          # Default: localhost, 1 year"
    echo "  $0 myapp.local 730        # Custom domain, 2 years"
    echo "  $0 192.168.1.100 90       # IP address, 3 months"
}

# Main function
main() {
    echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║        File Transfer System - SSL Certificate Generator      ║${NC}"
    echo -e "${BLUE}║                    Self-Signed Certificates                  ║${NC}"
    echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    
    # Check if OpenSSL is available
    if ! command -v openssl &> /dev/null; then
        log_error "OpenSSL is not installed. Please install OpenSSL first."
        exit 1
    fi
    
    # Check if certificate already exists
    if [[ -f "$SSL_DIR/cert.pem" && -f "$SSL_DIR/key.pem" ]]; then
        log_warning "SSL certificates already exist!"
        echo "Existing certificate information:"
        show_certificate_info
        echo ""
        read -p "Do you want to regenerate the certificates? [y/N]: " -n 1 -r
        echo ""
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            log_info "Keeping existing certificates."
            show_usage_instructions
            exit 0
        fi
        log_info "Regenerating certificates..."
    fi
    
    create_ssl_directory
    generate_certificate
    create_nginx_ssl_config
    show_certificate_info
    show_usage_instructions
}

# Show help
if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
    cat << EOF
File Transfer System - SSL Certificate Generator

Usage: $0 [domain] [days]

Arguments:
  domain    Domain name for the certificate (default: localhost)
  days      Certificate validity in days (default: 365)

Examples:
  $0                        # Generate for localhost, 365 days
  $0 myapp.local           # Generate for myapp.local, 365 days  
  $0 localhost 730         # Generate for localhost, 730 days
  $0 192.168.1.100 90     # Generate for IP address, 90 days

The script will create:
  - nginx/ssl/cert.pem         (SSL certificate)
  - nginx/ssl/key.pem          (Private key)
  - nginx/ssl/ssl-params.conf  (Nginx SSL configuration)

Note: Self-signed certificates will show browser warnings.
For production use, obtain certificates from a trusted CA.
EOF
    exit 0
fi

# Run main function
main "$@"