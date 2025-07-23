# Frontend Dockerfile - Multi-stage build
FROM node:18-alpine as builder

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --no-audit --no-fund

# Create public directory and copy index.html manually
RUN mkdir -p public
COPY public/index.html ./public/index.html
COPY public/manifest.json ./public/manifest.json

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

# Create nginx user and set permissions
RUN addgroup -g 1001 -S nginx && \
    adduser -S nginx -u 1001 -G nginx && \
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
