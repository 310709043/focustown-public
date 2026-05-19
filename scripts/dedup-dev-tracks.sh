#!/usr/bin/env bash
# One-shot cleanup for the 6 duplicate seed-system tracks left by the
# pre-PR#70 seed bug (existence check used .title() form instead of the
# mapped form, so each cold-start re-inserted "Sunlight on the Floor"
# and "Midnight at the Overpass"). PR #70 fixes the seed; this script
# removes the duplicates already in the dev PG.
#
# Run from this repo root. Assumes Docker Desktop + the lowbatterytown
# AWS profile + /tmp/lbt-deploy/state.env (Phase B).
#
# Idempotent: re-running on an already-clean DB deletes 0 rows.

set -euo pipefail

STATE="${LBT_STATE_FILE:-/tmp/lbt-deploy/state.env}"
# shellcheck disable=SC1090
source "$STATE"

REGION="${AWS_REGION:-ap-northeast-1}"
PROFILE="${AWS_PROFILE:-lowbatterytown}"
DB_NAME="lowbatterytown-pg-prod"

# Safety net: if ANY step fails after we open PG, always lock back down
# before exiting. Otherwise an aborted run leaves the DB exposed.
LOCKED=0
lock_pg() {
    if [[ "$LOCKED" == "0" ]]; then
        echo "==> [cleanup] Locking PG back down..."
        aws lightsail update-relational-database --region "$REGION" --profile "$PROFILE" \
            --relational-database-name "$DB_NAME" \
            --no-publicly-accessible >/dev/null || true
        LOCKED=1
    fi
}
trap lock_pg EXIT INT TERM

echo "==> [1/4] Opening PG temporarily for the dedup..."
aws lightsail update-relational-database --region "$REGION" --profile "$PROFILE" \
    --relational-database-name "$DB_NAME" \
    --publicly-accessible >/dev/null

# Wait until publiclyAccessible flips true. update-relational-database returns
# immediately; the change takes ~30s to apply.
for i in $(seq 1 30); do
    PUB=$(aws lightsail get-relational-database --region "$REGION" --profile "$PROFILE" \
        --relational-database-name "$DB_NAME" \
        --query 'relationalDatabase.publiclyAccessible' --output text)
    if [[ "$PUB" == "True" ]]; then
        echo "    public after ${i}s"
        break
    fi
    sleep 1
done

DEV_PWD_ENC=$(printf '%s' "$DEV_DB_PASSWORD" | jq -sRr '@uri')
URL="postgresql://lowbatterytown_dev:${DEV_PWD_ENC}@${PG_ENDPOINT}:5432/lowbatterytown_dev?sslmode=require"

# Connectivity wait. Lightsail's publiclyAccessible flip happens in two
# phases: flag flips fast (~10-30s) but the actual public DNS A-record
# update + security-group reroute can take another 1-3 minutes. Docker
# Desktop's embedded DNS resolver can also serve a stale private IP for
# a while. `--dns=1.1.1.1` forces the container to bypass that cache and
# hit Cloudflare directly. Retry psql up to 12 × 15s = 3 min.
DOCKER_PSQL=(docker run --rm --dns=1.1.1.1 postgres:16 psql "$URL")

echo "==> [1b] Waiting for PG to accept TCP from the public Internet..."
for i in $(seq 1 12); do
    if "${DOCKER_PSQL[@]}" -tAc "SELECT 1;" >/dev/null 2>&1; then
        echo "    connected on attempt $i"
        break
    fi
    sleep 15
done
# Final attempt — if still failing, surface the real error before aborting.
if ! "${DOCKER_PSQL[@]}" -tAc "SELECT 1;" >/dev/null 2>&1; then
    echo "✗ PG still not reachable after 3 min. Last error:" >&2
    "${DOCKER_PSQL[@]}" -tAc "SELECT 1;" >&2 || true
    exit 1
fi

echo "==> [2/4] Counting current tracks owned by seed-system..."
BEFORE=$("${DOCKER_PSQL[@]}" -tAc \
    "SELECT COUNT(*) FROM tracks WHERE uploaded_by_user_id IN \
     (SELECT id FROM users WHERE email = 'seed-system@focustown.local');")
echo "    before: $BEFORE"

echo "==> [3/4] Deduping (keep oldest row per title)..."
docker run --rm --dns=1.1.1.1 -i postgres:16 psql "$URL" <<'SQL'
WITH ranked AS (
  SELECT id, title,
         ROW_NUMBER() OVER (PARTITION BY title ORDER BY created_at ASC, id ASC) AS rn
  FROM tracks
  WHERE uploaded_by_user_id IN
        (SELECT id FROM users WHERE email = 'seed-system@focustown.local')
)
DELETE FROM tracks
WHERE id IN (SELECT id FROM ranked WHERE rn > 1)
RETURNING title;
SQL

AFTER=$("${DOCKER_PSQL[@]}" -tAc \
    "SELECT COUNT(*) FROM tracks WHERE uploaded_by_user_id IN \
     (SELECT id FROM users WHERE email = 'seed-system@focustown.local');")
echo "    after:  $AFTER"

# Step [4/4] is the trap-driven cleanup that always runs on exit.
echo "==> [4/4] (cleanup runs on exit)"

echo
echo "Done. Verify with:"
echo "  curl -fsS https://dev.lowbatterytown.com/api/v1/tracks | jq 'length'"
echo "Should report 5 (was $BEFORE, now $AFTER)."
