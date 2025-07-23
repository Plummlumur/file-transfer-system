#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🚀 Setting up File Transfer Application...\n');

// Check Node.js version
const nodeVersion = process.version;
const requiredVersion = 'v16.0.0';
console.log(`Node.js version: ${nodeVersion}`);

if (nodeVersion < requiredVersion) {
  console.error(`❌ Node.js ${requiredVersion} or higher is required`);
  process.exit(1);
}

// Create necessary directories
const directories = [
  'backend/uploads',
  'backend/logs',
  'backend/temp',
  'frontend/build'
];

console.log('📁 Creating directories...');
directories.forEach(dir => {
  const fullPath = path.join(__dirname, '..', dir);
  if (!fs.existsSync(fullPath)) {
    fs.mkdirSync(fullPath, { recursive: true });
    console.log(`   ✓ Created ${dir}`);
  } else {
    console.log(`   ✓ ${dir} already exists`);
  }
});

// Copy environment files if they don't exist
console.log('\n🔧 Setting up environment files...');

const envFiles = [
  { src: 'backend/.env.example', dest: 'backend/.env' },
  { src: 'frontend/.env.example', dest: 'frontend/.env' }
];

envFiles.forEach(({ src, dest }) => {
  const srcPath = path.join(__dirname, '..', src);
  const destPath = path.join(__dirname, '..', dest);
  
  if (!fs.existsSync(destPath)) {
    if (fs.existsSync(srcPath)) {
      fs.copyFileSync(srcPath, destPath);
      console.log(`   ✓ Created ${dest}`);
    } else {
      console.log(`   ⚠️  ${src} not found`);
    }
  } else {
    console.log(`   ✓ ${dest} already exists`);
  }
});

// Install dependencies
console.log('\n📦 Installing dependencies...');

try {
  console.log('   Installing root dependencies...');
  execSync('npm install', { stdio: 'inherit' });
  
  console.log('   Installing backend dependencies...');
  execSync('cd backend && npm install', { stdio: 'inherit' });
  
  console.log('   Installing frontend dependencies...');
  execSync('cd frontend && npm install', { stdio: 'inherit' });
  
  console.log('   ✓ All dependencies installed');
} catch (error) {
  console.error('❌ Failed to install dependencies:', error.message);
  process.exit(1);
}

// Create initial database structure (if MySQL is available)
console.log('\n🗄️  Database setup...');
try {
  console.log('   Running database migrations...');
  execSync('cd backend && npm run migrate', { stdio: 'inherit' });
  console.log('   ✓ Database migrations completed');
  
  console.log('   Seeding initial data...');
  execSync('cd backend && npm run seed', { stdio: 'inherit' });
  console.log('   ✓ Database seeding completed');
} catch (error) {
  console.log('   ⚠️  Database setup skipped (database not available)');
  console.log('   Please ensure MySQL is running and configured properly');
}

// Generate JWT secret if not set
console.log('\n🔐 Security setup...');
const envPath = path.join(__dirname, '..', 'backend', '.env');
if (fs.existsSync(envPath)) {
  let envContent = fs.readFileSync(envPath, 'utf8');
  
  if (envContent.includes('JWT_SECRET=your-super-secret-jwt-key-change-this-in-production')) {
    const crypto = require('crypto');
    const jwtSecret = crypto.randomBytes(64).toString('hex');
    envContent = envContent.replace(
      'JWT_SECRET=your-super-secret-jwt-key-change-this-in-production',
      `JWT_SECRET=${jwtSecret}`
    );
    fs.writeFileSync(envPath, envContent);
    console.log('   ✓ Generated JWT secret');
  } else {
    console.log('   ✓ JWT secret already configured');
  }
}

// Create .gitignore files
console.log('\n📝 Creating .gitignore files...');

const gitignoreContent = {
  backend: `
# Dependencies
node_modules/
npm-debug.log*

# Environment variables
.env
.env.local
.env.development.local
.env.test.local
.env.production.local

# Logs
logs/
*.log

# Uploads
uploads/
temp/

# OS generated files
.DS_Store
.DS_Store?
._*
.Spotlight-V100
.Trashes
ehthumbs.db
Thumbs.db

# IDE
.vscode/
.idea/
*.swp
*.swo

# Coverage
coverage/
.nyc_output/
`,
  frontend: `
# Dependencies
node_modules/
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# Production build
build/
dist/

# Environment variables
.env
.env.local
.env.development.local
.env.test.local
.env.production.local

# Logs
*.log

# OS generated files
.DS_Store
.DS_Store?
._*
.Spotlight-V100
.Trashes
ehthumbs.db
Thumbs.db

# IDE
.vscode/
.idea/
*.swp
*.swo

# Coverage
coverage/

# Misc
.eslintcache
`
};

Object.entries(gitignoreContent).forEach(([dir, content]) => {
  const gitignorePath = path.join(__dirname, '..', dir, '.gitignore');
  if (!fs.existsSync(gitignorePath)) {
    fs.writeFileSync(gitignorePath, content.trim());
    console.log(`   ✓ Created ${dir}/.gitignore`);
  } else {
    console.log(`   ✓ ${dir}/.gitignore already exists`);
  }
});

// Final instructions
console.log('\n✅ Setup completed successfully!\n');
console.log('📋 Next steps:');
console.log('   1. Configure your database connection in backend/.env');
console.log('   2. Configure LDAP settings in backend/.env');
console.log('   3. Configure SMTP settings in backend/.env');
console.log('   4. Run the application:');
console.log('      npm run dev (for development)');
console.log('      npm start (for production)');
console.log('\n📚 Documentation:');
console.log('   - Backend API: http://localhost:8080/api/v1');
console.log('   - Frontend: http://localhost:3000');
console.log('   - Health Check: http://localhost:8080/api/v1/system/health');
console.log('\n🔧 Configuration files:');
console.log('   - Backend: backend/.env');
console.log('   - Frontend: frontend/.env');
console.log('\n🎉 Happy coding!');
