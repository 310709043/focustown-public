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
The visitor sees an explicit companion invitation and can accept or
keep waiting. Invitations expire after 60 seconds; normal visitor matching
continues and cancels an offer if it finds a partner first. One administrator
socket, one pending invitation or one conversation at a time. The newest console takes over (the old one closes with 4409), and duty survives a same-tab reload. Before inviting, select the fixed persona **男生 · 小辟穀** or **女生 · 打辟穀**.
The visitor sees that nickname and a neutral companion label, without the
administrator role; the internal report record retains the privileged role for
safety review. The invitation snapshots the chosen persona through acceptance
and reconnect. The host joins the real online count only while on duty,
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

## Reviewed anonymous-code restrictions

After reviewing a report in `/admin`, submit a reason and suspend its reported
guest code for 24 hours or 7 days. An active restriction can be revoked from the
report that last applied it, with a reason. Every restriction/revocation and
report-status change has append-only history, retained with the report for the
configured 180 days. D1 batches atomically save the restriction, audit entry and
report status. The town caches active restrictions on activation; moderation
RPCs serialize updates with socket events. Restricted codes are removed from
queues/invitations, active chats end, and join/companion/reconnect paths enforce
the restriction until expiry. The daily purge removes expired restrictions and
old reports (history cascades with the report). Apply migration
`0002_lbt_moderation.sql` before deploying this API version.

This is not a permanent person/device ban: new anonymous codes and browsers
can bypass it; existing guest credentials expire after 24 hours. No new IP or
device fingerprint linkage is collected. `actioned` remains a review status;
only the dedicated moderation form actually restricts matching.

## Security hardening

The admin console exchanges `ADMIN_TOKEN` for a Secure, HttpOnly, SameSite=Strict,
host-only cookie lasting 12 hours. Logout revokes that session server-side.
Changing `ADMIN_TOKEN` invalidates existing sessions and unconsumed companion
tickets; it does not terminate an already-established socket. Reload the admin
console after deploying this upgrade: it removes the legacy cached password.
Use a password manager to generate a unique administrator password of at least
20 characters. Set it interactively with `pnpm exec wrangler secret put ADMIN_TOKEN`;
never put it in a file, shell argument, GitHub comment or chat. CLI bearer access
remains available; failed guesses share the per-IP login limit (10 / 15 minutes).
Cookie sessions that are already authenticated remain usable during a lockout.

Companion tickets are five-minute, purpose-separated JWTs signed with strong
server secret material, rather than with the administrator password alone.
Guest JWTs only travel in WebSocket subprotocols or Authorization headers, never
in query strings. Cross-origin browser writes and socket handshakes are rejected.
CORS is not bot protection: non-browser clients can omit or forge Origin.

JSON requests are bounded to 16 KiB including chunked bodies, inbound frames
to 8 KiB and 120 frames per guest/minute, and live sockets to two per guest.
Existing message/token/report/feedback limits also apply. Spreadsheet forwarding
only posts to Apps Script and follows a single approved Google echo redirect;
it has a ten-second timeout, a bounded response and sanitized failure logs.
SQL uses parameter bindings, and user text is rendered as text in both consoles.

Both Workers disable workers.dev and preview URLs. CI scans dependencies;
Dependabot proposes updates targeting develop. See
`docs/security/lbt-security-review-2026-10-04.md` for verification and limitations.
