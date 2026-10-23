#!/usr/bin/env bash
# ONE-TIME: set up the new Lightsail server and put the app + database on it.
# Run from Git Bash on the laptop:  bash deploy/first-time.sh
# Afterwards use deploy/deploy.sh for every update.
set -euo pipefail
cd "$(dirname "$0")/.."
source deploy/config.sh
require_config

echo "== 1/4 Setting up the server ($SERVER_IP)"
remote "mkdir -p /tmp/ebcotech-setup"
scp "${ssh_opts[@]}" deploy/server-files/* "$SSH_USER@$SERVER_IP:/tmp/ebcotech-setup/"
remote "bash /tmp/ebcotech-setup/setup-server.sh '$DOMAIN'"

echo "== 2/4 Uploading the database"
if remote "test -f $APP_DIR/data/autodoor.db"; then
  echo "The server already has a database - not overwriting it." >&2
else
  tmp="$(mktemp -d)"
  (cd server && node scripts/export-db.js "$tmp/autodoor.db")
  scp "${ssh_opts[@]}" "$tmp/autodoor.db" "$SSH_USER@$SERVER_IP:/tmp/ebcotech-setup/autodoor.db"
  remote "sudo install -o ebcotech -g ebcotech -m 660 /tmp/ebcotech-setup/autodoor.db $APP_DIR/data/autodoor.db && rm /tmp/ebcotech-setup/autodoor.db"
  rm -rf "$tmp"
fi

echo "== 3/4 Uploading the app"
bash deploy/deploy.sh --no-backup

echo "== 4/4 Checking https://$DOMAIN"
sleep 5
curl -fsS "https://$DOMAIN/api/health" && echo && echo "Live at https://$DOMAIN"
