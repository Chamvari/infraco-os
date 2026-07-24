#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# infraco-os — nightly PostgreSQL backup (dated, gzipped, 14-day retention).
# Dumps THROUGH the db container (local trust auth inside the container), so no
# password is needed here. Installed as a cron job at 02:00 (see crontab).
# ─────────────────────────────────────────────────────────────
set -euo pipefail
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

BACKUP_DIR="/home/ubuntu/backups/infraco"
COMPOSE_FILE="/home/ubuntu/infraco-os/docker/docker-compose.prod.yml"
ENV_FILE="/home/ubuntu/infraco-os/docker/.env"
RETENTION_DAYS=14

mkdir -p "$BACKUP_DIR"
TS="$(date +%Y%m%d_%H%M%S)"
OUT="$BACKUP_DIR/infraco_os_${TS}.sql.gz"

# pg_dump (schema + data, restorable with --clean/--if-exists) → gzip.
if docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec -T db \
     pg_dump -U infraco -d infraco_os --clean --if-exists 2>>"$BACKUP_DIR/backup.log" \
   | gzip -9 > "$OUT.part"; then
  mv "$OUT.part" "$OUT"
  # Retention: remove dumps older than RETENTION_DAYS.
  find "$BACKUP_DIR" -name 'infraco_os_*.sql.gz' -type f -mtime "+${RETENTION_DAYS}" -delete
  echo "$(date -Is) OK   $OUT ($(du -h "$OUT" | cut -f1))"
else
  rm -f "$OUT.part"
  echo "$(date -Is) FAIL backup failed — see $BACKUP_DIR/backup.log" >&2
  exit 1
fi
