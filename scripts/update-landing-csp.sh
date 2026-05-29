#!/usr/bin/env bash
# Update the landing CloudFront Content-Security-Policy so the feedback
# fetch and Google Fonts are allowed. Mirrors the CSP in
# infra/landing/create-distribution.sh. Run with the "lowbatterytown"
# AWS profile (account 417609991573):
#   bash scripts/update-landing-csp.sh
#
# Changes vs the previous CSP:
#   connect-src  += https://dev.lowbatterytown.com   (temporary bridge)
#   style-src    += https://fonts.googleapis.com
#   font-src      = 'self' https://fonts.gstatic.com (new directive)
# No CloudFront invalidation needed — response-headers policies apply at
# response time, not baked into cached objects.

set -euo pipefail

PROFILE=lowbatterytown
RHP=16c899c7-2850-4f44-aaf0-98c0ca7e932d
DIST_ID=E2R207MGUWH34U

cd "$(dirname "${BASH_SOURCE[0]}")/.."
TMP=".lbt-csp-tmp"; mkdir -p "$TMP"; trap 'rm -rf "$TMP"' EXIT
AWS="aws --profile $PROFILE"

echo "▸ Fetching current response-headers policy…"
$AWS cloudfront get-response-headers-policy --id "$RHP" > "$TMP/rhp.json"
ETAG=$(python3 -c "import json;print(json.load(open('$TMP/rhp.json'))['ETag'])")

python3 - "$TMP/rhp.json" "$TMP/config.json" <<'PY'
import json, sys
d = json.load(open(sys.argv[1]))
cfg = d["ResponseHeadersPolicy"]["ResponseHeadersPolicyConfig"]
new = ("default-src 'self'; img-src 'self' data:; "
       "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
       "font-src 'self' https://fonts.gstatic.com; "
       "script-src 'self' 'unsafe-inline'; "
       "connect-src 'self' https://lowbatterytown.com https://dev.lowbatterytown.com; "
       "frame-ancestors 'none'; base-uri 'self'; form-action 'self' https://lowbatterytown.com")
cfg["SecurityHeadersConfig"]["ContentSecurityPolicy"]["ContentSecurityPolicy"] = new
json.dump(cfg, open(sys.argv[2], "w"), indent=2)
print("  new CSP set (connect-src includes dev; fonts allowed).")
PY

echo "▸ Updating policy (ETag $ETAG)…"
$AWS cloudfront update-response-headers-policy --id "$RHP" --if-match "$ETAG" \
  --response-headers-policy-config "file://$TMP/config.json" \
  --query 'ResponseHeadersPolicy.ResponseHeadersPolicyConfig.SecurityHeadersConfig.ContentSecurityPolicy.ContentSecurityPolicy' --output text

echo "▸ Verifying live CSP header…"
sleep 3
curl -sI "https://www.lowbatterytown.com/" | grep -i "content-security-policy" | grep -o "connect-src[^;]*" || true
echo "✓ Done. Hard-refresh www.lowbatterytown.com and submit feedback; it should reach focustown1314@gmail.com."
