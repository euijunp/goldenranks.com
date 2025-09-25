#!/bin/bash

set -e

# [추가] NVM 환경 변수를 스크립트로 불러옵니다.
# 이 코드는 non-interactive 셸(스크립트 등)에서 NVM을 사용할 수 있게 해줍니다.
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"


FRONTEND_DIR="/root/goldenranks"
APACHE_ROOT="/var/www/html"

echo "Navigating to frontend directory: $FRONTEND_DIR"
cd "$FRONTEND_DIR"

echo "Installing frontend dependencies..."
npm install --silent

echo "Building React application..."
npm run build

echo "Deploying frontend to Apache..."
sudo rsync -av --delete dist/ "$APACHE_ROOT/"

echo "Setting frontend file permissions..."
sudo chown -R www-data:www-data "$APACHE_ROOT"


DB_DIR="/var/lib/goldenranks"

echo "Ensuring database directory exists and has correct permissions..."
sudo mkdir -p "$DB_DIR"
sudo chown root:root "$DB_DIR"
sudo chmod 755 "$DB_DIR"


echo "Restarting Apache..."
sudo systemctl restart apache2


BACKEND_DIR="/root/goldenranks-backend"

echo "Navigating to backend directory: $BACKEND_DIR"
cd "$BACKEND_DIR"

echo "Installing backend dependencies..."
npm install --silent

if ! command -v pm2 &> /dev/null
then
    echo "ERROR: PM2 is not installed. Please install with 'npm install -g pm2'"
    exit 1
fi

echo "Restarting backend server with PM2..."
pm2 restart goldenranks-backend || pm2 start server.js --name "goldenranks-backend" --cwd "$BACKEND_DIR"
pm2 save

echo -e "\n\033[1;32m Deployment completed successfully!\033[0m"