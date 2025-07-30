# Frontend Dockerfile - Multi-stage build
FROM node:18-alpine as builder

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --no-audit --no-fund

# Create public directory and create minimal required files
RUN mkdir -p public

# Create index.html inline (workaround for Docker build context issues)
RUN cat > public/index.html << 'EOF'
<!DOCTYPE html>
<html lang="de">
  <head>
    <meta charset="utf-8" />
    <link rel="icon" href="%PUBLIC_URL%/favicon.ico" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="theme-color" content="#000000" />
    <meta name="description" content="Secure file transfer system with LDAP authentication" />
    <link rel="apple-touch-icon" href="%PUBLIC_URL%/logo192.png" />
    <link rel="manifest" href="%PUBLIC_URL%/manifest.json" />
    <meta http-equiv="X-Content-Type-Options" content="nosniff" />
    <meta http-equiv="X-Frame-Options" content="DENY" />
    <meta http-equiv="X-XSS-Protection" content="1; mode=block" />
    <meta http-equiv="Referrer-Policy" content="strict-origin-when-cross-origin" />
    <title>File Transfer System</title>
    <style>
      #initial-loading {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background-color: #f5f5f5;
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 9999;
        font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
      }
      .loading-content {
        text-align: center;
        color: #000000;
      }
      .loading-spinner {
        width: 40px;
        height: 40px;
        border: 3px solid #e8e8e8;
        border-top: 3px solid #000000;
        border-radius: 50%;
        animation: spin 1s linear infinite;
        margin: 0 auto 16px;
      }
      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
      .loading-text {
        font-size: 16px;
        font-weight: 400;
        margin: 0;
      }
      .app-loaded #initial-loading {
        display: none;
      }
    </style>
  </head>
  <body>
    <noscript>
      <div style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background-color: #ffffff; display: flex; justify-content: center; align-items: center; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; text-align: center; padding: 20px; box-sizing: border-box;">
        <div>
          <h1 style="color: #000000; font-weight: 300; margin-bottom: 16px;">JavaScript erforderlich</h1>
          <p style="color: #666666; font-size: 16px; line-height: 1.5; margin: 0;">Diese Anwendung benötigt JavaScript, um ordnungsgemäß zu funktionieren.<br>Bitte aktivieren Sie JavaScript in Ihrem Browser und laden Sie die Seite erneut.</p>
        </div>
      </div>
    </noscript>
    <div id="initial-loading">
      <div class="loading-content">
        <div class="loading-spinner"></div>
        <p class="loading-text">File Transfer System wird geladen...</p>
      </div>
    </div>
    <div id="root"></div>
    <script>
      window.addEventListener('load', function() {
        setTimeout(function() {
          document.body.classList.add('app-loaded');
        }, 100);
      });
      setTimeout(function() {
        document.body.classList.add('app-loaded');
      }, 10000);
    </script>
  </body>
</html>
EOF

# Create manifest.json inline
RUN cat > public/manifest.json << 'EOF'
{
  "short_name": "File Transfer",
  "name": "File Transfer System",
  "icons": [
    {
      "src": "favicon.ico",
      "sizes": "64x64 32x32 24x24 16x16",
      "type": "image/x-icon"
    }
  ],
  "start_url": ".",
  "display": "standalone",
  "theme_color": "#000000",
  "background_color": "#ffffff"
}
EOF

# Copy source code
COPY src ./src

# Copy environment file if it exists
COPY .env.example ./

# Set environment variables for React build
ENV GENERATE_SOURCEMAP=false
ENV PUBLIC_URL=.

# Build the application
RUN npm run build

# Production stage with Nginx
FROM nginx:alpine

# Install curl for health checks
RUN apk add --no-cache curl

# Copy built application
COPY --from=builder /app/build /usr/share/nginx/html

# Copy nginx configuration
COPY nginx.conf /etc/nginx/nginx.conf

# Ensure nginx user exists and set permissions
RUN (addgroup -g 1001 -S nginx 2>/dev/null || true) && \
    (adduser -S nginx -u 1001 -G nginx 2>/dev/null || true) && \
    chown -R nginx:nginx /usr/share/nginx/html && \
    chown -R nginx:nginx /var/cache/nginx && \
    chown -R nginx:nginx /var/log/nginx && \
    chown -R nginx:nginx /etc/nginx/conf.d

# Create nginx pid directory
RUN mkdir -p /var/run/nginx && \
    chown -R nginx:nginx /var/run/nginx

# Switch to non-root user
USER nginx

# Expose port
EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost/ || exit 1

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
