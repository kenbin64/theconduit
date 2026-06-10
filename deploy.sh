#!/usr/bin/env bash
# ============================================================================
# The Conduit / HydroManifold — VPS deploy
# ----------------------------------------------------------------------------
# This VPS already serves theconduit.me with nginx + certbot (TLS) reverse-
# proxying to a small Node login server (preview-server.js) on 127.0.0.1:8787,
# run under systemd as "theconduit". So deploying is just:
#   1. sync the app + login server into the nginx docroot (butterfly owns it)
#   2. restart the systemd service to pick up changes
# nginx/TLS/the login gate are already configured — nothing else to do.
#
# Usage:
#   ./deploy.sh            # test, sync, restart, verify
#   ./deploy.sh --no-tests # skip the local test gate
#   ./deploy.sh --restart  # just restart the service
#   ./deploy.sh --logs     # tail the service logs
# ============================================================================
set -euo pipefail

REMOTE="butterfly@172.81.62.217"
SSH_PORT="2222"
DOCROOT="/var/www/theconduit.me/public"   # nginx root for theconduit.me (butterfly-owned)
SERVICE="theconduit"                       # systemd unit running preview-server.js
URL="https://theconduit.me"

SELF_DIR="$(cd "$(dirname "$0")" && pwd)"; cd "$SELF_DIR"
say() { printf '\033[36m▶ %s\033[0m\n' "$*"; }
die() { printf '\033[31m✗ %s\033[0m\n' "$*" >&2; exit 1; }
SSH=(ssh -p "$SSH_PORT" -o BatchMode=yes "$REMOTE")

case "${1:-deploy}" in
  --restart) "${SSH[@]}" "sudo systemctl restart $SERVICE && systemctl is-active $SERVICE"; exit 0 ;;
  --logs)    "${SSH[@]}" "journalctl -u $SERVICE -n 80 -f"; exit 0 ;;
esac
SKIP=0; [ "${1:-}" = "--no-tests" ] && SKIP=1
command -v ssh >/dev/null || die "ssh not found"

# ── 1. local test gate ──────────────────────────────────────────────────────
if [ "$SKIP" -eq 0 ] && command -v node >/dev/null; then
  say "Running local tests"
  node test_suite.js >/dev/null         || die "test_suite.js failed — aborting"
  node tools/test-license.js >/dev/null || die "tools/test-license.js failed — aborting"
  printf '\033[32m✓ tests pass\033[0m\n'
fi

# ── 2. sync app + Node login server into the docroot (no sudo; butterfly owns it)
say "Syncing files → $REMOTE:$DOCROOT"
"${SSH[@]}" "mkdir -p $DOCROOT"
tar --exclude='.git' --exclude='.gitignore' --exclude='.gitattributes' \
    --exclude='tools' --exclude='tests' --exclude='deploy.sh' --exclude='node_modules' \
    --exclude='test_suite.js' --exclude='gen-health-image.js' -czf - . \
  | "${SSH[@]}" "tar -xzf - -C $DOCROOT"
printf '\033[32m✓ files synced\033[0m\n'

# ── 3. restart the login service to pick up changes (passwordless sudo) ──────
say "Restarting $SERVICE"
"${SSH[@]}" "sudo systemctl restart $SERVICE && sleep 1 && printf '   service: '; systemctl is-active $SERVICE"

# ── 4. verify ────────────────────────────────────────────────────────────────
code=$(curl -sk -m12 -o /dev/null -w '%{http_code}' "$URL/" 2>/dev/null || echo 000)
echo "   $URL → HTTP $code  (200 = app up)"
printf '\033[32m✓ deployed\033[0m  → %s   (public demo, no login)\n' "$URL"
