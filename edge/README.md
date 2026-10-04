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
| Feedback box (D1 + copy to a Google Sheet) | `src/feedback.ts`, `scripts/feedback-sheet.gs` |

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
`LBT_GUEST_TOKEN_TTL_HOURS`, `LBT_REPORT_RETENTION_DAYS` and
`LBT_FEEDBACK_RETENTION_DAYS` (keep both in step with
`frontend/lib/lbt/legal.ts`). Abuse limits are in `src/config.ts`.

## Feedback box

`POST /api/v1/lbt/feedback` takes `{category: idea|bug|other, message (≤1000),
email?, page?, locale?}` with no account, limited to 5 per IP per hour; a
filled `website` field (honeypot) is answered 201 and dropped. Each entry is
stored in D1 (`lbt_feedback`, purged after `LBT_FEEDBACK_RETENTION_DAYS`),
shown under 意見箱 in `/admin`, and copied to the owner's Google Sheet in the
background when both secrets are set:

1. Open the sheet → Extensions → Apps Script, paste `scripts/feedback-sheet.gs`.
2. Script properties: `FEEDBACK_SHEET_TOKEN` = a long random value.
3. Run `setup` once: it creates the sheet and a daily trigger (`purgeOld`) that
   deletes rows older than `RETENTION_DAYS` (365), so the sheet copy expires
   with the D1 row as the privacy policy promises.
4. Deploy → Web app (Execute as: Me, Who has access: Anyone) → copy the `/exec` URL.
5. `npx wrangler secret put FEEDBACK_SHEET_URL` (the URL) and
   `npx wrangler secret put FEEDBACK_SHEET_TOKEN` (the same random value).

The sheet is a convenience: if it is down, the D1 row stays (admin shows
whether each entry reached the sheet).

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
socket, one pending invitation or one conversation at a time. The newest
console takes over (the old one is closed with 4409 and stops, so a tab left
on duty or a sleeping phone never locks you out), and duty survives a reload
of the same tab, keeping an open chat. The host is
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
