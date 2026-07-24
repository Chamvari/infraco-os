#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# infraco-os — upgrade the self-signed TLS cert to a trusted Let's Encrypt cert.
# HTTP-01 challenge via certbot --standalone (mirrors aws-deploy/DEPLOY-README.md).
#
#   ./ssl-upgrade/upgrade-to-letsencrypt.sh <domain> [email]
#
# Requires: port 80 reachable from the internet for the ACME challenge (open it in
# UFW *and* the cloud security list first). Stops the web container briefly to free
# :80, issues the cert, installs it into docker/ssl/, and restarts web. Also drops a
# renewal deploy-hook so future auto-renewals copy the cert back and reload nginx.
# ─────────────────────────────────────────────────────────────
set -euo pipefail

DOMAIN="${1:?usage: upgrade-to-letsencrypt.sh <domain> [email]}"
EMAIL="${2:-admin@eos.co.zw}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
COMPOSE_FILE="$REPO_ROOT/docker/docker-compose.prod.yml"
ENV_FILE="$REPO_ROOT/docker/.env"
SSL_DIR="$REPO_ROOT/docker/ssl"
LE_LIVE="/etc/letsencrypt/live/$DOMAIN"

compose() { sudo docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" "$@"; }

echo "→ Ensuring certbot is installed…"
if ! command -v certbot >/dev/null 2>&1; then
  sudo apt-get update -qq
  sudo apt-get install -y -qq certbot
fi

echo "→ Freeing port 80 (stopping web container) for the HTTP-01 challenge…"
compose stop web

# Deploy hook: on any future renewal, copy the new cert into docker/ssl/ and reload nginx.
HOOK=/etc/letsencrypt/renewal-hooks/deploy/infraco-copy.sh
sudo mkdir -p "$(dirname "$HOOK")"
sudo tee "$HOOK" >/dev/null <<HOOKEOF
#!/usr/bin/env bash
set -e
if [ "\$RENEWED_LINEAGE" = "$LE_LIVE" ]; then
  cp "$LE_LIVE/fullchain.pem" "$SSL_DIR/infraco.crt"
  cp "$LE_LIVE/privkey.pem"   "$SSL_DIR/infraco.key"
  docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec -T web nginx -s reload \
    || docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d web
fi
HOOKEOF
sudo chmod +x "$HOOK"

echo "→ Requesting certificate for $DOMAIN (certbot --standalone)…"
set +e
sudo certbot certonly --standalone -d "$DOMAIN" \
  --non-interactive --agree-tos -m "$EMAIL" \
  --keep-until-expiring --http-01-port 80
RC=$?
set -e

# NB: /etc/letsencrypt/live is root-only (0700), so test the file via sudo —
# a plain [ -f ] as the invoking user would false-negative even on success.
if [ "$RC" -ne 0 ] || ! sudo test -f "$LE_LIVE/fullchain.pem"; then
  echo "✗ certbot failed (rc=$RC). Restoring web with the existing (self-signed) cert." >&2
  compose up -d web
  exit 1
fi

echo "→ Installing issued cert into docker/ssl/…"
sudo cp "$LE_LIVE/fullchain.pem" "$SSL_DIR/infraco.crt"
sudo cp "$LE_LIVE/privkey.pem"   "$SSL_DIR/infraco.key"
sudo chmod 644 "$SSL_DIR/infraco.crt"
sudo chmod 600 "$SSL_DIR/infraco.key"

echo "→ Restarting web with the trusted cert…"
compose up -d web

echo "✓ Trusted certificate installed for https://$DOMAIN/"
