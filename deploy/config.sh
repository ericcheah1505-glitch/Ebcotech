# Settings for the live (cloud) server. Fill in SERVER_IP once the AWS Lightsail server exists.
# Used by the other deploy scripts; run them from Git Bash on the laptop.

DOMAIN="app.gwgewalt.com"           # web address the app uses (DNS A record -> SERVER_IP)
SERVER_IP=""                        # Lightsail static IP, e.g. 13.250.12.34
SSH_USER="ubuntu"                   # default user on Lightsail Ubuntu
SSH_KEY="$(dirname "${BASH_SOURCE[0]}")/keys/lightsail.pem"   # key downloaded from Lightsail (never commit it)

APP_DIR="/opt/ebcotech"             # where the app lives on the server

ssh_opts=(-i "$SSH_KEY" -o StrictHostKeyChecking=accept-new -o ConnectTimeout=15)
remote() { ssh "${ssh_opts[@]}" "$SSH_USER@$SERVER_IP" "$@"; }

require_config() {
  if [[ -z "$SERVER_IP" ]]; then echo "Set SERVER_IP in deploy/config.sh first." >&2; exit 1; fi
  if [[ ! -f "$SSH_KEY" ]]; then echo "SSH key not found at $SSH_KEY" >&2; exit 1; fi
  chmod 600 "$SSH_KEY" 2>/dev/null || true
}
