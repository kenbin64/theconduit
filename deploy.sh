#!/usr/bin/env bash
# ============================================================================
# The Conduit / HydroManifold — VPS deploy
# ----------------------------------------------------------------------------
# Ships the static app + gated Node preview-server to the VPS over SSH and runs
# it under systemd (auto-restart, survives reboot). No build step — it's a
# dependency-free static site served by preview-server.js (login: admin/quenchit).
#
# Usage:
#   ./deploy.sh                 # run tests, sync, (re)start the service
#   ./deploy.sh --no-tests      # skip the local test gate
#   ./deploy.sh --restart       # just restart the remote service
#   ./deploy.sh --logs          # tail the remote service logs
#
# Prerequisites:
#   • SSH key access to the VPS  (ssh-copy-id butterfly@172.81.62.217)
#   • Node.js installed on the VPS  (the script checks and tells you if not)
#   • sudo on the VPS for the (one-time) systemd unit install
#   • the app PORT open in the VPS firewall if exposing directly (see BIND_HOST)
#
# Transfers with tar-over-ssh (only needs ssh+tar — works from Windows git-bash,
# WSL, macOS or Linux; no rsync required).
# ============================================================================
set -euo pipefail

# ── configuration ──────────────────────────────────────────────────────────
REMOTE="butterfly@172.81.62.217"
REMOTE_DIR="/home/butterfly/theconduit"   # where the app lives on the VPS
SERVICE="theconduit"                       # systemd service name
APP_PORT="8787"                            # port the Node server listens on
BIND_HOST="0.0.0.0"                        # 0.0.0.0 = reachable at http://VPS_IP:PORT
                                           # 127.0.0.1 = local only (put nginx in front)
NODE_BIN="node"                            # node on the VPS PATH

SELF_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SELF_DIR"

say() { printf '\033[36m▶ %s\033[0m\n' "$*"; }
die() { printf '\033[31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

# ── sub-commands ────────────────────────────────────────────────────────────
case "${1:-deploy}" in
  --restart) say "Restarting $SERVICE on $REMOTE"; ssh "$REMOTE" "sudo systemctl restart $SERVICE && systemctl --no-pager status $SERVICE | head -5"; exit 0 ;;
  --logs)    say "Tailing $SERVICE logs (Ctrl-C to stop)"; ssh "$REMOTE" "journalctl -u $SERVICE -n 80 -f"; exit 0 ;;
esac

SKIP_TESTS=0
[ "${1:-}" = "--no-tests" ] && SKIP_TESTS=1

command -v ssh >/dev/null || die "ssh not found on this machine"

# ── 1. local test gate (don't ship a broken build) ──────────────────────────
if [ "$SKIP_TESTS" -eq 0 ]; then
  if command -v node >/dev/null; then
    say "Running local tests"
    node test_suite.js >/dev/null        || die "engine test_suite.js failed — aborting deploy"
    node tools/test-license.js >/dev/null || die "tools/test-license.js failed — aborting deploy"
    printf '\033[32m✓ tests pass\033[0m\n'
  else
    printf '\033[33m! node not found locally — skipping test gate\033[0m\n'
  fi
fi

# ── 2. ship the site (tar-over-ssh; excludes git/dev cruft) ──────────────────
say "Deploying to $REMOTE:$REMOTE_DIR"
ssh "$REMOTE" "mkdir -p '$REMOTE_DIR'"
tar --exclude='.git' --exclude='node_modules' --exclude='*.log' \
    --exclude='.DS_Store' --exclude='deploy.sh' -czf - . \
  | ssh "$REMOTE" "tar -xzf - -C '$REMOTE_DIR'"
printf '\033[32m✓ files synced\033[0m\n'

# ── 3. (re)install the systemd service and (re)start ─────────────────────────
say "Installing/refreshing systemd service: $SERVICE"
ssh "$REMOTE" "bash -s" <<REMOTE_SCRIPT
set -e
command -v $NODE_BIN >/dev/null || { echo '✗ node not installed on the VPS — install Node.js first (e.g. via nvm or your distro)'; exit 1; }
NODE_PATH="\$(command -v $NODE_BIN)"
sudo tee /etc/systemd/system/$SERVICE.service >/dev/null <<UNIT
[Unit]
Description=The Conduit / HydroManifold
After=network.target

[Service]
Type=simple
User=\$(whoami)
WorkingDirectory=$REMOTE_DIR
Environment=PORT=$APP_PORT
Environment=HOST=$BIND_HOST
ExecStart=\$NODE_PATH preview-server.js
Restart=on-failure
RestartSec=3

[Install]
WantedBy=multi-user.target
UNIT
sudo systemctl daemon-reload
sudo systemctl enable $SERVICE >/dev/null 2>&1 || true
sudo systemctl restart $SERVICE
sleep 1
systemctl --no-pager status $SERVICE | head -6 || true
REMOTE_SCRIPT

echo
printf '\033[32m✓ deployed\033[0m\n'
if [ "$BIND_HOST" = "0.0.0.0" ]; then
  echo "   → http://172.81.62.217:$APP_PORT/   (sign in: admin / quenchit)"
  echo "   (ensure the VPS firewall allows TCP $APP_PORT — e.g. sudo ufw allow $APP_PORT)"
else
  echo "   → bound to $BIND_HOST:$APP_PORT on the VPS — put nginx/Caddy in front for public access + TLS"
fi
echo "   logs:    ./deploy.sh --logs        restart: ./deploy.sh --restart"
echo
echo "   NOTE: change the demo login (admin/quenchit) in preview-server.js before any real use."
