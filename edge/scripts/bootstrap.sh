#!/usr/bin/env bash
# One-time setup of the LowBatteryTown API on a Cloudflare account, then a
# first deploy. Safe to re-run: existing pieces are reused.
#
# Needs CLOUDFLARE_API_TOKEN (Account: Workers Scripts Edit, D1 Edit;
# Zone lowbatterytown.com: Workers Routes Edit, DNS Edit) and
# CLOUDFLARE_ACCOUNT_ID in the environment.
set -euo pipefail
cd "$(dirname "$0")/.."

: "${CLOUDFLARE_API_TOKEN:?set CLOUDFLARE_API_TOKEN}"
: "${CLOUDFLARE_ACCOUNT_ID:?set CLOUDFLARE_ACCOUNT_ID}"
W="npx wrangler"

# 1. D1 database "lbt": reuse it if it exists, and write its id into wrangler.jsonc.
DB_ID=$($W d1 list --json | node -e 'const l=JSON.parse(require("fs").readFileSync(0,"utf8"));const d=l.find(x=>x.name==="lbt");if(d)console.log(d.uuid)')
if [[ -z "$DB_ID" ]]; then
  $W d1 create lbt >/dev/null
  DB_ID=$($W d1 list --json | node -e 'const l=JSON.parse(require("fs").readFileSync(0,"utf8"));console.log(l.find(x=>x.name==="lbt").uuid)')
fi
node -e '
  const fs = require("fs");
  const p = "wrangler.jsonc";
  fs.writeFileSync(p, fs.readFileSync(p, "utf8").replace(/"database_id": "[^"]*"/, `"database_id": "${process.argv[1]}"`));
' "$DB_ID"
echo "D1 lbt = $DB_ID"

# 2. Schema.
$W d1 migrations apply lbt --remote

# 3. First deploy creates the Worker (and the api.lowbatterytown.com custom domain).
$W deploy

# 4. Token-signing secret: random, never printed, kept unless already set.
if ! $W secret list --format json 2>/dev/null | grep -q '"LBT_TOKEN_SECRET"'; then
  node -e 'process.stdout.write(require("crypto").randomBytes(48).toString("base64url"))' | $W secret put LBT_TOKEN_SECRET
fi
# The admin review API stays off until the owner sets their own token:
#   npx wrangler secret put ADMIN_TOKEN

curl -fsS https://api.lowbatterytown.com/healthz && echo " ← api.lowbatterytown.com is up"
