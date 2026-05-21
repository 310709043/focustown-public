# Lightsail Container Service Bootstrap — one-time AWS setup

End state after running this runbook (dev + prod together):

- 2 Lightsail Container Services: `lowbatterytown-prod` (Small, `--scale 1`) + `lowbatterytown-dev` (Nano, `--scale 1`). **Scale must stay at 1** until `WSManager` (`backend/app/infrastructure/messaging/ws_manager.py`) is moved to a Redis-backed broadcast — process-local state breaks scale>1.
- 1 Lightsail Managed Database: `lowbatterytown-pg-prod` (Postgres Standard 1GB, single-AZ, 7-day PITR). Hosts **two databases on the same instance** — `lowbatterytown` (prod) and `lowbatterytown_dev` (dev) — each owned by a distinct role with no cross-DB grants. Trades $15/mo + strict env isolation against shared compute/RAM on a single instance.
- 2 ECR repos: `lowbatterytown-backend`, `lowbatterytown-frontend` (shared across prod + dev, different image tags)
- 1 SES verified identity for `lowbatterytown.com`
- 1 IAM user `lowbatterytown-app` (SES SendEmail only) — long-lived access key used by the app at runtime
- **Audio storage = Cloudflare R2** (private bucket `lowbatterytown-audio` in APAC, fronted by a Cloudflare Worker at `audio.lowbatterytown.com`). No S3 bucket needed; see `infra/worker-audio/`.
- 1 IAM role `gha-lowbatterytown-deployer` assumed via GitHub OIDC for CI (ECR push + Lightsail deploy)
- **DNS hosted at Cloudflare** (`lowbatterytown.com`). No Route 53, no CloudFront — Cloudflare's free tier covers DNS + CDN + DDoS for the prod-facing record. Sections that would have lived in Route 53 (DKIM CNAMEs, ACM validation CNAME, app A/CNAME records) are added in the Cloudflare console.
- 1 CloudWatch metric alarm on LCS memory > 80% (free tier) for each container service

**Estimated monthly cost: $49 end-state (dev + prod). First-pass dev-only ≈ $23/mo (~$8/mo for the first 3 months while Lightsail Managed PG free tier applies).**

Region: `ap-northeast-1` (Tokyo). All commands assume `aws` CLI v2 with admin credentials and `--profile lowbatterytown`.
Substitute `<ACCOUNT_ID>` and `<GITHUB_REPO>` (e.g. `CoreNovus/focustown`) throughout.

**First-pass scope (dev-only)**: §1, §2, §3+§3a, §4, §5, §6, **§7 only the `--service-name lowbatterytown-dev` line**, **§7a (alarm)**, **§8 only the `dev.lowbatterytown.com` cert**, §9 (Cloudflare), skip §10, §11, §12 only the dev DATABASE_URL line. The prod-only paths in §7, §8, §11 are deferred until dev is verified green.

---

## 1. ECR repos

```bash
aws ecr create-repository --repository-name lowbatterytown-backend \
    --region ap-northeast-1 --image-scanning-configuration scanOnPush=true \
    --image-tag-mutability MUTABLE

aws ecr create-repository --repository-name lowbatterytown-frontend \
    --region ap-northeast-1 --image-scanning-configuration scanOnPush=true \
    --image-tag-mutability MUTABLE
```

Attach repository policies that let the Lightsail Container Service principal pull
(LCS pulls from private ECR using its service-linked role since 2023):

```bash
for repo in lowbatterytown-backend lowbatterytown-frontend; do
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

## 2. ~~S3 storage bucket~~ — replaced by Cloudflare R2

Audio storage lives in Cloudflare R2 (`lowbatterytown-audio` bucket,
APAC region, private), served via a Worker at `audio.lowbatterytown.com`.
See `infra/worker-audio/README.md` for the Worker setup and
`scripts/upload-tracks-to-r2.py` for the bulk upload tooling.

If migrating from a prior S3 deployment, delete the unused AWS bucket:

```bash
aws s3 rm s3://lowbatterytown-storage --recursive
aws s3api delete-bucket --bucket lowbatterytown-storage
```

The runtime IAM policy in §5 no longer grants any S3 permissions.

## 3. Managed Postgres (single instance, two databases)

Provision **one** Managed Postgres instance for both environments. Dev shares
the prod instance compute, but lives in a separate database with its own role
— hard isolation at the Postgres database boundary, not soft isolation by
schema or row-tenant. Saves $15/mo vs a dedicated dev instance; accepts shared
RAM/CPU and a single PITR scope across both envs.

```bash
# Single instance — master password is auto-generated; capture from output.
aws lightsail create-relational-database \
    --region ap-northeast-1 \
    --relational-database-name lowbatterytown-pg-prod \
    --master-database-name lowbatterytown \
    --master-username lowbatterytown_admin \
    --relational-database-blueprint-id postgres_16 \
    --relational-database-bundle-id micro_2_0 \
    --no-publicly-accessible
```

Wait ~10 min for `state=available`, then capture the endpoint and master password:

```bash
aws lightsail get-relational-database --region ap-northeast-1 \
    --relational-database-name lowbatterytown-pg-prod \
    --query 'relationalDatabase.{endpoint:masterEndpoint.address,port:masterEndpoint.port}'

aws lightsail get-relational-database-master-user-password --region ap-northeast-1 \
    --relational-database-name lowbatterytown-pg-prod \
    --password-version CURRENT --query 'masterUserPassword' --output text
```

### 3a. Create per-env roles and the dev database

Temporarily expose the instance to your laptop (Lightsail's allowlist is on the
DB, not the LCS), connect as `lowbatterytown_admin`, then run this **one-shot** SQL.
Generate two strong, distinct passwords first (`openssl rand -base64 24` each)
— these become `PROD_DB_PASSWORD` and `DEV_DB_PASSWORD`.

```bash
aws lightsail update-relational-database --region ap-northeast-1 \
    --relational-database-name lowbatterytown-pg-prod \
    --publicly-accessible

# psql connects to the admin-owned 'lowbatterytown' database to issue CREATE ROLE etc.
psql "postgresql://lowbatterytown_admin:<ADMIN_PASSWORD>@<endpoint>:5432/lowbatterytown?sslmode=require" <<SQL
-- Prod role: owns the existing 'lowbatterytown' database.
CREATE ROLE lowbatterytown LOGIN PASSWORD '<PROD_DB_PASSWORD>';
ALTER DATABASE lowbatterytown OWNER TO lowbatterytown;

-- Dev role + dev database, fully separate from prod.
CREATE ROLE lowbatterytown_dev LOGIN PASSWORD '<DEV_DB_PASSWORD>';
CREATE DATABASE lowbatterytown_dev OWNER lowbatterytown_dev;

-- Belt-and-suspenders: explicitly revoke each role from the other's database.
-- Postgres 15+ already removes CREATE on public from PUBLIC; this just makes
-- the cross-env block visible in pg_database privileges.
REVOKE ALL ON DATABASE lowbatterytown     FROM lowbatterytown_dev, PUBLIC;
REVOKE ALL ON DATABASE lowbatterytown_dev FROM lowbatterytown,     PUBLIC;
GRANT  CONNECT,TEMPORARY ON DATABASE lowbatterytown     TO lowbatterytown;
GRANT  CONNECT,TEMPORARY ON DATABASE lowbatterytown_dev TO lowbatterytown_dev;
SQL

# Lock the instance back down.
aws lightsail update-relational-database --region ap-northeast-1 \
    --relational-database-name lowbatterytown-pg-prod \
    --no-publicly-accessible
```

Build the two connection strings (used as GitHub Actions environment secrets later):

```
PROD_DATABASE_URL=postgresql+asyncpg://lowbatterytown:<URL_ENCODED_PROD_PASSWORD>@<endpoint>:5432/lowbatterytown?ssl=require
DEV_DATABASE_URL =postgresql+asyncpg://lowbatterytown_dev:<URL_ENCODED_DEV_PASSWORD>@<endpoint>:5432/lowbatterytown_dev?ssl=require
```

**Verify isolation before moving on**:

```bash
# Should succeed:
psql "$PROD_DATABASE_URL" -c "SELECT current_database(), current_user;"
psql "$DEV_DATABASE_URL"  -c "SELECT current_database(), current_user;"

# Should each fail with 'permission denied for database':
psql "postgresql://lowbatterytown:<PROD_PWD>@<endpoint>:5432/lowbatterytown_dev?sslmode=require" -c "SELECT 1;"
psql "postgresql://lowbatterytown_dev:<DEV_PWD>@<endpoint>:5432/lowbatterytown?sslmode=require"     -c "SELECT 1;"
```

If either of the last two commands succeeds, **stop**: the cross-DB REVOKE
didn't take. Re-run the GRANT/REVOKE block before any deploy.

## 4. SES identity

```bash
aws sesv2 create-email-identity --region ap-northeast-1 \
    --email-identity lowbatterytown.com

# Then add the DKIM CNAMEs that come back to Cloudflare DNS (step 9).
# Verify a noreply@ sender if needed:
aws sesv2 create-email-identity --region ap-northeast-1 \
    --email-identity noreply@lowbatterytown.com
```

Request production sending access (sandbox limit is 200 emails/day):
SES console → Account dashboard → Request production access.

## 5. IAM user for the running app (SES only)

Audio storage moved to Cloudflare R2 (see `infra/worker-audio/`), so the
runtime no longer needs S3 access. SES is the only AWS service the app
calls at runtime.

```bash
aws iam create-user --user-name lowbatterytown-app

aws iam put-user-policy --user-name lowbatterytown-app --policy-name lowbatterytown-app-runtime \
    --policy-document '{
      "Version": "2012-10-17",
      "Statement": [
        {
          "Effect": "Allow",
          "Action": ["ses:SendEmail", "ses:SendRawEmail"],
          "Resource": "*"
        }
      ]
    }'

aws iam create-access-key --user-name lowbatterytown-app
# Save the AccessKeyId + SecretAccessKey for GitHub Actions secrets.
```

To strip S3 from an EXISTING policy (already-deployed accounts), re-run
the `put-user-policy` above with the trimmed JSON; it replaces the
inline policy in place (idempotent).

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

aws iam create-role --role-name gha-lowbatterytown-deployer \
    --assume-role-policy-document file:///tmp/gha-trust.json

aws iam put-role-policy --role-name gha-lowbatterytown-deployer \
    --policy-name gha-lowbatterytown-deployer-policy \
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
            "arn:aws:ecr:ap-northeast-1:<ACCOUNT_ID>:repository/lowbatterytown-backend",
            "arn:aws:ecr:ap-northeast-1:<ACCOUNT_ID>:repository/lowbatterytown-frontend"
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

**⚠ `--scale 1` is a hard constraint**, not a starting value. `WSManager`
(`backend/app/infrastructure/messaging/ws_manager.py:21`) tracks live
WebSocket connections in a process-local `dict`, so scale>1 means users
connected to container A are invisible to container B. Lift this only after
WSManager is moved to a Redis-backed broadcast (see follow-up tasks).

```bash
# Dev — run this in the first-pass bootstrap.
aws lightsail create-container-service --region ap-northeast-1 --profile lowbatterytown \
    --service-name lowbatterytown-dev --power nano --scale 1

# Prod — DEFERRED until dev is verified green. Uncomment when ready.
# aws lightsail create-container-service --region ap-northeast-1 --profile lowbatterytown \
#     --service-name lowbatterytown-prod --power small --scale 1
```

Wait ~5 min for `state=READY`. Take note of the public domain Lightsail assigns
(`https://lowbatterytown-dev.<random>.<region>.cs.amazonlightsail.com`); the first
real deployment from CI will attach the custom domain.

## 7a. CloudWatch memory alarm (free tier)

One alarm per container service so an operator gets paged before the Nano /
Small tier OOMs. Threshold 80% sustained for 10 minutes (2 × 300s evaluation).

```bash
aws cloudwatch put-metric-alarm --region ap-northeast-1 --profile lowbatterytown \
    --alarm-name lowbatterytown-dev-memory-high \
    --metric-name MemoryUtilization \
    --namespace AWS/Lightsail \
    --dimensions Name=ServiceName,Value=lowbatterytown-dev \
    --threshold 80 \
    --comparison-operator GreaterThanThreshold \
    --evaluation-periods 2 \
    --period 300 \
    --statistic Maximum \
    --treat-missing-data notBreaching
```

(For prod: re-run with `--alarm-name lowbatterytown-prod-memory-high` and
`Value=lowbatterytown-prod`. Add `--alarm-actions <SNS_TOPIC_ARN>` once an
SNS topic exists for notifications; the bare alarm is still useful via the
CloudWatch dashboard.)

## 8. Custom domain attachment

After at least one deployment succeeds on the container service, create the
Lightsail-managed cert and attach the public domain. Lightsail issues the
cert via DNS validation — the validation CNAME must exist in Cloudflare
(§9) before the cert flips to `ISSUED`.

```bash
# Dev — first-pass.
aws lightsail create-certificate --region ap-northeast-1 --profile lowbatterytown \
    --certificate-name lowbatterytown-dev-cert \
    --domain-name dev.lowbatterytown.com

# Capture the validation CNAME from the response:
aws lightsail get-certificates --region ap-northeast-1 --profile lowbatterytown \
    --certificate-name lowbatterytown-dev-cert \
    --query 'certificates[0].certificateDetail.domainValidationRecords[0].resourceRecord'
# → {"name": "_xxxxxxxxxxxx.dev.lowbatterytown.com.", "type": "CNAME",
#    "value": "_yyyyyyyyyyyy.acm-validations.aws."}
#
# Add this name→value as a CNAME in Cloudflare (§9), Proxy = OFF (DNS only),
# then poll until status flips to ISSUED:

aws lightsail get-certificates --region ap-northeast-1 --profile lowbatterytown \
    --certificate-name lowbatterytown-dev-cert \
    --query 'certificates[0].certificateDetail.status'
# When this prints "ISSUED" (typically 2–10 min after the Cloudflare CNAME
# propagates), attach the public domain:

aws lightsail update-container-service --region ap-northeast-1 --profile lowbatterytown \
    --service-name lowbatterytown-dev \
    --public-domain-names '{"lowbatterytown-dev-cert":["dev.lowbatterytown.com"]}'

# Prod — DEFERRED. Uncomment when ready.
# aws lightsail create-certificate --region ap-northeast-1 --profile lowbatterytown \
#     --certificate-name lowbatterytown-prod-cert --domain-name lowbatterytown.com
# # (same Cloudflare validation + update-container-service flow)
```

## 9. DNS — Cloudflare-hosted

DNS is hosted at Cloudflare (free plan). No Route 53; the Lightsail Container
Service public endpoint already terminates TLS via §8's cert, and Cloudflare's
free tier will sit in front for CDN/DDoS once we flip the proxy on.

The records that need to exist for the **first-pass dev** stack:

| Type | Name | Value | Proxy | Source |
|---|---|---|---|---|
| CNAME | `_xxxxxxxxxxxx.dev` | `_yyyyyyyyyyyy.acm-validations.aws.` | ❌ OFF (DNS only) | §8 ACM validation; can be deleted once cert is ISSUED but keep it for renewals |
| CNAME | `dev` | `lowbatterytown-dev.<random>.ap-northeast-1.cs.amazonlightsail.com` | ❌ OFF (DNS only) for first attach, can flip ON after cert is ISSUED if you want Cloudflare's free CDN/DDoS | §7 LCS public endpoint |
| CNAME × 3 | DKIM selectors from §4 SES `aws sesv2 get-email-identity --email-identity lowbatterytown.com --query 'DkimAttributes.Tokens'` | `<token>.dkim.amazonses.com` | ❌ OFF | §4 SES |
| TXT | `_amazonses` | verification token from §4 SES output | ❌ OFF | §4 SES |

**Why Proxy=OFF on the LCS CNAME for the first attach**: Cloudflare's proxy
would terminate TLS at Cloudflare, but LCS expects the cert to validate against
the origin host. Once §8 cert status reads `ISSUED` and the LCS
`update-container-service --public-domain-names` call succeeds, you can flip
Proxy=ON on the `dev.lowbatterytown.com` CNAME for free CDN + DDoS.

**Prod additions (DEFERRED)**:

| Type | Name | Value | Proxy |
|---|---|---|---|
| CNAME | `_xxxxxxxxxxxx` (apex validation) | `_yyyyyyyyyyyy.acm-validations.aws.` | ❌ OFF |
| CNAME | `@` (apex flattening — Cloudflare-specific feature) | `lowbatterytown-prod.<random>.ap-northeast-1.cs.amazonlightsail.com` | ✅ ON (Proxied) |
| CNAME | `www` | `lowbatterytown.com` | ✅ ON |

## 10. ~~CloudFront~~ — replaced by Cloudflare proxy

Cloudflare's free plan provides CDN + DDoS protection identical in shape to a
basic CloudFront distribution. Enable by flipping `Proxy=ON` on the app
record once the LCS cert is ISSUED. Caching rules can be tuned in the
Cloudflare dashboard later; default rules are sensible for an API + WS app
(do not cache `/api/*` or `/api/v1/ws/*`, cache static assets).

Savings vs CloudFront: ~$3/mo and zero AWS-side config.

## 11. GitHub Actions secrets + variables to populate

In repo settings → Secrets and variables → Actions:

**Repository variables (non-secret):**
| Name | Example | Notes |
|---|---|---|
| `AWS_REGION` | `ap-northeast-1` | |
| `AWS_ACCOUNT_ID` | `123456789012` | |
| `ECR_REGISTRY` | `123456789012.dkr.ecr.ap-northeast-1.amazonaws.com` | |
| `PROD_PUBLIC_HOST` | `lowbatterytown.com` | |
| `DEV_PUBLIC_HOST` | `dev.lowbatterytown.com` | |
| `SES_FROM_EMAIL` | `noreply@lowbatterytown.com` | |
| `S3_BUCKET` | `lowbatterytown-audio` | R2 bucket name (S3-compat); backend reads it via `S3_*` env shape |
| `TERMS_CURRENT_VERSION` | `2026-05-14` | Matches `frontend/lib/config/legal.ts` |

**Repository secrets (sensitive):**
| Name | Source |
|---|---|
| `AWS_DEPLOY_ROLE_ARN` | `arn:aws:iam::<ACCOUNT_ID>:role/gha-lowbatterytown-deployer` |
| `PROD_DATABASE_URL` | postgresql+asyncpg URL from step 3a (`lowbatterytown` DB, `lowbatterytown` role) |
| `DEV_DATABASE_URL` | postgresql+asyncpg URL from step 3a (`lowbatterytown_dev` DB, `lowbatterytown_dev` role) |
| `PROD_APP_SECRET_KEY` | `openssl rand -base64 48` |
| `DEV_APP_SECRET_KEY` | `openssl rand -base64 48` |
| `AWS_APP_ACCESS_KEY_ID` | from step 5 |
| `AWS_APP_SECRET_ACCESS_KEY` | from step 5 |

**GitHub Environments** (Settings → Environments):
- `production`: require manual approval; add the secrets prefixed `PROD_*` here only
- `dev`: no approval; add the secrets prefixed `DEV_*` here only

## 11a. Local deploy fallback (when GitHub Actions is disabled)

If the `CoreNovus` org's Actions billing is off (cost-saving posture) or you
need a one-off override, `scripts/deploy-dev.sh` is a local mirror of
`.github/workflows/build-and-push.yml` + `.github/workflows/deploy-dev.yml`:

```bash
./scripts/deploy-dev.sh
```

It reads `/tmp/lbt-deploy/state.env` (or `LBT_STATE_FILE`) for the secrets
captured during Phase B, uses the `lowbatterytown` AWS CLI profile to log in to
ECR, builds + pushes backend + frontend (dev variant) images, materialises the
deployment spec from `infra/lightsail/dev/containers.json.tpl`, calls
`aws lightsail create-container-service-deployment`, waits for `ACTIVE`, and
smoke-tests `https://dev.lowbatterytown.com/healthz`. End state is identical to
a successful CI run — no extra config drift when Actions is re-enabled.

A `scripts/deploy-prod.sh` will land alongside the prod bootstrap; intentionally
absent until prod LCS exists.

## 12. First migration (one-shot from your laptop)

After the LCS services have run once successfully, run alembic against **both**
databases on the Managed PG instance from your laptop (which has temporarily
added its public IP to the Lightsail DB allowlist). The migrations are
identical; only the connection target changes.

```bash
aws lightsail update-relational-database --region ap-northeast-1 \
    --relational-database-name lowbatterytown-pg-prod \
    --publicly-accessible

cd backend
DATABASE_URL='<PROD_DATABASE_URL>' alembic upgrade head
DATABASE_URL='<DEV_DATABASE_URL>'  alembic upgrade head

# Lock the instance back down:
aws lightsail update-relational-database --region ap-northeast-1 \
    --relational-database-name lowbatterytown-pg-prod \
    --no-publicly-accessible
```

Each database keeps its own `alembic_version` row, so they drift independently
when a hotfix lands on `main` but `develop` is still ahead — that's intentional.

(Later iterations: the CI workflow runs `alembic upgrade head` inside the
backend + worker container command on cold start. Prod deploy targets the
`lowbatterytown` database; dev deploy targets `lowbatterytown_dev` — driven entirely by
which `*_DATABASE_URL` secret the env injects.)

---

## Cost ledger (verify after 1 month in Cost Explorer, tagged app=lowbatterytown)

### End state (dev + prod)

| Line item | Monthly |
|---|---|
| Lightsail Container Service (Small, 1 node, prod) | $20 |
| Lightsail Container Service (Nano, 1 node, dev) | $7 |
| Lightsail Managed Database — Standard 1GB (hosts prod + dev DBs) | $15 |
| ECR storage (~1GB) | $0.10 |
| S3 storage + requests | $1 |
| CloudWatch Logs (LCS stdout, 7-day retention) | $2 |
| CloudWatch metric alarms (free tier) | $0 |
| SES (password reset only) | $0.10 |
| Data transfer (within 500 GB LCS bundle) | $0 |
| **Cloudflare** (DNS + CDN + DDoS, free plan) | $0 |
| **Total end-state** | **~$45–46** |

### First-pass dev-only (this round)

| Line item | Monthly |
|---|---|
| Lightsail Container Service (Nano, dev) | $7 |
| Lightsail Managed Database — Standard 1GB | $15 (free first 3 months) |
| ECR + S3 + CloudWatch + SES + DNS | <$2 |
| **Total dev MVP** | **~$23/mo** (~$8/mo for the first 3 months) |

Set a budget alarm at **$30** during the dev-only phase, raise to **$60**
once prod LCS Small is added. If prod LCS Small starts OOM-ing under load —
1 GB shared across 5 containers (caddy + backend + worker + frontend + redis)
is tight — the next step up is LCS Medium ($40/mo). The §7a CloudWatch alarm
is the early signal.
