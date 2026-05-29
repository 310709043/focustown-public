#!/usr/bin/env bash
# One-shot: make the live landing feedback form work by (A) redeploying the
# dev backend with the new CORS origin + ADMIN_FEEDBACK_EMAIL, and (B)
# re-publishing the landing site so www posts to the dev backend.
#
# Why this script exists: CI (Build & push → deploy-dev) is broken at the
# GitHub→AWS OIDC step, so a merge won't deploy. This reuses the CURRENT dev
# image and only patches two env values — no rebuild, no secret sharing.
#
# Run from a checkout that has the dev-URL landing (branch
# fix/landing-feedback-dev-backend, or develop after PR #173 is merged):
#   bash scripts/redeploy-dev-feedback.sh
#
# Requires: aws CLI + python3, and AWS profile "lowbatterytown" (account
# 417609991573) — the same profile in /tmp/lbt-landing/state.env.

set -euo pipefail

PROFILE=lowbatterytown
REGION=ap-northeast-1
SVC=lowbatterytown-dev
LANDING_BUCKET=s3://lowbatterytown-landing-prod
DIST_ID=E2R207MGUWH34U
WWW_ORIGIN="https://www.lowbatterytown.com"
ADMIN_EMAIL="focustown1314@gmail.com"

cd "$(dirname "${BASH_SOURCE[0]}")/.."

# ── Guard: ensure this checkout has the dev-URL landing ──────────────
if ! grep -q "dev.lowbatterytown.com/api/v1/feedback" landing/index.html; then
  echo "✗ landing/index.html does not target dev.lowbatterytown.com." >&2
  echo "  Check out branch fix/landing-feedback-dev-backend (or merge PR #173) first." >&2
  exit 1
fi

# Local temp dir + RELATIVE file:// paths so the Windows-native aws CLI (run
# from git-bash) resolves them against cwd; absolute /tmp paths don't translate.
TMP=".lbt-redeploy-tmp"
mkdir -p "$TMP"
trap 'rm -rf "$TMP"' EXIT
AWS="aws --profile $PROFILE --region $REGION"

echo "▸ [A] Reading current dev deployment (reuse image, patch 2 env values)…"
$AWS lightsail get-container-services --service-name "$SVC" \
  --query 'containerServices[0].currentDeployment.containers' --output json > "$TMP/containers.json"
$AWS lightsail get-container-services --service-name "$SVC" \
  --query 'containerServices[0].currentDeployment.publicEndpoint' --output json > "$TMP/endpoint.json"

python3 - "$TMP/containers.json" "$WWW_ORIGIN" "$ADMIN_EMAIL" <<'PY'
import json, sys
cf, www, admin = sys.argv[1], sys.argv[2], sys.argv[3]
c = json.load(open(cf))
env = c["backend"]["environment"]
cors = env.get("APP_CORS_ORIGINS", "")
origins = [o for o in cors.split(",") if o]
if www not in origins:
    origins.append(www)
env["APP_CORS_ORIGINS"] = ",".join(origins)
env["ADMIN_FEEDBACK_EMAIL"] = admin
json.dump(c, open(cf, "w"), indent=2)
print("  image           :", c["backend"].get("image"))
print("  APP_CORS_ORIGINS:", env["APP_CORS_ORIGINS"])
print("  ADMIN_FEEDBACK_EMAIL:", env["ADMIN_FEEDBACK_EMAIL"])
PY

echo "▸ Creating new dev deployment…"
$AWS lightsail create-container-service-deployment \
  --service-name "$SVC" \
  --containers "file://$TMP/containers.json" \
  --public-endpoint "file://$TMP/endpoint.json" \
  `# $TMP is relative (./.lbt-redeploy-tmp), so file:// resolves against cwd` \
  --query 'containerService.currentDeployment.{version:version,state:state}' --output table

echo "▸ Waiting for deployment to go ACTIVE (up to ~10 min)…"
for i in $(seq 1 40); do
  STATE=$($AWS lightsail get-container-services --service-name "$SVC" \
    --query 'containerServices[0].currentDeployment.state' --output text)
  echo "  [$i] state=$STATE"
  [ "$STATE" = "ACTIVE" ] && break
  if [ "$STATE" = "FAILED" ]; then echo "✗ deployment FAILED" >&2; exit 1; fi
  sleep 15
done

echo "▸ [B] Re-publishing landing to S3 (NO --delete — preserves bucket-only assets)…"
aws s3 sync landing/ "$LANDING_BUCKET" --profile "$PROFILE" \
  --exclude "*" --include "*.html" \
  --cache-control "public, max-age=60, must-revalidate" \
  --content-type "text/html; charset=utf-8"
aws s3 sync landing/ "$LANDING_BUCKET" --profile "$PROFILE" \
  --exclude "*" --include "*.svg" \
  --cache-control "public, max-age=86400" --content-type "image/svg+xml"
aws s3 sync landing/ "$LANDING_BUCKET" --profile "$PROFILE" \
  --exclude "*.html" --exclude "*.svg" --cache-control "public, max-age=3600"

echo "▸ Invalidating CloudFront…"
$AWS cloudfront create-invalidation --distribution-id "$DIST_ID" --paths "/*" \
  --query 'Invalidation.{Id:Id,Status:Status}' --output table

echo "▸ [C] Verifying CORS preflight from www → dev backend…"
ACAO=$(curl -s -i -X OPTIONS "https://dev.lowbatterytown.com/api/v1/feedback" \
  -H "Origin: $WWW_ORIGIN" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: content-type" \
  | grep -i "access-control-allow-origin" || true)
echo "  $ACAO"
if echo "$ACAO" | grep -qi "$WWW_ORIGIN"; then
  echo "✓ Done. The live landing form can now POST to the dev backend."
  echo "  Submit feedback on https://www.lowbatterytown.com and check $ADMIN_EMAIL."
else
  echo "⚠ Preflight did not return the www origin yet — CloudFront/CORS may still be propagating; retry in a minute." >&2
fi
