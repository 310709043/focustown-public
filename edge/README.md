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
pnpm test          # rules, session logic and full API over real WebSockets inside workerd
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

### Human administrator companion

In `/admin`, click **開始陪聊值班**, then invite a visitor from the waiting list.
The visitor sees an explicit human administrator invitation and can accept or
keep waiting. Invitations expire after 60 seconds; normal visitor matching
continues and cancels an offer if it finds a partner first. One administrator
socket, one pending invitation or one conversation at a time. The host is
server-labelled **小鎮管理員**, joins the real online count only while on duty,
and chats directly in the console. Seven-minute windows, mutual extensions,
leaving, contact masking and reporting use the existing session rules.

Only waiting profiles are exposed by `GET /api/v1/admin/lbt/waiting`; there is
no access to other active conversations through this feature. The console
exchanges `ADMIN_TOKEN` for a five-minute, socket-only ticket via
`POST /api/v1/admin/lbt/companion/token`. Tickets use a separate token type
and the same-origin `.../companion/ws` endpoint; neither password nor ticket
is sent in a URL. Pending invitations live in Durable Object storage and
are replayed across reconnects. Logging out or ending duty leaves the chat.

This extension is Cloudflare-only; the legacy FastAPI implementation is
unchanged. The frontend still works with it, but receives no host invitations.
To run the opt-in browser test against a local Worker, provide
`PLAYWRIGHT_API_BASE_URL`, `PLAYWRIGHT_BASE_URL`, `PLAYWRIGHT_NO_SERVER=1` and
`PLAYWRIGHT_COMPANION_ADMIN_TOKEN` in the environment, then run
`pnpm exec playwright test e2e/lbt-companion.spec.ts` from `frontend/`.
Do not retain administrator traces/videos or commit any credentials.

Same data over the API:

```bash
curl -H "Authorization: Bearer $ADMIN_TOKEN" https://api.lowbatterytown.com/api/v1/admin/lbt/overview
curl -H "Authorization: Bearer $ADMIN_TOKEN" "https://api.lowbatterytown.com/api/v1/admin/lbt/reports?status=open"
curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" -d '{"status":"reviewed"}' \
  "https://api.lowbatterytown.com/api/v1/admin/lbt/reports/<id>/status"
```

Guests are anonymous and a new guest token is free, so there is no account to
ban: a report already ends the chat and keeps the pair apart for 24 h.

## Chat data retention

Cloudflare live chat messages and both pairing profiles are deleted when either
participant leaves, the session expires (after its existing extension grace),
or the reconnect window expires. Browsers clear their chat on the end/idle
event; an offline browser reconciles on reconnect. Old 24-hour closed-chat
records are purged on Durable Object activation and sweeps. Reports must be
submitted during the chat: D1 stores the evidence before the live copy is
deleted. Report evidence retains the configured 180-day default and daily
purge; pair blocks last 24 hours. Guest credentials, presence, abuse counters
and provider technical logs follow their separate lifetimes. Application
deletion is not a promise of instant erasure from provider recovery backups or
other users' screenshots. This policy applies to `edge/`, not the retired AWS
backend.
