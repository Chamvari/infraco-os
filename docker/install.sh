#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# infraco-os  –  production stack installer
# Builds and starts the prod compose stack. Resolves all paths relative to
# this script, so it can be run from anywhere:
#   ./docker/install.sh                 # build + start
#   ./docker/install.sh --seed-demo     # also load db/seed_demo.sql
# ─────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
COMPOSE_FILE="$SCRIPT_DIR/docker-compose.prod.yml"
ENV_FILE="$SCRIPT_DIR/.env"
SSL_DIR="$SCRIPT_DIR/ssl"

SEED_DEMO=0
[[ "${1:-}" == "--seed-demo" ]] && SEED_DEMO=1

compose() { docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" "$@"; }

# 1. env file must exist and be filled in
if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: $ENV_FILE not found." >&2
  echo "       cp docker/.env.production.example docker/.env  and fill in every <CHANGE_ME>." >&2
  exit 1
fi
if grep -q '<CHANGE_ME>' "$ENV_FILE"; then
  echo "ERROR: docker/.env still contains <CHANGE_ME> placeholders — fill them in first." >&2
  exit 1
fi

# 2. TLS certificate — generate a self-signed pair if none present
#    (REPLACE with real certificates for production.)
if [[ ! -f "$SSL_DIR/infraco.crt" || ! -f "$SSL_DIR/infraco.key" ]]; then
  echo "→ No TLS cert found; generating a self-signed pair (replace for production)…"
  mkdir -p "$SSL_DIR"
  openssl req -x509 -nodes -newkey rsa:2048 -days 365 \
    -keyout "$SSL_DIR/infraco.key" -out "$SSL_DIR/infraco.crt" \
    -subj "/CN=infraco.local"
fi

# 3. build + start
echo "→ Building images (context: $REPO_ROOT)…"
compose build

echo "→ Starting stack…"
compose up -d

# 4. optional demo seed — wait for db health, then load the seed SQL
if [[ "$SEED_DEMO" == "1" ]]; then
  DB_USER="$(grep -E '^DB_USER=' "$ENV_FILE" | cut -d= -f2-)"
  DB_NAME="$(grep -E '^DB_NAME=' "$ENV_FILE" | cut -d= -f2-)"
  echo "→ Waiting for database to accept connections…"
  until compose exec -T db pg_isready -U "$DB_USER" -d "$DB_NAME" >/dev/null 2>&1; do
    sleep 2
  done
  echo "→ Seeding demo data (db/seed_demo.sql)…"
  compose exec -T db psql -U "$DB_USER" -d "$DB_NAME" < "$REPO_ROOT/db/seed_demo.sql"
fi

echo
echo "✓ Stack is up."
echo "  Web : https://<server-ip>/"
echo "  API : reverse-proxied at /auth, /plots, /leases, /api/*, /notifications/*"
echo "  Scale the API:  docker compose -f docker/docker-compose.prod.yml up -d --scale api=3"
