# Lightsail Container Service Bootstrap — one-time AWS setup

End state after running this runbook:

- 2 Lightsail Container Services: `focustown-prod` (Small) + `focustown-dev` (Nano)
- 2 Lightsail Managed Databases: `focustown-pg-prod` + `focustown-pg-dev` (Postgres Standard 1GB, single-AZ, 7-day automated backup)
- 2 ECR repos: `focustown-backend`, `focustown-frontend` (shared across prod + dev, different image tags)
- 1 S3 bucket: `focustown-storage` with prefixes `/prod/` + `/dev/`
- 1 SES verified identity for `focustown.app`
- 1 IAM user `focustown-app` (SES SendEmail + S3 read/write on the bucket) — long-lived access key used by the app at runtime
- 1 IAM role `gha-focustown-deployer` assumed via GitHub OIDC for CI (ECR push + Lightsail deploy)
- 1 Route 53 hosted zone for `focustown.app` (apex + `dev.` subdomain)
- 1 CloudFront distribution fronting `focustown.app` (origin = LCS prod public endpoint)

**Estimated monthly cost: $64.**

Region: `ap-northeast-1` (Tokyo). All commands assume `aws` CLI v2 with admin credentials.
Substitute `<ACCOUNT_ID>` and `<GITHUB_REPO>` (e.g. `jiao/focustwon`) throughout.

---

## 1. ECR repos

```bash
aws ecr create-repository --repository-name focustown-backend \
    --region ap-northeast-1 --image-scanning-configuration scanOnPush=true \
    --image-tag-mutability MUTABLE

aws ecr create-repository --repository-name focustown-frontend \
    --region ap-northeast-1 --image-scanning-configuration scanOnPush=true \
    --image-tag-mutability MUTABLE
```

Attach repository policies that let the Lightsail Container Service principal pull
(LCS pulls from private ECR using its service-linked role since 2023):

```bash
for repo in focustown-backend focustown-frontend; do
  aws ecr set-repository-policy --repository-name "$repo" \
    --region ap-northeast-1 \
    --policy-text '{
      "Version": "2012-10-17",
      "Statement": [{
        "Sid": "AllowLightsailPull",
        "Effect": "Allow",
        "Principal": {"Service": "containerservices.lightsail.amazonaws.com"},
        "Action": ["ecr:BatchGetImage", "ecr:GetDownloadUrlForLayer"]
      }]
    }'
done
```

## 2. S3 storage bucket

```bash
aws s3api create-bucket --bucket focustown-storage \
    --region ap-northeast-1 \
    --create-bucket-configuration LocationConstraint=ap-northeast-1

aws s3api put-public-access-block --bucket focustown-storage \
    --public-access-block-configuration \
    BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true

aws s3api put-bucket-versioning --bucket focustown-storage \
    --versioning-configuration Status=Enabled
```

## 3. Managed Postgres (prod + dev)

```bash
# Prod — note master password is auto-generated; capture from output.
aws lightsail create-relational-database \
    --region ap-northeast-1 \
    --relational-database-name focustown-pg-prod \
    --master-database-name focustown \
    --master-username focustown \
    --relational-database-blueprint-id postgres_16 \
    --relational-database-bundle-id micro_2_0 \
    --no-publicly-accessible

# Dev
aws lightsail create-relational-database \
    --region ap-northeast-1 \
    --relational-database-name focustown-pg-dev \
    --master-database-name focustown \
    --master-username focustown \
    --relational-database-blueprint-id postgres_16 \
    --relational-database-bundle-id micro_2_0 \
    --no-publicly-accessible
```

Wait ~10 min for `state=available`, then capture endpoints + master passwords:

```bash
aws lightsail get-relational-database --region ap-northeast-1 \
    --relational-database-name focustown-pg-prod \
    --query 'relationalDatabase.{endpoint:masterEndpoint.address,port:masterEndpoint.port}'

aws lightsail get-relational-database-master-user-password --region ap-northeast-1 \
    --relational-database-name focustown-pg-prod \
    --password-version CURRENT --query 'masterUserPassword' --output text
```

Build the DATABASE_URL (used as a GitHub Actions secret later):

```
postgresql+asyncpg://focustown:<URL_ENCODED_PASSWORD>@<endpoint>:5432/focustown?ssl=require
```

## 4. SES identity

```bash
aws sesv2 create-email-identity --region ap-northeast-1 \
    --email-identity focustown.app

# Then add the DKIM CNAMEs that come back to Route 53 (step 9).
# Verify a noreply@ sender if needed:
aws sesv2 create-email-identity --region ap-northeast-1 \
    --email-identity noreply@focustown.app
```

Request production sending access (sandbox limit is 200 emails/day):
SES console → Account dashboard → Request production access.

## 5. IAM user for the running app (SES + S3)

```bash
aws iam create-user --user-name focustown-app

aws iam put-user-policy --user-name focustown-app --policy-name focustown-app-runtime \
    --policy-document '{
      "Version": "2012-10-17",
      "Statement": [
        {
          "Effect": "Allow",
          "Action": ["ses:SendEmail", "ses:SendRawEmail"],
          "Resource": "*"
        },
        {
          "Effect": "Allow",
          "Action": ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
          "Resource": "arn:aws:s3:::focustown-storage/*"
        },
        {
          "Effect": "Allow",
          "Action": ["s3:ListBucket"],
          "Resource": "arn:aws:s3:::focustown-storage"
        }
      ]
    }'

aws iam create-access-key --user-name focustown-app
# Save the AccessKeyId + SecretAccessKey for GitHub Actions secrets.
```

## 6. GitHub OIDC role for CI

One-time identity provider (only if not already present in this account):

```bash
aws iam create-open-id-connect-provider \
    --url https://token.actions.githubusercontent.com \
    --client-id-list sts.amazonaws.com \
    --thumbprint-list 6938fd4d98bab03faadb97b34396831e3780aea1
```

Trust + permission policy for the CI role:

```bash
cat > /tmp/gha-trust.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": {"Federated": "arn:aws:iam::<ACCOUNT_ID>:oidc-provider/token.actions.githubusercontent.com"},
    "Action": "sts:AssumeRoleWithWebIdentity",
    "Condition": {
      "StringEquals": {"token.actions.githubusercontent.com:aud": "sts.amazonaws.com"},
      "StringLike":   {"token.actions.githubusercontent.com:sub": "repo:<GITHUB_REPO>:*"}
    }
  }]
}
EOF

aws iam create-role --role-name gha-focustown-deployer \
    --assume-role-policy-document file:///tmp/gha-trust.json

aws iam put-role-policy --role-name gha-focustown-deployer \
    --policy-name gha-focustown-deployer-policy \
    --policy-document '{
      "Version": "2012-10-17",
      "Statement": [
        {
          "Effect": "Allow",
          "Action": ["ecr:GetAuthorizationToken"],
          "Resource": "*"
        },
        {
          "Effect": "Allow",
          "Action": [
            "ecr:BatchCheckLayerAvailability",
            "ecr:CompleteLayerUpload",
            "ecr:InitiateLayerUpload",
            "ecr:PutImage",
            "ecr:UploadLayerPart",
            "ecr:BatchGetImage",
            "ecr:GetDownloadUrlForLayer"
          ],
          "Resource": [
            "arn:aws:ecr:ap-northeast-1:<ACCOUNT_ID>:repository/focustown-backend",
            "arn:aws:ecr:ap-northeast-1:<ACCOUNT_ID>:repository/focustown-frontend"
          ]
        },
        {
          "Effect": "Allow",
          "Action": [
            "lightsail:CreateContainerServiceDeployment",
            "lightsail:GetContainerServices",
            "lightsail:GetContainerServiceDeployments",
            "lightsail:GetContainerImages"
          ],
          "Resource": "*"
        }
      ]
    }'
```

## 7. Lightsail Container Services

```bash
aws lightsail create-container-service --region ap-northeast-1 \
    --service-name focustown-prod --power small --scale 1

aws lightsail create-container-service --region ap-northeast-1 \
    --service-name focustown-dev --power nano --scale 1
```

Wait ~5 min for `state=READY`. Take note of the public domain Lightsail assigns
(`https://focustown-prod.<random>.<region>.cs.amazonlightsail.com`); the first
real deployment from CI will attach the custom domain.

## 8. Custom domain attachment

After at least one deployment succeeds, attach the apex + dev subdomain:

```bash
aws lightsail create-certificate --region ap-northeast-1 \
    --certificate-name focustown-app-cert --domain-name focustown.app

aws lightsail create-certificate --region ap-northeast-1 \
    --certificate-name focustown-app-dev-cert --domain-name dev.focustown.app

# After validating each cert via Route 53 DNS (step 9):
aws lightsail update-container-service --region ap-northeast-1 \
    --service-name focustown-prod \
    --public-domain-names '{"focustown-app-cert":["focustown.app"]}'

aws lightsail update-container-service --region ap-northeast-1 \
    --service-name focustown-dev \
    --public-domain-names '{"focustown-app-dev-cert":["dev.focustown.app"]}'
```

## 9. Route 53 hosted zone

```bash
aws route53 create-hosted-zone --name focustown.app \
    --caller-reference "$(date -u +%s)"
# Capture the NS records and update them at your domain registrar.

# Add:
#   - DKIM CNAMEs from step 4
#   - ACM validation CNAMEs from step 8
#   - apex A/AAAA record → CloudFront distribution (step 10), via ALIAS
#   - dev.focustown.app CNAME → focustown-dev.<random>.<region>.cs.amazonlightsail.com
```

## 10. CloudFront in front of prod

```bash
# Distribution config (skeleton — fill in IDs after step 7 + step 8):
#   - Origin: focustown-prod.<random>.<region>.cs.amazonlightsail.com (HTTPS only)
#   - Alternate domain name: focustown.app
#   - ACM certificate: us-east-1 cert for focustown.app (separate from LCS cert)
#   - Allowed methods: GET, HEAD, OPTIONS, PUT, POST, PATCH, DELETE
#   - Cache policy: managed CachingOptimized for /static/*; CachingDisabled for /api/* + /ws
#   - Origin request policy: managed AllViewer
#   - Behaviors: /api/* + /api/v1/ws/* → no cache; everything else → cached
```

Dev does NOT get a CloudFront distribution to save cost; it talks straight to
the Lightsail Container Service public endpoint.

## 11. GitHub Actions secrets + variables to populate

In repo settings → Secrets and variables → Actions:

**Repository variables (non-secret):**
| Name | Example | Notes |
|---|---|---|
| `AWS_REGION` | `ap-northeast-1` | |
| `AWS_ACCOUNT_ID` | `123456789012` | |
| `ECR_REGISTRY` | `123456789012.dkr.ecr.ap-northeast-1.amazonaws.com` | |
| `PROD_PUBLIC_HOST` | `focustown.app` | |
| `DEV_PUBLIC_HOST` | `dev.focustown.app` | |
| `SES_FROM_EMAIL` | `noreply@focustown.app` | |
| `S3_BUCKET` | `focustown-storage` | |
| `TERMS_CURRENT_VERSION` | `2026-05-14` | Matches `frontend/lib/config/legal.ts` |

**Repository secrets (sensitive):**
| Name | Source |
|---|---|
| `AWS_DEPLOY_ROLE_ARN` | `arn:aws:iam::<ACCOUNT_ID>:role/gha-focustown-deployer` |
| `PROD_DATABASE_URL` | postgresql+asyncpg URL from step 3 (prod) |
| `DEV_DATABASE_URL` | postgresql+asyncpg URL from step 3 (dev) |
| `PROD_APP_SECRET_KEY` | `openssl rand -base64 48` |
| `DEV_APP_SECRET_KEY` | `openssl rand -base64 48` |
| `AWS_APP_ACCESS_KEY_ID` | from step 5 |
| `AWS_APP_SECRET_ACCESS_KEY` | from step 5 |

**GitHub Environments** (Settings → Environments):
- `production`: require manual approval; add the secrets prefixed `PROD_*` here only
- `dev`: no approval; add the secrets prefixed `DEV_*` here only

## 12. First migration (one-shot from your laptop)

After the prod LCS has run once successfully, run alembic against the Managed PG
endpoint from your laptop (which has temporarily added its public IP to the
Lightsail DB allowlist):

```bash
aws lightsail update-relational-database --region ap-northeast-1 \
    --relational-database-name focustown-pg-prod \
    --publicly-accessible

cd backend
DATABASE_URL='<PROD_DATABASE_URL>' alembic upgrade head

# Lock it back down:
aws lightsail update-relational-database --region ap-northeast-1 \
    --relational-database-name focustown-pg-prod \
    --no-publicly-accessible
```

(Later iterations: the CI workflow runs `alembic upgrade head` inside a one-shot
backend container before swapping in the new deployment.)

---

## Cost ledger (verify after 1 month in Cost Explorer, tagged app=focustown)

| Line item | Monthly |
|---|---|
| Lightsail Container Service (Small, 1 node) | $20 |
| Lightsail Container Service (Nano, 1 node) | $7 |
| Lightsail Managed Database — Standard 1GB (prod) | $15 |
| Lightsail Managed Database — Standard 1GB (dev) | $15 |
| ECR storage (~1GB) | $0.10 |
| S3 storage + requests | $1 |
| CloudFront (50 users × few MB/day) | $3 |
| CloudWatch Logs (LCS stdout, 7-day retention) | $2 |
| Route 53 hosted zone + queries | $0.60 |
| SES (password reset only) | $0.10 |
| Data transfer (within free tier mostly) | $0–2 |
| **Total** | **~$64** |

Set a budget alarm at $80 (covers normal variance + cushion before $70 ceiling is breached).
