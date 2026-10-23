#!/usr/bin/env bash
# Sends the current server code and website to the live server: backs up the database, builds the
# website, uploads both, installs packages, restarts, and checks it answers. The database itself is
# never overwritten.
# Run from Git Bash on the laptop:  bash deploy/deploy.sh
set -euo pipefail
cd "$(dirname "$0")/.."
source deploy/config.sh
require_config

echo "== Running tests before sending anything live"
(cd server && npm test >/dev/null) || { echo "Tests failed - not deploying." >&2; exit 1; }

if [[ "${1:-}" != "--no-backup" ]]; then
  echo "== Backing up the live database"
  remote "sudo -u ebcotech /usr/local/bin/ebcotech-backup"
fi

echo "== Building the website"
(cd web && npm run build >/dev/null) || { echo "Website build failed - not deploying." >&2; exit 1; }

echo "== Uploading website"
tar -czf - -C web/out .   | remote "sudo rm -rf $APP_DIR/web.new && sudo mkdir -p $APP_DIR/web.new && sudo tar -xzf - --no-same-owner -C $APP_DIR/web.new       && sudo chown -R ebcotech:ebcotech $APP_DIR/web.new && sudo rm -rf $APP_DIR/web.old       && (sudo mv $APP_DIR/web $APP_DIR/web.old || true) && sudo mv $APP_DIR/web.new $APP_DIR/web"

echo "== Uploading server code"
tar -czf - -C server --exclude=node_modules --exclude=data --exclude=test --exclude=scripts . \
  | remote "sudo tar -xzf - --no-same-owner -C $APP_DIR/server && sudo chown -R ebcotech:ebcotech $APP_DIR/server \
      && cd $APP_DIR/server && sudo -u ebcotech -H npm ci --omit=dev --no-audit --no-fund >/dev/null"

echo "== Restarting"
remote "sudo systemctl restart ebcotech && sleep 2 && systemctl is-active ebcotech"
remote "curl -fsS http://127.0.0.1:4000/api/health" && echo && echo "Server updated."
