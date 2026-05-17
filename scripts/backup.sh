#!/usr/bin/env bash
# Nightly backup for Focus Town single-VM Lightsail deploy.
# Cron entry (on VM):
#   0 18 * * * /opt/focustown/scripts/backup.sh >> /var/log/focustown-backup.log 2>&1
# 18:00 UTC = 03:00 JST, off-peak.
#
# Requires:
#   - aws CLI on PATH, configured via ~/.aws/credentials (IAM user with
#     s3:PutObject on s3://${BACKUP_S3_BUCKET}/*)
#   - docker compose stack in /opt/focustown
#   - BACKUP_S3_BUCKET env var set in /opt/focustown/.env (loaded below)
#
# Retention: bucket lifecycle policy expires objects after 30 days; this
# script does NOT delete anything itself.

set -euo pipefail

APP_DIR=/opt/focustown
COMPOSE_FILE="${APP_DIR}/docker-compose.prod.yml"
ENV_FILE="${APP_DIR}/.env"

# Load BACKUP_S3_BUCKET (and anything else) from the deployed .env so this
# script doesn't need its own config file.
if [[ -f "${ENV_FILE}" ]]; then
    set -a
    # shellcheck disable=SC1090
    source "${ENV_FILE}"
    set +a
fi

: "${BACKUP_S3_BUCKET:?BACKUP_S3_BUCKET not set (define in /opt/focustown/.env)}"

TIMESTAMP=$(date -u +%Y%m%d-%H%M%S)
WORK_DIR=$(mktemp -d -t focustown-backup-XXXXXX)
trap 'rm -rf "${WORK_DIR}"' EXIT

DB_OUT="${WORK_DIR}/db-${TIMESTAMP}.dump"
STORAGE_OUT="${WORK_DIR}/storage-${TIMESTAMP}.tar.gz"

echo "[$(date -u +%FT%TZ)] starting backup ${TIMESTAMP}"

# pg_dump via the running postgres container in custom format (-Fc) for
# pg_restore compatibility + smaller size.
docker compose -f "${COMPOSE_FILE}" exec -T postgres \
    pg_dump -U focustown -F c -d focustown \
    > "${DB_OUT}"

# Storage tar is best-effort: directory may be empty if no track files yet.
if [[ -d "${APP_DIR}/backend/data/storage" ]]; then
    tar -czf "${STORAGE_OUT}" \
        -C "${APP_DIR}" backend/data/storage
fi

aws s3 cp "${DB_OUT}" "s3://${BACKUP_S3_BUCKET}/db/db-${TIMESTAMP}.dump" \
    --only-show-errors

if [[ -f "${STORAGE_OUT}" ]]; then
    aws s3 cp "${STORAGE_OUT}" "s3://${BACKUP_S3_BUCKET}/storage/storage-${TIMESTAMP}.tar.gz" \
        --only-show-errors
fi

echo "[$(date -u +%FT%TZ)] backup ${TIMESTAMP} uploaded ($(du -h "${DB_OUT}" | cut -f1))"
