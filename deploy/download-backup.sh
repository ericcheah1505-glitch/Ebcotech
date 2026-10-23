#!/usr/bin/env bash
# Copies the newest daily database backup and all job photos from the live server to
# deploy/backups/ on the laptop (an extra copy outside AWS). Run from Git Bash:  bash deploy/download-backup.sh
set -euo pipefail
cd "$(dirname "$0")/.."
source deploy/config.sh
require_config

remote "sudo -u ebcotech /usr/local/bin/ebcotech-backup >/dev/null"
latest="$(remote "ls -1t $APP_DIR/backups/autodoor-*.db.gz | head -1")"
mkdir -p deploy/backups
scp "${ssh_opts[@]}" "$SSH_USER@$SERVER_IP:$latest" deploy/backups/
echo "Saved deploy/backups/$(basename "$latest")"

stamp="$(date +%Y-%m-%d_%H%M)"
remote "cd $APP_DIR/data && if [ -d photos ]; then tar -czf - photos; fi" > "deploy/backups/photos-$stamp.tar.gz"
echo "Saved deploy/backups/photos-$stamp.tar.gz"
