# Landing page — `www.lowbatterytown.com`

Static marketing site sourced from `../../landing/`. Hosted on **AWS S3 +
CloudFront**. DNS for `lowbatterytown.com` stays on Cloudflare; only the
`www` record points at CloudFront. The page has no public email
addresses — all contact flows through an inline form that POSTs to
`https://lowbatterytown.com/api/v1/feedback` (the same anonymous-allowed
endpoint the in-app `FeedbackView` uses).

## Architecture

```
   visitor
     │
     ▼ https://www.lowbatterytown.com
                                                    POST /api/v1/feedback
   ┌────────────────────────┐                ┌────────────────────────────┐
   │ CloudFront (PriceClass │                │ Lightsail prod backend     │
   │   100, us-east-1 ACM)  │                │ lowbatterytown.com         │
   │                        │  origin (OAC)  │ FastAPI feedback router    │
   │  cache: 60s HTML       │ ───────────┐   │ (anon: 10 / hr / IP)       │
   └────────────────────────┘            │   └────────────────────────────┘
                                         ▼
                              ┌──────────────────────┐
                              │ S3 lowbatterytown-   │
                              │  landing-prod        │
                              │ (private, OAC-only)  │
                              │ region: us-east-1    │
                              └──────────────────────┘
```

Why this stack:

- **S3 + CloudFront**: ~$0.50–2/mo for a low-traffic landing. Bandwidth
  S3 → CloudFront is free; only outbound to viewers costs (≈$0.085/GB).
- **CloudFront cert in us-east-1**: ACM requirement, not negotiable. The
  bucket also sits in us-east-1 so the OAC path is single-region.
- **OAC (Origin Access Control)**: signs CloudFront → S3 requests with
  SigV4. The bucket stays fully private (no public-read, no static-site
  hosting); only this exact distribution can read it.
- **Cloudflare DNS, grey cloud**: `www.lowbatterytown.com` is a CNAME to
  the CloudFront domain. We do not proxy through Cloudflare (orange
  cloud) because CloudFront already terminates TLS with the ACM cert.
- **Custom error responses 403/404 → /index.html**: defensive — the
  current site is single-page, so any unknown path returns the landing.

## Three scripts, three phases

| Script                     | When to run                       | What it does                                      |
|----------------------------|-----------------------------------|---------------------------------------------------|
| `bootstrap.sh`             | **Once**, before everything       | S3 bucket + public-access-block + ACM cert        |
| `create-distribution.sh`   | **Once**, after cert is ISSUED    | OAC + response-headers policy + CF distribution   |
| `deploy.sh`                | **Every time** you edit `landing/` | `s3 sync` + CloudFront invalidation               |

Between bootstrap and create-distribution you must add the **DNS
validation CNAME** to Cloudflare (printed by bootstrap.sh). The cert
typically issues within 1–5 min after the DNS record propagates.

## First-time setup

```sh
# Requires: AWS CLI v2 + ~/.aws/credentials [lowbatterytown]
export AWS_PROFILE=lowbatterytown

# 1. S3 + ACM
./bootstrap.sh
# → prints a CNAME record for cert validation. Add it to Cloudflare
#   (grey cloud, "DNS only") and wait for ACM to validate.

# Optional: poll until cert is ISSUED
watch -n 30 'aws acm describe-certificate \
    --certificate-arn $(grep CERT_ARN /tmp/lbt-landing/state.env | cut -d= -f2) \
    --region us-east-1 --profile lowbatterytown \
    --query Certificate.Status --output text'

# 2. CloudFront distribution
./create-distribution.sh
# → prints the CloudFront domain (dxxx.cloudfront.net).
#   Add CNAME www → that domain in Cloudflare (grey cloud).

# 3. Upload
./deploy.sh
```

## Backend CORS prerequisite

The landing's feedback form is cross-origin
(`www.lowbatterytown.com` → `lowbatterytown.com`). The backend's
`APP_CORS_ORIGINS` already lists `https://www.lowbatterytown.com` after
the change to `infra/lightsail/prod/containers.json.tpl`. **Redeploy
prod backend before the landing goes live**, otherwise the feedback
submission will be blocked by CORS.

Smoke test after backend redeploy:

```sh
curl -s -I -X OPTIONS https://lowbatterytown.com/api/v1/feedback \
  -H 'Origin: https://www.lowbatterytown.com' \
  -H 'Access-Control-Request-Method: POST' \
  -H 'Access-Control-Request-Headers: content-type' \
| grep -i access-control-allow-origin
# expect: access-control-allow-origin: https://www.lowbatterytown.com
```

## Routine deploys

```sh
cd infra/landing
./deploy.sh
```

The script:

- Loads bucket + distribution IDs from `/tmp/lbt-landing/state.env`.
- Greps for any email-address pattern in `landing/` and fails the deploy
  if one is found — product rule is "no public emails, form only".
- `aws s3 sync --delete` with content-type and cache-control tuned per
  asset class (HTML 60s, SVG 1d, others 1h).
- Creates a CloudFront `/*` invalidation so the edge picks up changes
  within ~1 minute.

## Rollback

S3 versioning is enabled on the bucket. To revert a bad deploy:

```sh
# Find prior versions of index.html
aws s3api list-object-versions \
    --bucket lowbatterytown-landing-prod \
    --prefix index.html \
    --profile lowbatterytown \
    --query 'Versions[].{VersionId:VersionId,LastModified:LastModified,IsLatest:IsLatest}'

# Copy a prior version back into place
aws s3api copy-object \
    --bucket lowbatterytown-landing-prod \
    --copy-source "lowbatterytown-landing-prod/index.html?versionId=<OLD_VERSION_ID>" \
    --key index.html \
    --profile lowbatterytown

# Invalidate
aws cloudfront create-invalidation \
    --distribution-id $(grep DIST_ID /tmp/lbt-landing/state.env | cut -d= -f2) \
    --paths "/*" \
    --profile lowbatterytown
```

## Files in `../../landing/`

- `index.html` — single-page marketing site. Authored directly; no
  build step.
- `favicon.svg` — inline SVG icon.
- `robots.txt`, `sitemap.xml` — SEO defaults.

Security headers (CSP, X-Frame-Options, HSTS, Permissions-Policy) are
served by CloudFront's response-headers policy, not by per-file rules.
See `create-distribution.sh` for the policy definition. The CSP's
`connect-src` whitelists `https://lowbatterytown.com` so the feedback
form's `fetch()` is allowed.

## Cost (estimate, low-traffic launch)

- S3 storage:        $0.023/GB × <1 MB                ≈ $0.00
- S3 requests:       $0.0004/1k GET                   ≈ $0.00
- CloudFront data:   $0.085/GB × ~few MB/mo           ≈ $0.05
- CloudFront req:    $0.0075/10k × few k/mo           ≈ $0.01
- ACM cert:                                              $0.00
- ──────────────────────────────────────────────────────────
- Total:                                              ~ $0.10–1/mo

PriceClass_100 (NA + EU only) keeps the per-GB rate at the cheap tier.
Asia-Pacific viewers route to those edges with a small latency cost
(~50–100ms more) but identical content.
