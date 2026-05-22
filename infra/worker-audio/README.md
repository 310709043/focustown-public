# worker-audio

Cloudflare Worker that fronts a private R2 bucket for Focus Town audio.

## What it does

- `GET /track/<id>?t=<jwt>` — validates an HS256 JWT (shared secret with
  the backend), checks the Referer against `ALLOWED_REFERERS`, reads
  the R2 object whose key was signed into the token, and streams bytes
  back with Range support.
- The R2 bucket is **private** — there's no public binding or
  presigned-URL flow. Only this Worker can read.

## Setup (one-time)

```bash
pnpm install              # from repo root
cd infra/worker-audio
pnpm wrangler login
pnpm wrangler r2 bucket create lowbatterytown-audio --location apac
pnpm wrangler secret put AUDIO_PROXY_SECRET   # same value as backend
pnpm wrangler deploy
```

DNS: in the Cloudflare dashboard, add `audio.lowbatterytown.com` as a
Worker custom domain pointing at `lowbatterytown-audio`.

## Develop locally

```bash
pnpm dev          # wrangler dev with miniflare R2
pnpm test         # vitest + vitest-pool-workers
pnpm typecheck
```

## Contract

The token claim set is owned jointly with
`backend/app/domain/services/audio_token_service.py`. When changing
the JWT shape, update both sides.
