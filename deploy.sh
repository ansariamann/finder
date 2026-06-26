#!/bin/bash
# ============================================================
# Fresher Job Finder — EC2 Deployment Script
# Run this on a fresh Ubuntu 22.04 EC2 instance:
#   chmod +x deploy.sh && ./deploy.sh
# ============================================================

set -e  # Exit on any error

APP_NAME="job-finder"
APP_DIR="/home/ubuntu/finder"
REPO_URL="https://github.com/ansariamann/finder.git"

echo ""
echo "🚀 Fresher Job Finder — EC2 Deployment"
echo "========================================"
echo ""

# ── 1. System Update ─────────────────────────────────────────
echo "📦 Updating system packages..."
sudo apt update && sudo apt upgrade -y

# ── 2. Install Node.js 20 LTS ────────────────────────────────
echo ""
echo "📦 Installing Node.js 20 LTS..."
if ! command -v node &> /dev/null || [[ $(node -v) != v20* ]]; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt install -y nodejs
fi
echo "   Node: $(node -v)"
echo "   npm:  $(npm -v)"

# ── 3. Install PM2 ───────────────────────────────────────────
echo ""
echo "📦 Installing PM2..."
sudo npm install -g pm2

# ── 4. Install Nginx ─────────────────────────────────────────
echo ""
echo "📦 Installing Nginx..."
sudo apt install -y nginx

# ── 5. Install Git ───────────────────────────────────────────
sudo apt install -y git

# ── 6. Clone Repository ──────────────────────────────────────
echo ""
if [ -d "$APP_DIR" ]; then
    echo "📂 Directory $APP_DIR already exists, pulling latest changes..."
    cd "$APP_DIR"
    git pull
else
    echo "📂 Cloning repository..."
    git clone "$REPO_URL" "$APP_DIR"
    cd "$APP_DIR"
fi

# ── 7. Install Dependencies ──────────────────────────────────
echo ""
echo "📦 Installing npm dependencies..."
npm install --production

# ── 8. Create uploads directory ──────────────────────────────
mkdir -p "$APP_DIR/uploads"

# ── 9. Check for .env file ───────────────────────────────────
echo ""
if [ ! -f "$APP_DIR/.env" ]; then
    echo "⚠️  No .env file found!"
    echo "   Creating a template .env file — you MUST edit it with your real credentials."
    cat > "$APP_DIR/.env" << 'ENVEOF'
# ============================================
# FRESHER JOB FINDER - CONFIGURATION
# ============================================

PORT=3000

# SMTP Configuration (Gmail App Password)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password

# Sender Information
SENDER_NAME=Your Name
SENDER_EMAIL=your-email@gmail.com
SENDER_PHONE=0000000000

# RapidAPI Key (JSearch)
RAPIDAPI_KEY=your-rapidapi-key-here

# Adzuna API (optional)
ADZUNA_APP_ID=your-adzuna-app-id
ADZUNA_APP_KEY=your-adzuna-app-key
ADZUNA_COUNTRY=in

# Hunter.io (optional)
HUNTER_API_KEY=

# Rate Limiting
EMAIL_DELAY_MS=3000
MAX_EMAILS_PER_BATCH=50
ENVEOF
    echo ""
    echo "   ✏️  Edit it now with: nano $APP_DIR/.env"
    echo "   Then re-run this script or just run: pm2 restart $APP_NAME"
    echo ""
else
    echo "✅ .env file found."
fi

# ── 10. Setup Nginx ──────────────────────────────────────────
echo ""
echo "🔧 Configuring Nginx reverse proxy..."
sudo tee /etc/nginx/sites-available/$APP_NAME > /dev/null << 'NGINXEOF'
server {
    listen 80;
    server_name _;

    client_max_body_size 10M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 300s;
    }
}
NGINXEOF

# Enable site, remove default
sudo ln -sf /etc/nginx/sites-available/$APP_NAME /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default

# Test and restart Nginx
sudo nginx -t
sudo systemctl restart nginx
sudo systemctl enable nginx

# ── 11. Start App with PM2 ───────────────────────────────────
echo ""
echo "🚀 Starting application with PM2..."
cd "$APP_DIR"

# Stop existing instance if running
pm2 delete $APP_NAME 2>/dev/null || true

# Start fresh
pm2 start server.js --name "$APP_NAME" --env production

# Auto-start on reboot
pm2 startup systemd -u ubuntu --hp /home/ubuntu 2>/dev/null || true
pm2 save

# ── 12. Done! ─────────────────────────────────────────────────
echo ""
echo "========================================"
echo "✅ Deployment Complete!"
echo "========================================"
echo ""
echo "🌐 Your app is live at: http://$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4 2>/dev/null || echo '<YOUR_EC2_PUBLIC_IP>')"
echo ""
echo "📋 Useful commands:"
echo "   pm2 status              — Check app status"
echo "   pm2 logs $APP_NAME      — View live logs"
echo "   pm2 restart $APP_NAME   — Restart after changes"
echo "   pm2 monit               — Real-time monitoring"
echo ""
echo "📝 Don't forget to edit .env if you haven't already:"
echo "   nano $APP_DIR/.env"
echo "   pm2 restart $APP_NAME"
echo ""
