# V1 Security Roadmap

**Generated**: 2026-05-20 via 5 parallel security-reviewer agents covering backend auth/secrets, backend API input/injection, backend domain/DB, frontend XSS/CSP/token, and infra/Dockerfiles/CI.

**Total findings**: 13 P0 / 20 P1 / 22 P2.

**Risk posture**: backend domain + API are the highest-risk surfaces. Frontend is low-risk (0 P0). Infra has solid base (non-root containers, OIDC, public-access-block, HSTS) but two cross-env permission scopes need narrowing.

## Phase split

| Phase | Scope | Status | Effort | Branch |
|---|---|---|---|---|
| **1** | 7 critical-path P0 fixes (bounded, &lt;30 min each) | **THIS PR** | ~3-4h | `fix/security-phase-1-critical-path` |
| **2** | 3 hard P0s requiring design (refresh-jti, wallet atomicity, EventBus outbox) | TODO | ~2 days | `fix/security-phase-2-hard-p0` |
| **3** | AWS / GitHub config changes (operator action, not code) | TODO | ~1h ops | n/a — runbook |
| **4** | 20 P1 schema bounds + rate limits + hardening | TODO | ~4h | `fix/security-phase-4-p1-bundle` |
| **5** | 22 P2 backlog | TODO | ad-hoc | individual PRs |

---

## Phase 1 — Critical-path P0 (this PR)

These have **CRITICAL exploitability** (any authenticated or unauthenticated user can trigger) and **bounded fix** (single file or single migration). Order chosen so each commit is independently reviewable.

| # | Finding | File | Fix |
|---|---|---|---|
| 1 | **PII leak** — `GET /users/{id}` returns `email` without auth | `backend/app/api/v1/users/router.py:41-53` + `schemas.py:14-19` | Add `CurrentUserId` dep; drop `email` from `UserResponse` (only `display_name`, `id`, `character_key` public) |
| 2 | **WS join unrestricted** — any auth'd user subscribes to any `invite_only` `room:{id}` channel | `backend/app/api/v1/ws/router.py:138-141` | Gate `join` through `RoomVisitService.is_member_or_owner(user_id, room_id)`; reject with `4403` close on fail |
| 3 | **WS chat flood + impersonate** — no membership, no rate-limit, no length bound | `backend/app/api/v1/ws/router.py:129-137` | Re-use the same membership gate; per-user token bucket (e.g. 30 msg / 60s); `text` truncated server-side to 2000 chars |
| 4 | **Sessions partner unverified** — `partner_user_id` accepted without Match check, pollutes activity attribution | `backend/app/api/v1/sessions/router.py:48-55` + `focus_session_service.py:32-58` | Service-layer: require an `ACCEPTED` Match between `user_id` and `partner_user_id` before persist; schema: `Field(min_length=1, max_length=36)` |
| 5 | **Sweep race** — `sweep_abandoned` can fire after `complete()` on the same session, double-credits achievements | `backend/app/domain/services/focus_session_service.py:97-116` + repo | Tighten `update_status` SQL to `WHERE status = 'active'`; sweep emits `SessionAbandoned` only when affected_rows == 1 |
| 6 | **Gift idempotency** — double-click duplicates the transfer; partial unique on wallet_txns excludes `gift_*` | `backend/app/domain/services/gift_service.py:73-99` + new alembic migration | Extend `ux_wallet_txn_idempotent` to include `'gift_sent', 'gift_received'`; `pair_id` becomes `ref_id` |
| 7 | **Prod compose secret literal** + **caddy root** | `docker-compose.prod.yml:46,79`; `infra/lightsail/caddy/Dockerfile:10-11` | Compose: `${APP_SECRET_KEY:?required}`; caddy: add `USER nobody` |

---

## Phase 2 — Hard P0 (separate PR)

| Finding | Effort | Notes |
|---|---|---|
| **Refresh token has no `jti`, no revocation, no rotation** (`local_jwt.py:36-43`) | 1 day | Requires Redis schema for revocation list, `/logout` endpoint, family-detection logic, password-reset bump epoch. Will block prod (currently dev only). |
| **Wallet `_apply` non-atomic** — ledger row can be lost while balance moved (`wallet_service.py:114-130`) | 4h | Audit, add a domain-level invariant test, wrap in SAVEPOINT, consider Postgres trigger for balance/ledger consistency |
| **EventBus exceptions swallowed** — `CoinAwardService` may silently never run (`core/events.py:29-49`) | 1 day | Outbox pattern: persist `pending_events` row inside same request tx, drain via worker. Alternative: synchronous in-request handlers + alerting on `event_handler_failed`. |

---

## Phase 3 — AWS / GitHub config (operator action)

Not code changes — these require AWS console / GitHub repo settings access.

| Finding | Action |
|---|---|
| **Long-lived AWS access keys baked into LCS env** (`bootstrap.md:178-205`) | Set up 90-day rotation pipeline; document in `bootstrap.md` §5 |
| **Dev/prod GitHub Environments have no deployment branch protection** | Settings → Environments → `dev`: restrict deploys to `develop` branch only; `production`: `main` only |
| **ECR `MUTABLE` tags** allow attacker to replace `:latest` retroactively | `aws ecr put-image-tag-mutability --image-tag-mutability IMMUTABLE` on both repos |
| **Single IAM user `lowbatterytown-app` spans dev + prod** for SES + S3 | Split into `lowbatterytown-app-prod` + `-dev`; scope `s3:*` to `/prod/*` or `/dev/*` prefix; `ses:SendEmail` Condition on FromAddress |
| **Action versions not pinned to SHA** (configure-aws-credentials@v4 etc.) | Switch to commit-SHA pins via Dependabot's "pin GHA to SHA" mode |
| **Redis exposed inside LCS without AUTH** | Add `--requirepass ${REDIS_PASSWORD}` to redis command; update REDIS_URL |

---

## Phase 4 — P1 bundle (separate PR)

20 fixes, mostly schema bounds + rate limits. Examples:

- All `Field(...)` strings missing `max_length` (UUIDs → 36, free-form codes → 64)
- Numeric upper bounds (`gift.amount_minor le=100_000` matching service cap)
- Per-user rate limits on `/wallet/{redeem,gift}`, `/shop/purchase`, `/matches/auto`, `/friends/requests`, `/match/{id}/messages`, `/tracks/stream`, `/feedback`
- `Literal[...]` enums for `match_realtime/schemas.py:24,52` (`status`, `kind`)
- `ProxyHeaders` middleware fixed `client.host` extraction across all rate-limit checks
- AchievementRepo `await self._s.rollback()` → SAVEPOINT (same pattern in `room_visit_repo`, `room_item_repo`)
- Trusted proxy narrowing (`/12` → caddy sidecar only) — currently shipped as P1 not P0 since LCS isolates per-service
- LogNotifier `body` field added to `_SENSITIVE_KEY_PARTS`
- 13 more (full list in security-reviewer agent transcripts)

---

## Phase 5 — P2 backlog

22 items. All low-exploitability hygiene. Treat as long-tail tickets.

Examples:
- JWT add `iss`/`aud` claims
- Password policy raise to 12 chars OR pwnedpasswords check
- Bcrypt rounds pinned explicitly
- Reset token conditional update (TOCTOU)
- 429 `Retry-After` header
- `/docs` proxied to prod (already blocked at backend, remove Caddy handler)
- Backend image carries `curl` in runtime
- `scripts/deploy-dev.sh` state.env perms check
- `scripts/dedup-dev-tracks.sh` PG URL exposed in `ps`
- frontend access_token + refresh_token both in localStorage
- 11 more

---

## Verified-safe (callout)

Across the 5 agents, the following were explicitly checked AND found clean — do not redo this work:

- JWT algorithm whitelist (no `alg=none`)
- Password hash uses bcrypt with proper salt + verify
- Reset token: 256-bit entropy, SHA-256 storage, never logged raw
- Account enumeration: silent `/forgot-password`, single `invalid_credentials` for `/signin`
- Email header injection: schema-level control char block + `_sanitize_for_email`
- OpenAPI hidden in prod (`docs_url=None`)
- Cognito provider correctly rejects `id` tokens, enforces issuer + client_id, JWKS cached
- WS auth via `Sec-WebSocket-Protocol` header (not URL query)
- No raw SQL with f-string interpolation anywhere in backend
- Frontend: zero `dangerouslySetInnerHTML` / `eval` / `Function` in app code
- Frontend: every `target="_blank"` has `rel="noopener noreferrer"`
- CSP correctly bans `'unsafe-eval'` and external `script-src` in prod
- Wallet `CHECK balance &gt;= 0` + `adjust()` `WHERE balance + delta >= 0`
- Friendship pair invariant: `CHECK (user_low_id < user_high_id)` + `UNIQUE(low, high)`
- Redemption per-user uniqueness: `UNIQUE(code_id, user_id)`
- Match member-gate consistent across NoteService / MatchChatService / MatchAgendaService
- Room ownership: `_assert_owner` on Decoration / Playback / Track services
- LCS public endpoint only exposes caddy:80
- `.dockerignore` excludes `.env`, `.git`, caches comprehensively
- Backend + frontend Docker runtime drop to non-root `app` user

---

## Sources

- `~/.claude/projects/.../tasks/abc802a33d2254848.output` (Auth)
- `~/.claude/projects/.../tasks/afd6fe6c19061ea8a.output` (API)
- `~/.claude/projects/.../tasks/a73066471dcf2615b.output` (Domain)
- `~/.claude/projects/.../tasks/ac1d9689390037da4.output` (Frontend)
- `~/.claude/projects/.../tasks/ab26daff917e3d574.output` (Infra)
