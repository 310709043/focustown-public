# Deploy Focus Town to AWS Lightsail (prod, $15/mo)

Single-VM production deploy. Local docker-compose covers dev. Architecture decided in `~/.claude/plans/aws-polymorphic-bee.md`.

> **One-time setup is manual** (AWS Console + Lightsail SSH + GoDaddy DNS). Day-to-day deploys are automated via GitHub Actions on push to `main`.

## TL;DR

```
GoDaddy DNS  ──▶  Lightsail 2GB VM (Tokyo)  ──▶  docker-compose.prod.yml
                                                    Caddy + frontend + backend
                                                    + worker + postgres + redis
                                  ▲                       │
                                  │                       ▼ (cron nightly)
                              GitHub Actions          S3 backup bucket
                              (SSH on main push)
```

| Resource | Purpose | Monthly |
|---|---|---|
| Lightsail 2GB Tokyo | All-in-one app server | $12.00 |
| Lightsail static IP | Fixed origin for DNS | included |
| S3 bucket `focustown-backups` | Nightly pg_dump + storage tar | ~$0.25 |
| SES (sandbox or production) | Password-reset emails | ~$0.10 |
| Lightsail snapshots (optional) | Daily, 7-day retention | $1.00 |
| **Total** | | **~$13.50** |

---

## 0. Before you start

You need:

- An AWS account with billing enabled. (Free tier is fine for SES + S3.)
- A domain registered at GoDaddy (any registrar with DNS-record-editing UI works; instructions use GoDaddy as the example).
- An empty GitHub repository under your account.
- An SSH keypair for VM access (`ssh-keygen -t ed25519 -C lightsail-focustown`).

Pick one apex domain to use as `PUBLIC_HOST`, e.g. `focustown.app`. The rest of this doc assumes that.

---

## 1. AWS IAM — two least-privilege users

The app and the backup script each get their **own** programmatic IAM user. Never reuse credentials.

### 1a. SES sender

1. AWS Console → IAM → Users → Create user
   - Name: `focustown-ses-sender`
   - Programmatic access only (no console)
2. Permissions → Attach policies directly → Create inline policy:
   ```json
   {
     "Version": "2012-10-17",
     "Statement": [{
       "Effect": "Allow",
       "Action": ["ses:SendEmail", "ses:SendRawEmail"],
       "Resource": "arn:aws:ses:ap-northeast-1:*:identity/focustown.app"
     }]
   }
   ```
3. Create access key → save `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` — these go into `/opt/focustown/.env` later.

### 1b. Backup writer

1. Same flow, user name `focustown-backup-writer`.
2. Inline policy:
   ```json
   {
     "Version": "2012-10-17",
     "Statement": [{
       "Effect": "Allow",
       "Action": ["s3:PutObject", "s3:AbortMultipartUpload"],
       "Resource": "arn:aws:s3:::focustown-backups/*"
     }]
   }
   ```
3. Save access key — these go into `~/.aws/credentials` on the VM.

---

## 2. S3 backup bucket

1. AWS Console → S3 → Create bucket
   - Name: `focustown-backups` (must be globally unique — pick something like `focustown-backups-<your-suffix>` if taken; update `BACKUP_S3_BUCKET` in `.env` to match)
   - Region: `ap-northeast-1` (Tokyo)
   - Block all public access: **ON**
   - Versioning: OFF
   - Encryption: SSE-S3 (AES-256)
2. After creation → Management → Lifecycle rules → Create rule
   - Name: `expire-after-30-days`
   - Scope: applies to all objects
   - Action: Expire current versions of objects → 30 days
3. (optional) Object Lock disabled — backups should be deletable.

---

## 3. SES domain identity

1. AWS Console → SES → Verified identities → Create identity
   - Type: Domain
   - Domain: `focustown.app`
   - DKIM: Easy DKIM, RSA 2048
2. SES shows 3 CNAME records (`xxx._domainkey.focustown.app` → `xxx.dkim.amazonses.com`). Copy them.
3. In GoDaddy DNS Manager, add all 3 CNAME records exactly as shown. TTL 600.
4. Back in SES → wait for status → "Verified" (usually <30 min, sometimes faster).
5. **You are in SES sandbox.** This means you can only send TO email addresses you have verified individually. For MVP:
   - SES → Verified identities → Create identity → Email address → verify your own dev/admin email(s)
   - Test password reset only with those addresses
6. **Before opening to real users**: SES → Account dashboard → Request production access. Fill the form (use case, expected volume, bounce/complaint handling). Approval typically 24–48h.

---

## 4. Lightsail VM

1. AWS Console → **Lightsail** (separate from the main AWS Console URL) → Create instance
   - Region: Tokyo, Zone: any
   - Platform: Linux/Unix
   - Blueprint: OS Only → Ubuntu 24.04 LTS
   - Instance plan: **$12/mo — 2GB RAM, 2 vCPU, 60GB SSD, 3TB transfer**
   - Name: `focustown-prod`
2. Networking → IPv4 Networking → Attach static IP. **Save the static IP**.
3. Networking → IPv4 Firewall:
   - SSH (22) — restrict source to **your home IP** (use Lightsail's "Custom" → enter your public IP/32)
   - HTTP (80) — anywhere (Caddy needs it for the ACME HTTP-01 challenge)
   - HTTPS (443) — anywhere (TCP)
   - HTTPS (443) — anywhere (UDP, for HTTP/3) — optional but cheap
4. (optional, +$1/mo) Snapshots → Enable Automatic snapshots → Frequency daily at 03:00 UTC → Retention 7 snapshots.
5. Account → SSH keys → upload your `~/.ssh/lightsail-focustown.pub`. Or, download Lightsail's auto-generated key from the instance Connect page.

---

## 5. GoDaddy DNS

1. GoDaddy → My Products → DNS for `focustown.app`
2. Add A record: `@` → Lightsail static IP, TTL 600
3. (optional) Add A record: `www` → same IP (or CNAME `www` → `focustown.app.`)
4. Verify (any machine):
   ```bash
   dig +short focustown.app
   ```
   Should return the Lightsail IP. May take 5–15 min to propagate.

---

## 6. First-time VM bootstrap

SSH in:

```bash
ssh -i ~/.ssh/lightsail-focustown ubuntu@<static-ip>
```

### 6a. Harden + base packages

```bash
sudo apt update && sudo apt -y upgrade
sudo apt install -y ufw fail2ban awscli git
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 443/udp     # HTTP/3
sudo ufw --force enable
sudo systemctl enable --now fail2ban
```

### 6b. Docker

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker ubuntu
exit                       # log out so the docker group takes effect
```

SSH back in.

### 6c. AWS credentials for backup script

```bash
mkdir -p ~/.aws && chmod 700 ~/.aws
cat > ~/.aws/credentials <<'EOF'
[default]
aws_access_key_id = <focustown-backup-writer access key>
aws_secret_access_key = <focustown-backup-writer secret>
region = ap-northeast-1
EOF
chmod 600 ~/.aws/credentials
aws s3 ls s3://focustown-backups/    # smoke test, should succeed (empty list)
```

### 6d. App directory + repo

```bash
sudo mkdir -p /opt/focustown/data/pg /opt/focustown/data/redis
sudo chown -R ubuntu:ubuntu /opt/focustown
cd /opt/focustown
git clone https://github.com/<your-owner>/<your-repo>.git .
```

### 6e. .env (the only file with secrets, NEVER commit)

```bash
cp backend/.env.production.example .env
nano .env
# fill in:
#   PUBLIC_HOST=focustown.app
#   ACME_EMAIL=you@example.com
#   APP_SECRET_KEY=  <-- openssl rand -base64 32
#   PG_PASSWORD=     <-- different from APP_SECRET_KEY; openssl rand -base64 24
#   SES_FROM_EMAIL=noreply@focustown.app
#   AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY  (the SES sender user)
chmod 600 .env
```

### 6f. First boot

```bash
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml run --rm backend alembic upgrade head
docker compose -f docker-compose.prod.yml up -d
# Caddy will request the LE cert on first request. Wait ~30 sec.
sleep 30
curl -I https://focustown.app/healthz   # expect HTTP/2 200, server: Caddy
```

If Caddy can't get the cert: check `docker compose -f docker-compose.prod.yml logs caddy`. 99% of the time DNS isn't fully propagated yet, or port 80 is blocked.

### 6g. Cron the backup

```bash
chmod +x /opt/focustown/scripts/backup.sh
# Run once manually to verify
/opt/focustown/scripts/backup.sh
aws s3 ls s3://focustown-backups/db/   # should list the dump just produced

# Schedule nightly at 03:00 JST (18:00 UTC)
(crontab -l 2>/dev/null; echo "0 18 * * * /opt/focustown/scripts/backup.sh >> /var/log/focustown-backup.log 2>&1") | crontab -
sudo touch /var/log/focustown-backup.log
sudo chown ubuntu:ubuntu /var/log/focustown-backup.log
```

---

## 7. GitHub Actions secrets

In your GitHub repo: Settings → Secrets and variables → Actions → New repository secret.

| Secret | Value |
|---|---|
| `LIGHTSAIL_HOST` | Lightsail static IP |
| `LIGHTSAIL_USER` | `ubuntu` |
| `LIGHTSAIL_SSH_KEY` | The **private** key content (entire `-----BEGIN ... -----END` block) for the key whose pub-half is on the VM |
| `LIGHTSAIL_SSH_PORT` | `22` (or your custom SSH port if you moved it) |
| `PUBLIC_HOST` | `focustown.app` |

Then a push to `main` triggers `.github/workflows/deploy-prod.yml` which:
1. SSHes into the VM
2. `git pull`
3. Pulls base images, rebuilds app images
4. Runs `alembic upgrade head` in a one-shot container
5. Restarts services via `docker compose up -d`
6. Polls `https://${PUBLIC_HOST}/healthz` up to 10× with 6s gap

---

## 8. AWS Billing alarm — DO NOT SKIP

The single biggest cost-risk in this architecture is **runaway SES bounces** or **someone misconfiguring S3 and triggering huge data transfer**. Lightsail itself is flat-rate.

1. AWS Console → Billing → Budgets → Create budget
   - Type: Cost
   - Period: Monthly, recurring
   - Amount: `$15`
   - Alert thresholds: 80%, 100%, 120%
   - Email subscriber: your email
2. AWS Console → CloudWatch → Billing → All services alarm at `$20` → SNS topic → your email (fallback if the Budget alert misses).

If you ever see a budget alert: check S3 storage class, SES sending statistics, and Lightsail data-transfer overage on the same day.

---

## 9. Verification — first deploy smoke test

Run from your laptop. All should pass before declaring deploy successful.

```bash
PUBLIC_HOST=focustown.app

# 1. DNS resolves to Lightsail IP
dig +short $PUBLIC_HOST

# 2. Cert valid, server identifies as Caddy
curl -I https://$PUBLIC_HOST/healthz
# Expect: HTTP/2 200, server: Caddy

# 3. Cert dates (≈90 days from today)
echo | openssl s_client -connect $PUBLIC_HOST:443 -servername $PUBLIC_HOST 2>/dev/null \
  | openssl x509 -noout -dates

# 4. Error envelope still in place (no stack-trace leak)
curl -s https://$PUBLIC_HOST/api/v1/auth/signin \
  -H 'content-type: application/json' \
  -d '{"email":"nope@example.com","password":"wrong"}' | jq .
# Expect: {"code":"...","message":"...","request_id":"..."}

# 5. Browser flow
#    open https://focustown.app  → signup → login → /town
#    DevTools Network: wss://focustown.app/api/v1/ws/... connects
```

On the VM (SSH in):

```bash
# 6. Migration up to date
docker compose -f docker-compose.prod.yml exec backend alembic current

# 7. Worker ticking
docker compose -f docker-compose.prod.yml logs worker --tail=30 | grep sweep_abandoned

# 8. Backup last-run output
tail -50 /var/log/focustown-backup.log
aws s3 ls s3://focustown-backups/db/ | tail -5
```

---

## 10. Day-2 ops cheatsheet

```bash
# Tail one service
docker compose -f docker-compose.prod.yml logs -f backend

# Restart one service (zero-downtime is approximate; expect ~5s blip)
docker compose -f docker-compose.prod.yml restart frontend

# Run an ad-hoc command in backend
docker compose -f docker-compose.prod.yml exec backend python -c "..."

# Roll back to a previous commit (no git revert, just deploy that SHA)
cd /opt/focustown
git fetch && git reset --hard <good-sha>
docker compose -f docker-compose.prod.yml build backend worker frontend
docker compose -f docker-compose.prod.yml up -d

# Restore from backup (disaster scenario)
aws s3 cp s3://focustown-backups/db/<TS>.dump /tmp/restore.dump
docker compose -f docker-compose.prod.yml stop backend worker
docker compose -f docker-compose.prod.yml exec -T postgres \
  pg_restore -U focustown -d focustown --clean --if-exists < /tmp/restore.dump
docker compose -f docker-compose.prod.yml start backend worker

# VM upgrade in place (Lightsail Console → Snapshots → Create instance from snapshot
# on a 4GB plan → swap static IP)
```

---

## 11. When to outgrow this setup

Triggers to revisit `infra/cdk-future/`:
- Concurrent WebSocket connections sustainably > 500 (single Node `next start` runs out of headroom)
- Postgres needs read replicas for analytics queries
- Required uptime > 99.5% (single VM ≈ 99.9% best case; AZ events kill you)
- Need geographically distributed users (CDN, multi-region)
- Compliance demands (SOC2 / GDPR data residency formalisation)
- Budget > $200/mo is available

At that point you have ECS / Aurora / ElastiCache / ALB / Cognito stacks already written and tested in `infra/cdk-future/lib/*`. Spin them up alongside Lightsail, point DNS, decommission Lightsail.
