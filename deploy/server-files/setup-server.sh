#!/usr/bin/env bash
# One-time setup of a fresh Ubuntu 24.04 AWS Lightsail server (run on the server by first-time.sh).
# Installs Node.js 24, SQLite tools and Caddy (automatic HTTPS), creates the app service and
# a daily database backup.
set -euo pipefail
DOMAIN="${1:?usage: setup-server.sh <domain>}"
APP_DIR="/opt/ebcotech"
HERE="$(cd "$(dirname "$0")" && pwd)"

echo "== Malaysia time zone (job times, daily backup at 03:30)"
sudo timedatectl set-timezone Asia/Kuala_Lumpur

echo "== Packages"
sudo apt-get update -y
sudo apt-get install -y ca-certificates curl gnupg sqlite3 debian-keyring debian-archive-keyring apt-transport-https
# What the PDF engine (headless Chrome via puppeteer) needs, plus fonts – including Chinese for 德科德機械有限公司.
sudo apt-get install -y libasound2t64 libatk-bridge2.0-0t64 libatk1.0-0t64 libcups2t64 libdrm2 libgbm1 libgtk-3-0t64   libnss3 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libxkbcommon0 libpango-1.0-0 libcairo2   fonts-liberation fonts-noto-core fonts-noto-cjk

if ! command -v node >/dev/null || [[ "$(node -v)" != v24* ]]; then
  echo "== Node.js 24"
  curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi

if ! command -v caddy >/dev/null; then
  echo "== Caddy"
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
  sudo apt-get update -y
  sudo apt-get install -y caddy
fi

echo "== App user and folders"
id ebcotech >/dev/null 2>&1 || sudo useradd --system --home "$APP_DIR" --shell /usr/sbin/nologin ebcotech
sudo usermod -aG ebcotech "$USER"
sudo mkdir -p "$APP_DIR/server" "$APP_DIR/web" "$APP_DIR/data" "$APP_DIR/backups"
sudo chown -R ebcotech:ebcotech "$APP_DIR"
sudo chmod -R g+rwX "$APP_DIR"
sudo find "$APP_DIR" -type d -exec chmod g+s {} +

echo "== Service, HTTPS and backups"
sudo cp "$HERE/ebcotech.service" /etc/systemd/system/ebcotech.service
sed "s/{{DOMAIN}}/$DOMAIN/g" "$HERE/Caddyfile" | sudo tee /etc/caddy/Caddyfile >/dev/null
sudo install -m 755 "$HERE/backup.sh" /usr/local/bin/ebcotech-backup
echo "30 3 * * * ebcotech /usr/local/bin/ebcotech-backup" | sudo tee /etc/cron.d/ebcotech-backup >/dev/null

sudo systemctl daemon-reload
sudo systemctl enable ebcotech
sudo systemctl enable caddy
sudo systemctl restart caddy
echo "== Setup done"
