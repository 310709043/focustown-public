# LowBatteryTown API on Cloudflare (`edge/`)

The anonymous 1:1 chat behind `/`, as a Cloudflare Worker at
`api.lowbatterytown.com`. It replaces the FastAPI + Redis + Postgres stack for
LowBatteryTown with the same HTTP routes and WebSocket frames, so
`frontend/lib/lbt/liveTransport.ts` talks to it unchanged.

| Piece | File |
|---|---|
| Routes, CORS, guest tokens, admin API, daily purge cron | `src/index.ts` |
| The town: every socket + all live state, one Durable Object | `src/townObject.ts` |
| Session logic (pair, relay, extend, leave, report, sweep) | `src/town.ts` (port of `backend/app/domain/services/lbt_service.py`) |
| Pure rules (cleaning, masking, pairing, opening hours) | `src/rules.ts` (port of `lbt_rules.py`) |
| State layout in Durable Object storage | `src/store.ts` |
| Reports in D1 | `src/reports.ts`, `migrations/` |

One Durable Object handles events one at a time, so pairing and the mutual
extend vote need no locks. Sockets use the hibernation API; an alarm sweeps
every 3 s while anyone is waiting or chatting (ends timed-out or abandoned
chats, drops absent waiters, relaxes pairing after 30 s) and every 15 min
otherwise to expire day-old state.

## Develop

```bash
cd edge
pnpm install
pnpm test          # 136 tests inside workerd: rules, session logic, full API over WebSockets
pnpm typecheck
printf 'LBT_TOKEN_SECRET=%s\n' "$(openssl rand -hex 24)" > .dev.vars
npx wrangler d1 migrations apply lbt --local
npx wrangler dev --port 8787 --var ALLOWED_ORIGINS:http://localhost:3000
# frontend against it:
cd ../frontend && NEXT_PUBLIC_API_BASE_URL=http://localhost:8787 NEXT_PUBLIC_WS_BASE_URL=ws://localhost:8787 pnpm dev
PLAYWRIGHT_REAL_STACK=1 pnpm playwright test e2e/lbt-live.spec.ts   # two real browsers
```

## Deploy

First time, with `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` set:

```bash
edge/scripts/bootstrap.sh   # creates D1 "lbt", applies migrations, deploys, sets a random LBT_TOKEN_SECRET
git add edge/wrangler.jsonc && git commit -m "chore(edge): pin D1 database id"
npx wrangler secret put ADMIN_TOKEN   # optional: enables /api/v1/admin/lbt/*
```

After that, `.github/workflows/edge.yml` tests every PR touching `edge/` and
deploys on push to `develop` (repo secrets `CLOUDFLARE_API_TOKEN`,
`CLOUDFLARE_ACCOUNT_ID`).

Token permissions: Account → Workers Scripts: Edit, D1: Edit; Zone
`lowbatterytown.com` → Workers Routes: Edit, DNS: Edit.

## Settings (`vars` in wrangler.jsonc)

`ALLOWED_ORIGINS`, `LBT_OPEN_HOURS` (`"21:00-24:00"`, empty = always open; a
bad value fails every request loudly), `LBT_TIMEZONE`, `LBT_SESSION_SECONDS`,
`LBT_GUEST_TOKEN_TTL_HOURS`, `LBT_REPORT_RETENTION_DAYS` (keep in step with
`frontend/lib/lbt/legal.ts`). Abuse limits are in `src/config.ts`.

## Admin console

`https://api.lowbatterytown.com/admin`: sign in with `ADMIN_TOKEN`
(`npx wrangler secret put ADMIN_TOKEN`; kept in the tab's sessionStorage only).
It shows live numbers (online, waiting, open conversations, reports) and every
report with both profiles, the note and the transcript, and lets you mark it
reviewed / actioned / dismissed. It refreshes every 30 s. The page builds all
report content with `textContent` (it is user-written) under a nonce-only CSP.

Same data over the API:

```bash
curl -H "Authorization: Bearer $ADMIN_TOKEN" https://api.lowbatterytown.com/api/v1/admin/lbt/overview
curl -H "Authorization: Bearer $ADMIN_TOKEN" "https://api.lowbatterytown.com/api/v1/admin/lbt/reports?status=open"
curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" -d '{"status":"reviewed"}' \
  "https://api.lowbatterytown.com/api/v1/admin/lbt/reports/<id>/status"
```

Guests are anonymous and a new guest token is free, so there is no account to
ban: a report already ends the chat and keeps the pair apart for 24 h.
