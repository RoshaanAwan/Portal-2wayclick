#!/bin/bash
# Quick Deployment Script for Digital Ocean
# Run this after connecting to your droplet and cloning the repository

set -e

echo "🚀 2WayClick Portal - Quick Deployment Script"
echo "=============================================="

# Check if running as root or with sudo
if [ "$EUID" -ne 0 ]; then 
   echo "❌ This script must be run as root (use: sudo bash deploy.sh)"
   exit 1
fi

# Step 1: Update system
echo "📦 Step 1: Updating system packages..."
apt update && apt upgrade -y

# Step 2: Install Node.js
echo "📦 Step 2: Installing Node.js 20.x..."
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# Step 3: Install PostgreSQL
echo "📦 Step 3: Installing PostgreSQL..."
apt install -y postgresql postgresql-contrib

# Step 4: Start PostgreSQL
echo "🗄️  Step 4: Starting PostgreSQL..."
systemctl start postgresql
systemctl enable postgresql

# Step 5: Install PM2
echo "📦 Step 5: Installing PM2..."
npm install -g pm2
pm2 completion install || true

# Step 6: Install Nginx
echo "📦 Step 6: Installing Nginx..."
apt install -y nginx

# Step 7: Create project directory
echo "📁 Step 7: Creating project directory..."
mkdir -p /var/www
cd /var/www

if [ ! -d "portal" ]; then
    echo "❌ Please clone the repository first:"
    echo "   cd /var/www"
    echo "   git clone YOUR_REPO_URL portal"
    echo "   cd portal"
    echo "   Then run this script again."
    exit 1
fi

cd portal

# Step 8: Install dependencies
echo "📦 Step 8: Installing Node dependencies..."
npm install

# Step 9: Database setup
echo "🗄️  Step 9: Setting up database..."
echo "Creating PostgreSQL user and database..."

# Create DB and user
POSTGRES_PASSWORD=$(openssl rand -base64 12)
sudo -u postgres psql <<EOF
CREATE USER portal_user WITH PASSWORD '$POSTGRES_PASSWORD';
CREATE DATABASE portal_db OWNER portal_user;
GRANT ALL PRIVILEGES ON DATABASE portal_db TO portal_user;
EOF

echo "✅ Database credentials:"
echo "   User: portal_user"
echo "   Password: $POSTGRES_PASSWORD"
echo "   Database: portal_db"
echo ""
echo "⚠️  UPDATE .env.local with this password before proceeding!"

# Step 10: Check for .env.local
if [ ! -f ".env.local" ]; then
    echo "❌ .env.local not found!"
    echo "   1. Copy .env.production.example to .env.local"
    echo "   2. Update all environment variables"
    echo "   3. Re-run this script"
    exit 1
fi

# Step 11: Database migrations
echo "🗄️  Step 11: Running database migrations..."
npm run db:deploy

# Step 12: Build application
echo "🔨 Step 12: Building application..."
npm run build

# Step 13: Create logs directory
echo "📁 Step 13: Creating logs directory..."
mkdir -p logs

# Step 14: Start with PM2
echo "▶️  Step 14: Starting application with PM2..."
pm2 start ecosystem.config.js
pm2 save

# Step 15: Configure PM2 startup
echo "🔄 Step 15: Configuring PM2 startup..."
pm2 startup -u root --hp /root

# Step 16: Configure Nginx
echo "🌐 Step 16: Configuring Nginx..."
cat > /etc/nginx/sites-available/portal <<'NGINX_CONF'
upstream nextjs {
    server 127.0.0.1:3000;
}

server {
    listen 80;
    server_name _;
    
    access_log /var/log/nginx/portal_access.log;
    error_log /var/log/nginx/portal_error.log;
    
    client_max_body_size 100M;

    location / {
        proxy_pass http://nextjs;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
}
NGINX_CONF

# Enable site
ln -sf /etc/nginx/sites-available/portal /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

# Test and restart Nginx
nginx -t
systemctl restart nginx
systemctl enable nginx

echo ""
echo "✅ Deployment complete!"
echo "=============================================="
echo ""
echo "📋 Next steps:"
echo "   1. Get your droplet IP: hostname -I"
echo "   2. Open browser: http://YOUR_DROPLET_IP"
echo "   3. Check logs: pm2 logs portal"
echo "   4. Monitor: pm2 monit"
echo ""
echo "🔒 Security (optional but recommended):"
echo "   1. Add domain and enable SSL:"
echo "      apt install certbot python3-certbot-nginx"
echo "      certbot --nginx -d yourdomain.com"
echo ""
echo "📚 For more info, see: DEPLOYMENT.md"
