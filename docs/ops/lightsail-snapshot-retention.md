# Lightsail managed Postgres — snapshot retention runbook

This runbook is the source of truth for FocusTown's PG backup policy.
The IaC for Lightsail is not yet committed to this repo; this document
captures the operator-applied state and the commands to verify it.

## Policy

| Item | Value |
|---|---|
| Automatic daily snapshots | enabled (Lightsail default) |
| Retention window | 7 days |
| Snapshot window (UTC) | 02:00–02:30 |
| RPO (worst case) | 24h (daily snapshots; PITR within retention) |
| RTO (≤50GB DB) | ≈15 minutes (restore from snapshot → new instance) |
| Manual snapshot before schema-breaking migration | required |
| Manual snapshot tag convention | `pre-<alembic_revision>` (e.g. `pre-0024`) |

Lightsail managed PG runs continuous WAL archival inside its snapshot
window, which means **point-in-time recovery** is available anywhere
inside the retention window (not just at the daily snapshot boundaries).
For schema-breaking migrations, take a manual snapshot first — manual
snapshots are kept until you delete them, whereas an automatic daily
snapshot may roll off in 7 days.

## Apply policy (one-time, per environment)

The Lightsail console UI is the supported path; the CLI commands below
are equivalent.

### Console

1. Lightsail → Databases → `focustown-pg-prod` (or `-dev`).
2. Settings → Automatic snapshots → enable.
3. Snapshot time: 02:00 UTC (off-peak for our APAC user base).
4. Retention: 7 days.

### CLI

```bash
# Enable + set window (replace REGION and DB_NAME)
aws lightsail update-relational-database \
  --relational-database-name focustown-pg-prod \
  --preferred-backup-window "02:00-02:30" \
  --region "$REGION"
```

Lightsail does not expose retention as a tunable for managed PG — it is
fixed at 7 days for daily automatic snapshots. Manual snapshots are
retained indefinitely.

## Verify

Run these in CI / a pre-deploy step to confirm the last good snapshot.

```bash
# Most recent automatic snapshot per DB:
aws lightsail get-relational-database-snapshots --region "$REGION" \
  --query 'relationalDatabaseSnapshots[?fromRelationalDatabaseName==`focustown-pg-prod`].{Name:name,CreatedAt:createdAt,Size:sizeInGb}' \
  --output table

# Latest snapshot time:
aws lightsail get-relational-database-snapshots --region "$REGION" \
  --query 'sort_by(relationalDatabaseSnapshots, &createdAt)[-1].{Name:name,Time:createdAt}' \
  --output table
```

If the latest automatic snapshot is older than 30 hours, the backup
schedule has stopped — page on-call.

## Pre-migration snapshot procedure

For any migration that drops a column, drops a table, or alters a
NOT NULL constraint, the operator MUST take a manual snapshot first:

```bash
REV="0024"   # the alembic revision being applied
aws lightsail create-relational-database-snapshot \
  --relational-database-name focustown-pg-prod \
  --relational-database-snapshot-name "pre-${REV}-$(date -u +%Y%m%dT%H%M)" \
  --region "$REGION"
```

Wait for the snapshot to reach `available` before running `alembic
upgrade`:

```bash
aws lightsail get-relational-database-snapshot \
  --relational-database-snapshot-name "<name from above>" \
  --query 'relationalDatabaseSnapshot.state' --output text
```

## Restore (recovery)

Restoring is non-destructive: it creates a *new* Lightsail PG instance
from the snapshot. The app is then re-pointed (DNS + secrets) to the
new endpoint.

```bash
SRC="pre-0024-20260520T0100"
aws lightsail create-relational-database-from-snapshot \
  --relational-database-name focustown-pg-prod-restore \
  --relational-database-snapshot-name "$SRC" \
  --region "$REGION"
```

After the new instance is `available`, the next steps are operator-
driven and intentionally NOT scripted (each cutover needs sign-off):

1. Verify schema: `alembic current` against the restored instance.
2. Spot-check critical tables (`users`, `focus_sessions`, `wallets`).
3. Update `DATABASE_URL` in the deployment secrets.
4. Redeploy the backend / worker to pick up the new endpoint.
5. Optionally rename the old instance to `focustown-pg-prod-old-<date>`
   and the new one to `focustown-pg-prod`.

## Quarterly drill

Once per quarter, restore the most recent automatic snapshot to a
throwaway instance and run `alembic upgrade head` against it. The drill
catches three failure modes that go undetected in steady state:

1. Snapshot is unrestorable (corruption, region-mismatch, missing IAM).
2. The current `HEAD` migration is not re-applicable to a fresh PG.
3. The runbook itself has rotted out of date.

Record the date and outcome here on completion.

| Date | Outcome | Operator | Notes |
|---|---|---|---|
| _(empty — fill in after first drill)_ |  |  |  |
