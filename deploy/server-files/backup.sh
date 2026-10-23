#!/usr/bin/env bash
# Daily database backup (run by cron at 03:30, and by deploy.sh before every update).
# Keeps the last 30 copies in /opt/ebcotech/backups.
set -euo pipefail
DATA=/opt/ebcotech/data/autodoor.db
DEST=/opt/ebcotech/backups
[[ -f "$DATA" ]] || { echo "No database yet"; exit 0; }
stamp="$(TZ=Asia/Kuala_Lumpur date +%Y-%m-%d_%H%M)"
sqlite3 "$DATA" ".backup '$DEST/autodoor-$stamp.db'"
gzip -f "$DEST/autodoor-$stamp.db"
ls -1t "$DEST"/autodoor-*.db.gz | tail -n +31 | xargs -r rm --
echo "Backup saved: $DEST/autodoor-$stamp.db.gz"
