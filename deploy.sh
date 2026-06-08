#!/usr/bin/env bash
# ============================================================================
# The Conduit / HydroManifold — VPS deploy (with SSL)
# ----------------------------------------------------------------------------
# Ships the static app + gated Node preview-server to the VPS over SSH, runs it
# under systemd on 127.0.0.1, and fronts it with Caddy for HTTPS:
#   • DOMAIN set  → automatic, trusted Let's Encrypt certificate
#   • DOMAIN empty → self-signed cert on the bare IP (HTTPS works; browsers warn
#                    until a real domain points at the VPS — public CAs don't
#                    issue certs for bare IPs)
# No build step — it's a dependency-free static site (login: admin/quenchit).
#
# Usage:
#   ./deploy.sh            # test, sync, (re)start app + (re)configure HTTPS
#   ./deploy.sh --no-tests # skip the local test gate
#   ./deploy.sh --restart  # restart the app service
#   ./deploy.sh --logs     # tail the app service logs
#
# Prerequisites on the VPS: SSH key access, Node.js, and sudo (for systemd,
# Caddy, and the firewall). DNS for DOMAIN must point at the VPS before the
# first run, and TCP 80+443 must be reachable for Let's Encrypt.
# ============================================================================
set -euo pipefail

# ── configuration ──────────────────────────────────────────────────────────
REMOTE="butterfly@172.81.62.217"
VPS_IP="172.81.62.217"
REMOTE_DIR="/home/butterfly/theconduit"
SERVICE="theconduit"
APP_PORT="8787"                 # Node app port (localhost only; Caddy proxies to it)
DOMAIN=""                       # e.g. theconduit.example.com  → real Let's Encrypt cert
TLS_EMAIL=""                    # email for Let's Encrypt expiry notices (set with DOMAIN)
NODE_BIN="node"

SELF_DIR="$(cd "$(dirname "$0")" && pwd)"; cd "$SELF_DIR"
say() { printf '\033[36m▶ %s\033[0m\n' "$*"; }
die() { printf '\033[31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

case "${1:-deploy}" in
  --restart) ssh "$REMOTE" "sudo systemctl restart $SERVICE && systemctl --no-pager status $SERVICE | head -5"; exit 0 ;;
  --logs)    ssh "$REMOTE" "journalctl -u $SERVICE -n 80 -f"; exit 0 ;;
esac
SKIP_TESTS=0; [ "${1:-}" = "--no-tests" ] && SKIP_TESTS=1
command -v ssh >/dev/null || die "ssh not found on this machine"

# ── 1. local test gate ──────────────────────────────────────────────────────
if [ "$SKIP_TESTS" -eq 0 ] && command -v node >/dev/null; then
  say "Running local tests"
  node test_suite.js >/dev/null        || die "engine test_suite.js failed — aborting"
  node tools/test-license.js >/dev/null || die "tools/test-license.js failed — aborting"
  printf '\033[32m✓ tests pass\033[0m\n'
fi

# ── 2. ship the site (tar-over-ssh) ─────────────────────────────────────────
say "Syncing files to $REMOTE:$REMOTE_DIR"
ssh "$REMOTE" "mkdir -p '$REMOTE_DIR'"
tar --exclude='.git' --exclude='node_modules' --exclude='*.log' \
    --exclude='.DS_Store' --exclude='deploy.sh' -czf - . \
  | ssh "$REMOTE" "tar -xzf - -C '$REMOTE_DIR'"
printf '\033[32m✓ files synced\033[0m\n'

# ── 3. app systemd service + Caddy install + firewall ───────────────────────
say "Configuring app service + Caddy (HTTPS)"
ssh "$REMOTE" "bash -s" <<REMOTE_SCRIPT
set -e
command -v $NODE_BIN >/dev/null || { echo '✗ Node.js not installed on the VPS — install it first'; exit 1; }
NODE_PATH="\$(command -v $NODE_BIN)"

# app service — bound to localhost; Caddy terminates TLS and proxies to it
sudo tee /etc/systemd/system/$SERVICE.service >/dev/null <<UNIT
[Unit]
Description=The Conduit / HydroManifold
After=network.target

[Service]
Type=simple
User=\$(whoami)
WorkingDirectory=$REMOTE_DIR
Environment=PORT=$APP_PORT
Environment=HOST=127.0.0.1
ExecStart=\$NODE_PATH preview-server.js
Restart=on-failure
RestartSec=3

[Install]
WantedBy=multi-user.target
UNIT
sudo systemctl daemon-reload
sudo systemctl enable $SERVICE >/dev/null 2>&1 || true
sudo systemctl restart $SERVICE

# Caddy (automatic HTTPS) — install from the official apt repo if missing
if ! command -v caddy >/dev/null; then
  echo 'installing Caddy…'
  sudo apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl gnupg >/dev/null
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
  sudo apt-get update -y >/dev/null && sudo apt-get install -y caddy >/dev/null
fi
sudo mkdir -p /etc/caddy

# firewall: HTTPS needs 80 (ACME challenge / redirect) + 443
if command -v ufw >/dev/null; then sudo ufw allow 80/tcp >/dev/null 2>&1 || true; sudo ufw allow 443/tcp >/dev/null 2>&1 || true; fi
REMOTE_SCRIPT

# ── 4. write the Caddyfile (built locally, then installed) ───────────────────
if [ -n "$DOMAIN" ]; then
  CADDYFILE="$( [ -n "$TLS_EMAIL" ] && printf '{\n\temail %s\n}\n\n' "$TLS_EMAIL" )$DOMAIN {
	reverse_proxy 127.0.0.1:$APP_PORT
}
"
  PUBLIC_URL="https://$DOMAIN/"
else
  # bare IP → self-signed (Caddy's internal CA); redirect :80 → :443
  CADDYFILE=":443 {
	tls internal
	reverse_proxy 127.0.0.1:$APP_PORT
}
:80 {
	redir https://{host}{uri}
}
"
  PUBLIC_URL="https://$VPS_IP/  (self-signed — browser will warn until you set a DOMAIN)"
fi
printf '%s' "$CADDYFILE" | ssh "$REMOTE" "sudo tee /etc/caddy/Caddyfile >/dev/null && sudo systemctl enable caddy >/dev/null 2>&1 || true; sudo systemctl reload caddy 2>/dev/null || sudo systemctl restart caddy"

echo
printf '\033[32m✓ deployed with HTTPS\033[0m\n'
echo "   → $PUBLIC_URL"
echo "     sign in: admin / quenchit   (change this in preview-server.js before real use)"
[ -z "$DOMAIN" ] && echo "   For a trusted certificate: point a domain at $VPS_IP, set DOMAIN (and TLS_EMAIL) at the top of this script, and re-run."
echo "   logs: ./deploy.sh --logs    restart app: ./deploy.sh --restart"
