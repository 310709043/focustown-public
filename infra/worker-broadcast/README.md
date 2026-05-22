# worker-broadcast

Cloudflare Worker that fronts a **private** R2 bucket for Focus Town's
billboard broadcast clips (10 short MP4 files in a rotating playlist).

## What it does

- `GET /clip/<id>?t=<jwt>` — validates an HS256 JWT (shared secret with
  the backend), checks the Referer against `ALLOWED_REFERERS`, reads
  the R2 object whose key was signed into the token, and streams bytes
  back with Range support.
- The R2 bucket is **private** — there's no public binding or
  presigned-URL flow. Only this Worker can read.

## Setup (one-time)

```bash
pnpm install              # from repo root
cd infra/worker-broadcast
pnpm wrangler login
pnpm wrangler r2 bucket create focustown-broadcast --location apac
pnpm wrangler secret put BROADCAST_PROXY_SECRET   # same value as backend
pnpm wrangler deploy
```

Then in the Cloudflare dashboard:
- **R2 → focustown-broadcast → Settings**: keep public access **off**.
- **Workers → lowbatterytown-broadcast → Settings → Domains & Routes**:
  add custom domain `broadcast.focustown.app`.

## Uploading clips

Use the wrangler CLI from any machine logged into your Cloudflare
account:

```bash
pnpm wrangler r2 object put focustown-broadcast/broadcasts/clip-01.mp4 \
  --file ./clip-01.mp4 --content-type video/mp4
# repeat for clip-02.mp4 ... clip-10.mp4
```

The key prefix `broadcasts/` is enforced by the Worker (see
`BROADCAST_KEY_PREFIX` in `wrangler.toml`); a forged token whose `key`
claim doesn't start with this prefix is rejected.

## Develop locally

```bash
pnpm dev          # wrangler dev with miniflare R2
pnpm test         # vitest + vitest-pool-workers
pnpm typecheck
```

## Configuration

| Var | Where | Purpose |
|---|---|---|
| `BROADCAST_PROXY_SECRET` | `wrangler secret put` | HS256 shared key with backend. **Must equal `BROADCAST_PROXY_SECRET` on the backend.** |
| `ALLOWED_ORIGINS` | `wrangler.toml [vars]` | CORS allow-list (browser embedding). |
| `ALLOWED_REFERERS` | `wrangler.toml [vars]` | Hot-link block — Referer must start with one of these prefixes. |
| `BROADCAST_KEY_PREFIX` | `wrangler.toml [vars]` | Forbid the token from reading outside this R2 namespace. |

## Contract

The token claim set is owned jointly with
`backend/app/domain/services/broadcast_token_service.py`. When changing
the JWT shape, update both sides.

| Claim | Source of truth | Notes |
|---|---|---|
| `sub` | backend (`user_id`) | Identifies the issuing user; not enforced here, just logged. |
| `cid` | backend (`clip_id`) | Must match the URL `<id>` path segment. |
| `key` | backend (`broadcasts/clip-XX.mp4`) | The R2 object the Worker actually fetches. |
| `iat` / `exp` | backend | TTL = `BROADCAST_TOKEN_TTL_SECONDS` (default 300 s). |
