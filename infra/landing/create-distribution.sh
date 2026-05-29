#!/usr/bin/env bash
# Create the CloudFront distribution for the landing page.
#
# Prerequisites:
#   - ./bootstrap.sh has run (S3 bucket + ACM cert exist)
#   - Cert status = ISSUED (i.e. you added the validation CNAME and ACM
#     successfully verified domain ownership)
#
# After this script:
#   1. Update Cloudflare DNS: CNAME www.lowbatterytown.com → <CF domain> (printed)
#   2. Wait ~5 min for the distribution to deploy globally
#   3. Run ./deploy.sh to upload the landing files

set -euo pipefail

# shellcheck disable=SC1091
source /tmp/lbt-landing/state.env

echo "▸ Bucket:  $BUCKET"
echo "▸ Cert:    $CERT_ARN"

# Block until the cert is actually issued — CloudFront will reject the
# distribution creation otherwise with an opaque error.
CERT_STATUS=$(aws acm describe-certificate \
    --certificate-arn "$CERT_ARN" \
    --region us-east-1 \
    --profile "$AWS_PROFILE" \
    --query 'Certificate.Status' \
    --output text)

if [[ "$CERT_STATUS" != "ISSUED" ]]; then
    echo "✗ Cert status is $CERT_STATUS — not ISSUED yet." >&2
    echo "  Add the DNS validation CNAME printed by bootstrap.sh and retry." >&2
    exit 1
fi
echo "✓ Cert is ISSUED"

# --- Origin Access Control (OAC) ──────────────────────────────────────────
# OAC is the modern replacement for OAI; signs CloudFront → S3 requests so
# the bucket can stay fully private. One OAC per CF distribution is fine,
# but we name + look up so re-runs are idempotent.

OAC_NAME="lowbatterytown-landing-oac"
OAC_ID=$(aws cloudfront list-origin-access-controls \
    --profile "$AWS_PROFILE" \
    --query "OriginAccessControlList.Items[?Name=='$OAC_NAME'].Id" \
    --output text 2>/dev/null || echo "")

if [[ -z "$OAC_ID" || "$OAC_ID" == "None" ]]; then
    echo "▸ Creating Origin Access Control..."
    OAC_ID=$(aws cloudfront create-origin-access-control \
        --origin-access-control-config "Name=$OAC_NAME,SigningProtocol=sigv4,SigningBehavior=always,OriginAccessControlOriginType=s3" \
        --profile "$AWS_PROFILE" \
        --query 'OriginAccessControl.Id' \
        --output text)
    echo "✓ OAC: $OAC_ID"
else
    echo "✓ OAC already exists: $OAC_ID"
fi

# --- Response headers policy ──────────────────────────────────────────────
# Mirrors the security headers that Caddy adds for the app at the apex.

RHP_NAME="lowbatterytown-landing-headers"
RHP_ID=$(aws cloudfront list-response-headers-policies \
    --profile "$AWS_PROFILE" \
    --query "ResponseHeadersPolicyList.Items[?ResponseHeadersPolicy.ResponseHeadersPolicyConfig.Name=='$RHP_NAME'].ResponseHeadersPolicy.Id" \
    --output text 2>/dev/null || echo "")

if [[ -z "$RHP_ID" || "$RHP_ID" == "None" ]]; then
    echo "▸ Creating response headers policy..."
    RHP_ID=$(aws cloudfront create-response-headers-policy \
        --response-headers-policy-config "$(cat <<JSON
{
  "Name": "$RHP_NAME",
  "Comment": "Security headers for the landing page",
  "SecurityHeadersConfig": {
    "XSSProtection": { "Override": true, "Protection": true, "ModeBlock": true },
    "FrameOptions": { "Override": true, "FrameOption": "DENY" },
    "ReferrerPolicy": { "Override": true, "ReferrerPolicy": "strict-origin-when-cross-origin" },
    "ContentTypeOptions": { "Override": true },
    "StrictTransportSecurity": {
      "Override": true,
      "IncludeSubdomains": true,
      "Preload": true,
      "AccessControlMaxAgeSec": 31536000
    },
    "ContentSecurityPolicy": {
      "Override": true,
      "ContentSecurityPolicy": "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; script-src 'self' 'unsafe-inline'; connect-src 'self' https://lowbatterytown.com https://dev.lowbatterytown.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self' https://lowbatterytown.com"
    }
  },
  "CustomHeadersConfig": {
    "Quantity": 1,
    "Items": [
      { "Header": "Permissions-Policy", "Value": "camera=(), microphone=(), geolocation=(), interest-cohort=()", "Override": true }
    ]
  }
}
JSON
        )" \
        --profile "$AWS_PROFILE" \
        --query 'ResponseHeadersPolicy.Id' \
        --output text)
    echo "✓ Response headers policy: $RHP_ID"
else
    echo "✓ Response headers policy exists: $RHP_ID"
fi

# --- CloudFront distribution ──────────────────────────────────────────────

# Idempotency: look up by Aliases (the custom domain is unique per dist).
DIST_ID=$(aws cloudfront list-distributions \
    --profile "$AWS_PROFILE" \
    --query "DistributionList.Items[?Aliases.Items != null && contains(Aliases.Items, '$DOMAIN')].Id | [0]" \
    --output text 2>/dev/null || echo "")

if [[ "$DIST_ID" == "None" || -z "$DIST_ID" ]]; then
    echo "▸ Creating CloudFront distribution..."

    # CallerReference must be unique per request — timestamp suffices.
    CALLER_REF="lbt-landing-$(date +%s)"

    DIST_CONFIG=$(cat <<JSON
{
  "CallerReference": "$CALLER_REF",
  "Comment": "Static landing page www.lowbatterytown.com",
  "Aliases": { "Quantity": 1, "Items": ["$DOMAIN"] },
  "DefaultRootObject": "index.html",
  "Origins": {
    "Quantity": 1,
    "Items": [{
      "Id": "s3-origin",
      "DomainName": "${BUCKET}.s3.${REGION}.amazonaws.com",
      "OriginAccessControlId": "$OAC_ID",
      "S3OriginConfig": { "OriginAccessIdentity": "" },
      "ConnectionAttempts": 3,
      "ConnectionTimeout": 10
    }]
  },
  "DefaultCacheBehavior": {
    "TargetOriginId": "s3-origin",
    "ViewerProtocolPolicy": "redirect-to-https",
    "AllowedMethods": { "Quantity": 2, "Items": ["GET", "HEAD"], "CachedMethods": { "Quantity": 2, "Items": ["GET", "HEAD"] } },
    "Compress": true,
    "CachePolicyId": "658327ea-f89d-4fab-a63d-7e88639e58f6",
    "ResponseHeadersPolicyId": "$RHP_ID"
  },
  "CustomErrorResponses": {
    "Quantity": 2,
    "Items": [
      { "ErrorCode": 403, "ResponsePagePath": "/index.html", "ResponseCode": "200", "ErrorCachingMinTTL": 60 },
      { "ErrorCode": 404, "ResponsePagePath": "/index.html", "ResponseCode": "200", "ErrorCachingMinTTL": 60 }
    ]
  },
  "ViewerCertificate": {
    "ACMCertificateArn": "$CERT_ARN",
    "SSLSupportMethod": "sni-only",
    "MinimumProtocolVersion": "TLSv1.2_2021",
    "Certificate": "$CERT_ARN",
    "CertificateSource": "acm"
  },
  "PriceClass": "PriceClass_100",
  "Enabled": true,
  "HttpVersion": "http2and3",
  "IsIPV6Enabled": true
}
JSON
)
    DIST_JSON=$(aws cloudfront create-distribution \
        --distribution-config "$DIST_CONFIG" \
        --profile "$AWS_PROFILE")
    DIST_ID=$(echo "$DIST_JSON" | grep -m1 '"Id":' | sed 's/.*"Id": *"\([^"]*\)".*/\1/')
    echo "✓ Distribution created: $DIST_ID"
else
    echo "✓ Distribution already exists: $DIST_ID"
fi

DIST_DOMAIN=$(aws cloudfront get-distribution \
    --id "$DIST_ID" \
    --profile "$AWS_PROFILE" \
    --query 'Distribution.DomainName' \
    --output text)

ACCOUNT_ID=$(aws sts get-caller-identity --profile "$AWS_PROFILE" --query Account --output text)

# --- Bucket policy: allow this exact distribution to GetObject ─────────────
echo "▸ Granting OAC read access on the bucket..."
BUCKET_POLICY=$(cat <<JSON
{
  "Version": "2012-10-17",
  "Statement": [{
    "Sid": "AllowCloudFrontServicePrincipal",
    "Effect": "Allow",
    "Principal": { "Service": "cloudfront.amazonaws.com" },
    "Action": "s3:GetObject",
    "Resource": "arn:aws:s3:::${BUCKET}/*",
    "Condition": {
      "StringEquals": {
        "AWS:SourceArn": "arn:aws:cloudfront::${ACCOUNT_ID}:distribution/${DIST_ID}"
      }
    }
  }]
}
JSON
)
aws s3api put-bucket-policy \
    --bucket "$BUCKET" \
    --policy "$BUCKET_POLICY" \
    --profile "$AWS_PROFILE"
echo "✓ Bucket policy applied"

# Persist the IDs so deploy.sh can invalidate the right distribution.
{
    echo "export DIST_ID=$DIST_ID"
    echo "export DIST_DOMAIN=$DIST_DOMAIN"
    echo "export OAC_ID=$OAC_ID"
    echo "export RHP_ID=$RHP_ID"
} >> /tmp/lbt-landing/state.env

echo ""
echo "═══════════════════════════════════════════════════════════════════"
echo "  Distribution ready"
echo "═══════════════════════════════════════════════════════════════════"
echo "  ID:     $DIST_ID"
echo "  Domain: $DIST_DOMAIN"
echo ""
echo "  ── Final DNS record to add in Cloudflare ──"
echo "    Type:    CNAME"
echo "    Name:    www"
echo "    Value:   $DIST_DOMAIN"
echo "    Proxy:   DNS only (grey cloud — CloudFront already terminates TLS)"
echo "    TTL:     auto"
echo ""
echo "  CloudFront takes ~5 minutes to deploy globally. After DNS + propagation:"
echo "  curl -fsS https://$DOMAIN/ | head"
echo ""
echo "  Then run ./deploy.sh to upload the landing files."
