#!/usr/bin/env bash
# Attach a CloudFront Function that rewrites subdirectory requests to their
# index.html, so `/en/` (and any future `/foo/`) serves `/en/index.html`
# instead of falling through to the 404→/index.html SPA error mapping.
#
# This is a one-time setup. Idempotent: re-running detects an existing
# function + association and exits cleanly.
#
# Why this matters: CloudFront's `DefaultRootObject` only handles the root,
# not subfolders. S3 (via OAC) does not auto-resolve `/en/` → `/en/index.html`
# the way an S3 website endpoint would, so without this rewrite, `/en/`
# returns 404 and the CustomErrorResponse silently rewrites it to the
# Chinese homepage — breaking the EN locale.
#
# Standard recipe, lifted from the AWS solutions library.

set -euo pipefail

if [[ ! -f /tmp/lbt-landing/state.env ]]; then
    echo "✗ /tmp/lbt-landing/state.env missing — run ./bootstrap.sh first" >&2
    exit 1
fi
# shellcheck disable=SC1091
source /tmp/lbt-landing/state.env

if [[ -z "${DIST_ID:-}" ]]; then
    echo "✗ DIST_ID not set in state.env" >&2
    exit 1
fi

FN_NAME="lbt-subdir-index"
FN_CODE_FILE=$(mktemp /tmp/lbt-fn-XXXXX.js)
trap 'rm -f "$FN_CODE_FILE"' EXIT

cat > "$FN_CODE_FILE" <<'JS'
function handler(event) {
  var req = event.request;
  var uri = req.uri;
  // /foo/  ->  /foo/index.html
  if (uri.endsWith('/')) {
    req.uri = uri + 'index.html';
  }
  // /foo  (no trailing slash, no extension)  ->  /foo/index.html
  // Pure-extension files (logo.png, app.css) are left alone.
  else if (uri.lastIndexOf('.') < uri.lastIndexOf('/')) {
    req.uri = uri + '/index.html';
  }
  return req;
}
JS

# ── 1. Create or update the function ────────────────────────────────────
echo "▸ Looking up function: $FN_NAME"
FN_ETAG=$(aws cloudfront describe-function \
    --name "$FN_NAME" \
    --profile "$AWS_PROFILE" \
    --query 'ETag' \
    --output text 2>/dev/null || echo "")

if [[ -z "$FN_ETAG" || "$FN_ETAG" == "None" ]]; then
    echo "▸ Creating function..."
    aws cloudfront create-function \
        --name "$FN_NAME" \
        --function-config Comment="Rewrite /foo/ → /foo/index.html",Runtime=cloudfront-js-2.0 \
        --function-code "fileb://$FN_CODE_FILE" \
        --profile "$AWS_PROFILE" \
        >/dev/null
    FN_ETAG=$(aws cloudfront describe-function \
        --name "$FN_NAME" --profile "$AWS_PROFILE" \
        --query 'ETag' --output text)
    echo "✓ Created (ETag $FN_ETAG)"
else
    echo "▸ Updating existing function code..."
    aws cloudfront update-function \
        --name "$FN_NAME" \
        --if-match "$FN_ETAG" \
        --function-config Comment="Rewrite /foo/ → /foo/index.html",Runtime=cloudfront-js-2.0 \
        --function-code "fileb://$FN_CODE_FILE" \
        --profile "$AWS_PROFILE" \
        >/dev/null
    FN_ETAG=$(aws cloudfront describe-function \
        --name "$FN_NAME" --profile "$AWS_PROFILE" \
        --query 'ETag' --output text)
    echo "✓ Updated (ETag $FN_ETAG)"
fi

# ── 2. Publish to LIVE ──────────────────────────────────────────────────
echo "▸ Publishing function..."
aws cloudfront publish-function \
    --name "$FN_NAME" \
    --if-match "$FN_ETAG" \
    --profile "$AWS_PROFILE" \
    >/dev/null
FN_ARN=$(aws cloudfront describe-function \
    --name "$FN_NAME" --stage LIVE --profile "$AWS_PROFILE" \
    --query 'FunctionSummary.FunctionMetadata.FunctionARN' --output text)
echo "✓ Published: $FN_ARN"

# ── 3. Attach to distribution if not already ────────────────────────────
echo "▸ Fetching distribution config..."
TMP_CFG=$(mktemp /tmp/lbt-distcfg-XXXXX.json)
trap 'rm -f "$TMP_CFG" "$FN_CODE_FILE"' EXIT
aws cloudfront get-distribution-config \
    --id "$DIST_ID" \
    --profile "$AWS_PROFILE" \
    --output json > "$TMP_CFG"

DIST_ETAG=$(python3 -c "import json,sys; d=json.load(open('$TMP_CFG')); print(d['ETag'])")
ATTACHED=$(python3 -c "
import json,sys
d = json.load(open('$TMP_CFG'))
fa = d['DistributionConfig']['DefaultCacheBehavior'].get('FunctionAssociations', {})
items = fa.get('Items', []) or []
print('yes' if any('$FN_NAME' in (it.get('FunctionARN','') or '') for it in items) else 'no')
")

if [[ "$ATTACHED" == "yes" ]]; then
    echo "✓ Function already attached to distribution — nothing to do"
    exit 0
fi

echo "▸ Attaching function to default cache behavior..."
python3 <<PY
import json
with open("$TMP_CFG") as f:
    full = json.load(f)
cfg = full["DistributionConfig"]
behavior = cfg["DefaultCacheBehavior"]
behavior["FunctionAssociations"] = {
    "Quantity": 1,
    "Items": [{"FunctionARN": "$FN_ARN", "EventType": "viewer-request"}],
}
with open("$TMP_CFG.body", "w") as f:
    json.dump(cfg, f)
PY

aws cloudfront update-distribution \
    --id "$DIST_ID" \
    --if-match "$DIST_ETAG" \
    --distribution-config "file://$TMP_CFG.body" \
    --profile "$AWS_PROFILE" \
    --query 'Distribution.{Id:Id,Status:Status}' \
    --output table

echo "✓ Distribution updated. CloudFront will redeploy in 1–3 minutes."
echo "  Re-run ./deploy.sh's invalidation step to flush the edge cache, or wait it out."
