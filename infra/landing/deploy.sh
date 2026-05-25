#!/usr/bin/env bash
# Sync the landing files to S3 and invalidate the CloudFront cache.
#
# Run this:
#   - After ./bootstrap.sh + ./create-distribution.sh (first-time setup)
#   - Every time you edit something under ../../landing/

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LANDING_DIR="$(cd "$SCRIPT_DIR/../../landing" && pwd)"

if [[ ! -f /tmp/lbt-landing/state.env ]]; then
    echo "✗ /tmp/lbt-landing/state.env missing — run ./bootstrap.sh first" >&2
    exit 1
fi
# shellcheck disable=SC1091
source /tmp/lbt-landing/state.env

if [[ ! -f "$LANDING_DIR/index.html" ]]; then
    echo "✗ $LANDING_DIR/index.html missing — nothing to deploy" >&2
    exit 1
fi

# Product rule: no public email addresses on marketing surfaces — contact is
# form-only. Legal pages legitimately need a support contact (per LEGAL config),
# so the guard scopes to non-legal HTML/text and skips the legal/ trees in both
# locales.
if grep -RIE \
    --exclude-dir=legal --exclude-dir=en \
    '[a-z0-9._-]+@[a-z0-9.-]+\.[a-z]{2,}' "$LANDING_DIR" >/dev/null; then
    echo "✗ Found an email address in $LANDING_DIR (outside legal/) — marketing surfaces must contact-via-form only:" >&2
    grep -RIEn \
        --exclude-dir=legal --exclude-dir=en \
        '[a-z0-9._-]+@[a-z0-9.-]+\.[a-z]{2,}' "$LANDING_DIR" >&2 || true
    exit 1
fi
# The /en/ tree is allowed for the same reason — it mirrors legal/ plus the
# English marketing copy. Re-apply the guard to /en/ but skip /en/legal/ too.
if [[ -d "$LANDING_DIR/en" ]]; then
    if grep -RIE \
        --exclude-dir=legal \
        '[a-z0-9._-]+@[a-z0-9.-]+\.[a-z]{2,}' "$LANDING_DIR/en" >/dev/null; then
        echo "✗ Found an email address in $LANDING_DIR/en (outside legal/) — marketing surfaces must contact-via-form only:" >&2
        grep -RIEn \
            --exclude-dir=legal \
            '[a-z0-9._-]+@[a-z0-9.-]+\.[a-z]{2,}' "$LANDING_DIR/en" >&2 || true
        exit 1
    fi
fi

echo "▸ Syncing to s3://$BUCKET..."

# HTML: short cache + must-revalidate so deploys are visible without
# users hard-refreshing. The CloudFront invalidation below covers the
# edge cache; this header covers viewer caches.
aws s3 sync "$LANDING_DIR" "s3://$BUCKET" \
    --profile "$AWS_PROFILE" \
    --delete \
    --exclude "*" \
    --include "*.html" \
    --cache-control "public, max-age=60, must-revalidate" \
    --content-type "text/html; charset=utf-8"

# SVG: 1-day cache (favicon rarely changes; CF invalidation will bust on deploy)
aws s3 sync "$LANDING_DIR" "s3://$BUCKET" \
    --profile "$AWS_PROFILE" \
    --delete \
    --exclude "*" \
    --include "*.svg" \
    --cache-control "public, max-age=86400" \
    --content-type "image/svg+xml"

# Everything else (xml, txt) — short cache
aws s3 sync "$LANDING_DIR" "s3://$BUCKET" \
    --profile "$AWS_PROFILE" \
    --delete \
    --exclude "*.html" \
    --exclude "*.svg" \
    --cache-control "public, max-age=3600"

echo "✓ S3 sync complete"

if [[ -n "${DIST_ID:-}" ]]; then
    echo "▸ Invalidating CloudFront cache..."
    aws cloudfront create-invalidation \
        --distribution-id "$DIST_ID" \
        --paths "/*" \
        --profile "$AWS_PROFILE" \
        --query 'Invalidation.{Id:Id, Status:Status}' \
        --output table
    echo "✓ Invalidation created"
else
    echo "ℹ DIST_ID not in state.env — skipping invalidation"
    echo "  (Run ./create-distribution.sh, then re-run this script.)"
fi
