#!/usr/bin/env bash
# One-time AWS bootstrap for the www.lowbatterytown.com static landing page.
#
# Creates:
#   - S3 bucket `lowbatterytown-landing-prod` (us-east-1, private, OAC-only)
#   - Public access block (defence-in-depth)
#   - ACM cert for www.lowbatterytown.com in us-east-1 (CloudFront requires
#     certs in us-east-1 regardless of bucket region)
#
# Idempotent: re-running checks for existing resources and skips creation.
#
# After this script:
#   1. Add the DNS validation CNAME printed at the bottom to Cloudflare
#   2. Wait until cert status flips to ISSUED (1–5 min after DNS propagates)
#   3. Run ./create-distribution.sh

set -euo pipefail

AWS_PROFILE="${AWS_PROFILE:-lowbatterytown}"
BUCKET="${BUCKET:-lowbatterytown-landing-prod}"
DOMAIN="${DOMAIN:-www.lowbatterytown.com}"
# CloudFront requires certs in us-east-1 regardless of bucket region. Pinning
# the bucket to us-east-1 too keeps the OAC path simple (no cross-region
# routing) — bandwidth between S3 and CloudFront is free anyway.
REGION="us-east-1"

echo "▸ Profile: $AWS_PROFILE"
echo "▸ Bucket:  s3://$BUCKET (region $REGION)"
echo "▸ Domain:  $DOMAIN"
echo ""

# --- S3 bucket --------------------------------------------------------------

if aws s3api head-bucket --bucket "$BUCKET" --profile "$AWS_PROFILE" 2>/dev/null; then
    echo "✓ S3 bucket already exists"
else
    echo "▸ Creating S3 bucket..."
    aws s3api create-bucket \
        --bucket "$BUCKET" \
        --region "$REGION" \
        --profile "$AWS_PROFILE" \
        --object-ownership BucketOwnerEnforced
    echo "✓ Bucket created"
fi

echo "▸ Locking down public access..."
aws s3api put-public-access-block \
    --bucket "$BUCKET" \
    --public-access-block-configuration \
        BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true \
    --profile "$AWS_PROFILE"

# CloudFront's OAC bucket policy is added by create-distribution.sh after
# we know the distribution ARN. Until then the bucket is fully private.

echo "▸ Enabling versioning (cheap rollback)..."
aws s3api put-bucket-versioning \
    --bucket "$BUCKET" \
    --versioning-configuration Status=Enabled \
    --profile "$AWS_PROFILE"

# --- ACM cert (us-east-1) ---------------------------------------------------

echo ""
echo "▸ Looking up existing ACM cert for $DOMAIN in us-east-1..."
CERT_ARN=$(aws acm list-certificates \
    --region us-east-1 \
    --profile "$AWS_PROFILE" \
    --query "CertificateSummaryList[?DomainName=='$DOMAIN'].CertificateArn" \
    --output text)

if [[ -z "$CERT_ARN" ]]; then
    echo "▸ Requesting new cert..."
    CERT_ARN=$(aws acm request-certificate \
        --domain-name "$DOMAIN" \
        --validation-method DNS \
        --region us-east-1 \
        --profile "$AWS_PROFILE" \
        --query CertificateArn \
        --output text)
    echo "✓ Cert requested: $CERT_ARN"
    # ACM populates the DNS validation record asynchronously. Poll up to ~30s.
    for _ in 1 2 3 4 5 6; do
        sleep 5
        if aws acm describe-certificate \
            --certificate-arn "$CERT_ARN" \
            --region us-east-1 \
            --profile "$AWS_PROFILE" \
            --query 'Certificate.DomainValidationOptions[0].ResourceRecord.Name' \
            --output text 2>/dev/null | grep -q '\.'; then
            break
        fi
    done
else
    echo "✓ Cert already exists: $CERT_ARN"
fi

# --- Output validation records ---------------------------------------------

echo ""
echo "═══════════════════════════════════════════════════════════════════"
echo "  Save the following to /tmp/lbt-landing/state.env:"
echo "═══════════════════════════════════════════════════════════════════"
mkdir -p /tmp/lbt-landing
{
    echo "export BUCKET=$BUCKET"
    echo "export DOMAIN=$DOMAIN"
    echo "export REGION=$REGION"
    echo "export CERT_ARN=$CERT_ARN"
    echo "export AWS_PROFILE=$AWS_PROFILE"
} | tee /tmp/lbt-landing/state.env

echo ""
echo "═══════════════════════════════════════════════════════════════════"
echo "  DNS records to add in Cloudflare (zone: lowbatterytown.com)"
echo "═══════════════════════════════════════════════════════════════════"
echo ""

CERT_DESC=$(aws acm describe-certificate \
    --certificate-arn "$CERT_ARN" \
    --region us-east-1 \
    --profile "$AWS_PROFILE" \
    --output json)

VAL_NAME=$(echo "$CERT_DESC" | grep -m1 '"Name":' | sed 's/.*"Name": *"\([^"]*\)".*/\1/')
VAL_VALUE=$(echo "$CERT_DESC" | grep -m1 '"Value":' | sed 's/.*"Value": *"\([^"]*\)".*/\1/')
CERT_STATUS=$(echo "$CERT_DESC" | grep -m1 '"Status":' | sed 's/.*"Status": *"\([^"]*\)".*/\1/')

echo "  ── Certificate validation (ADD THIS NOW) ──"
echo "    Type:    CNAME"
echo "    Name:    $VAL_NAME"
echo "    Value:   $VAL_VALUE"
echo "    Proxy:   DNS only (grey cloud)"
echo "    TTL:     auto"
echo ""
echo "  Current cert status: $CERT_STATUS"
echo ""
echo "  Once status = ISSUED, run: ./create-distribution.sh"
