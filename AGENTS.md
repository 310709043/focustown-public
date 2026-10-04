# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## What this is

Focus Town — Pomodoro-based social focus app. Pixel-city UI, live leaderboards, partner matching, shared focus rooms with realtime chat. Frontend = Next.js 15 (App Router). Backend = FastAPI + SQLAlchemy 2 async. Postgres + Redis. The original 1318-line single-file UI prototype was the source of visual/interaction design; it has been removed from the working tree but is preserved in git history at `82880df:reference.html` (recover with `git show 82880df:reference.html > reference.html`).

## LowBatteryTown front door (current `/`)

The home route `/` is **LowBatteryTown**: a low-pressure anonymous 1:1 chat for people with a low "social battery". `/` pairs **real people** through the backend; `/demo` (noindex) runs a clearly labelled scripted partner with no backend. Source of the design: the handoff prototype (deep-blue night town, street lamps, expressive animated battery, zh-Hant first).

Frontend (`frontend/`):

- `app/[locale]/page.tsx` (live) and `app/[locale]/demo/page.tsx` (demo) → `components/lbt/LbtApp.tsx`. Styles: `components/lbt/lbt.css`, scoped under `.lbt`, keyframes prefixed `lbt-`; it scrolls inside its own fixed container because `globals.css` pins `html, body` to `overflow: hidden`.
- `lib/lbt/sessionStore.ts` applies events from an `LbtTransport` port (`lib/lbt/transport.ts`) and sends intents. Adapters: `liveTransport.ts` (anonymous guest token + one WebSocket, heartbeat, reconnect, server-clock conversion) and `demoTransport.ts` (the script). The store holds ids and codes, never localised strings.
- Policies: `/policies/{privacy,terms,guidelines}` (`app/[locale]/policies/[slug]/page.tsx` → `components/lbt/PolicyPage.tsx`, copy under `lbt.policy`, facts such as retention days and the contact address in `lib/lbt/legal.ts`; contact overridable via `NEXT_PUBLIC_LBT_CONTACT_EMAIL`). Linked from the footer and the 18+ checkbox. Change the numbers there whenever the backend TTLs or `LBT_REPORT_RETENTION_DAYS` change.
- Copy: `messages/{zh-TW,en}/lbt.json` (namespace `lbt`). The product voice is casual "你" on purpose, unlike `docs/i18n/bilingual-seo-copywriting-guidelines.md` ("您").
- Fonts: `lib/lbtFonts.ts`, applied only to this surface. Brand: the battery-"B" logo is `components/lbt/BrandMark.tsx` (inline SVG, header wordmark in Quicksand) and `public/brand/` (mark SVG, favicons, app/maskable icons, `og-lbt.png`); `public/logo*.png` and `og-image.png` are the legacy Focus Town art.

Production backend: Cloudflare (`edge/`). LowBatteryTown is moving off AWS: the chat API runs as a Cloudflare Worker at `api.lowbatterytown.com` (one Durable Object holds every socket and all live state; reports in D1; daily purge cron). It is a port of the FastAPI code below with identical routes and frames, so the frontend is unchanged. Change behaviour in **both** places until the FastAPI version is retired, and keep `edge/test/` in step with `backend/tests/unit/test_lbt_*.py`. Details: `edge/README.md`.

Backend (`backend/`), separate from the Focus Town matching:

- Domain: `domain/models/lbt.py` (`LbtConversation` with mutual `request_extend`), `domain/services/lbt_rules.py` (input cleaning, `compatibility`/`pick_partner`, opening hours), `domain/services/lbt_service.py` (join → pair → relay → extend → leave/report, `sweep`, reconnect replay). Ports in `domain/repositories/lbt.py`.
- Adapters: `infrastructure/lbt/redis_store.py` (all live state in Redis with TTLs; pairing under a `SET NX` lock), `infrastructure/db/repositories/lbt_report_repo.py` + table `lbt_reports` (migration 0032).
- API: `api/v1/lbt/router.py` — `POST /lbt/guest` (anonymous token, `type: lbt_guest`, rejected by the user AuthProvider and vice versa), `GET /lbt/status` (real online/waiting counts, open flag), `POST /lbt/reports`, `WS /lbt/ws` (subprotocol `bearer.{token}`). Admin review: `GET /admin/lbt/reports`, `POST /admin/lbt/reports/{id}/status`.
- Worker job `lbt_sweep` (every `LBT_SWEEP_INTERVAL_SECONDS`): ends conversations past the grace period or whose partner has been gone for `LBT_OFFLINE_AFTER_SECONDS`, drops absent waiters, pairs whoever is left. Daily `lbt_report_purge` deletes reports older than `LBT_REPORT_RETENTION_DAYS` (180).
- Settings (`LBT_*` in `core/config.py`): `LBT_OPEN_HOURS` ("21:00-24:00" style, empty = always open; a bad value fails startup), `LBT_TIMEZONE`, session/grace/relax/offline seconds, rate limits for guest tokens, messages and reports.

The original Focus Town routes live in `app/[locale]/(legacy)/` (URLs unchanged); that group's layout carries the pixel-city chrome and sets `noindex`.

Product rules to keep (from the handoff — do not change without asking the owner):

- Traditional Chinese, mobile and desktop; anonymous, editable nickname, no sign-up. Beta is 18+ (self-declared checkbox, enforced server-side too).
- Three social batteries (快沒電了 / 還有一點 / 想說說話) tell the other person the reply pace; they are not identity or a score. Chat intent is chosen separately (隨意聊聊 / 有人聽我說 / 聽聽別人的故事).
- Every message names its sender; the chat shows both nicknames, batteries and intents. First window is 7 minutes, extended only when **both** press extend; leaving ("說聲晚安") is always possible.
- No fake people and no fake numbers. Never reuse the legacy `bot_reply_service` here. The demo partner is always labelled "模擬對象". Head counts are real or hidden (the prototype artifact counts people who have the page open).
- Reports end the chat, snapshot the transcript to `lbt_reports`, and block the pair for 24 h. Owner-approved Cloudflare rule (2026-10-04): ended conversations and transcripts are deleted immediately, and browser chat state is cleared. Reports must be submitted before the chat ends; only report evidence is kept for review. The legacy FastAPI implementation is unchanged during the AWS retirement. Crisis lines (1925 / 1995) stay visible in the chat aside and the report dialog.
- Support ("替小鎮點燈"): single voluntary payments of **NT$60 / 150 / 300**, no recurring charge, no extra benefits, no fake supporter counts or progress. Checkout stays **disabled** while `SUPPORT_CHECKOUT_LINKS` in `lib/lbt/support.ts` is empty. Enabling it needs an approved payment provider's fixed-amount https links, a published operator identity, a contact address and payment/refund terms (the existing `/legal/*` pages describe Focus Town, not this product).
- User text is rendered as React text only; never put nickname or message content into `dangerouslySetInnerHTML`.

Checks for this surface: backend `pytest tests/unit/test_lbt_*.py` and `tests/integration/realtime/test_lbt_redis_store.py` (real Redis); frontend `npx vitest run tests/unit/lib/lbt tests/unit/components/lbt`; `e2e/lbt-flow.spec.ts` (demo, no backend); `PLAYWRIGHT_REAL_STACK=1 pnpm playwright test e2e/lbt-live.spec.ts` (two real browsers against the full stack; the database must be UTF-8).

Known gaps: no admin UI page for reports yet (API only), no keyword filter (links, e-mails, @handles and phone numbers are masked server-side by `lbt_rules.mask_contacts`), no device-level bans beyond the 24 h pair block, legacy Focus Town pages and their dead components still in the tree, the old landing visual baseline is skipped until CI regenerates it.

## Common commands

Run everything (Docker, recommended):

```bash
cp .env.example .env
docker compose up --build -d
docker compose exec backend alembic upgrade head
docker compose exec backend python /app/../scripts/seed-dev-data.py   # optional seed
docker compose logs -f backend         # tail one service
docker compose ps                       # all 5 services should be healthy/running
```

Standalone (for hot-reload speed):

```bash
# backend (Python 3.12)
cd backend && pip install -e ".[dev]" && alembic upgrade head && uvicorn app.main:app --reload

# frontend (Node 20 + pnpm)
cd frontend && pnpm install && pnpm dev
```

Quality gates (mirror CI):

```bash
cd backend && ruff check . && pytest -q
cd frontend && pnpm typecheck && pnpm lint && pnpm build
```

Run a single backend test:

```bash
cd backend && pytest tests/unit/test_focus_session_service.py::test_complete_transition -q
```

Create a new Alembic migration after editing ORM models:

```bash
cd backend && alembic revision --autogenerate -m "add_xyz"
# review generated file under backend/alembic/versions/ before running upgrade
```

Regenerate the frontend's typed OpenAPI client (backend must be running on :8000):

```bash
./scripts/gen-api-types.sh   # writes frontend/lib/api/types.gen.ts
```

Open `http://localhost:8000/docs` for SwaggerUI, `http://localhost:3000` for the app.

## Architecture (the part that requires reading multiple files)

### Backend: ports & adapters (hexagonal), enforced by import direction

The backend is split into three layers with a one-way dependency rule:

```
api/v1/  ──depends on──>  domain/  <──depends on──  infrastructure/
   │                         │                            │
   HTTP DTOs              Protocols                   concrete adapters
   thin routers           services                    (SQLAlchemy, Redis,
                          strategies                   JWT, APScheduler,
                          events                       S3, SES, ...)
```

- **`app/domain/`** is pure business. It imports nothing from FastAPI or SQLAlchemy. It defines repository **Protocols** (`IUserRepo`, `IFocusSessionRepo`, ...), domain models (only for entities with behavior — `User`, `FocusSession`, `Match`), services (`FocusSessionService`, `MatchingService`, ...), strategies (`ICompatibilityStrategy` + `SimpleOverlapStrategy`), and event dataclasses.
- **`app/infrastructure/`** holds concrete adapters that implement those Protocols. Pattern: each port lives under its own subdir with a `base.py` (Protocol) and one or more impls. The pre-built swap points are:

  | Port | MVP impl | Future impl |
  |---|---|---|
  | `AuthProvider` | `LocalJWTProvider` | `CognitoProvider` (stub) |
  | `IFileStorage` | `LocalFSStorage` | `S3Storage` (stub) |
  | `INotificationService` | `LogNotifier` | `SESNotifier` / `SNSNotifier` |
  | `ISecretsProvider` | `EnvSecretsProvider` | `AWSSecretsManagerProvider` |
  | `IRealtimePublisher` | `RedisPubSubPublisher` | same (just point at managed Redis) |
  | `IJobScheduler` | `APSchedulerAdapter` | `EventBridgeAdapter` |
  | `IClock` / `IIdGenerator` | `SystemClock` / `UUID4Generator` | injected for testing |

- **`app/api/v1/`** has per-feature subpackages (`auth/`, `sessions/`, `notes/`, `matches/`, ...). Each has `router.py` + `schemas.py`. Routers stay thin: validate input, instantiate the service with concrete repos pulled from `app/core/deps.py`, return DTOs. The `_service(...)` helper inside each router is the only place that wires concrete adapters to the abstract service.

**When extending business logic**, work in `domain/services/` against Protocols. Never import `sqlalchemy` or `fastapi` inside `domain/`. Add a new repository method by editing the Protocol first, then the SQL impl in `infrastructure/db/repositories/`.

### Pragmatic dual-model exception

Not every entity gets a separate domain model. The rule used here:

- **Dual model (domain dataclass + ORM)**: `User`, `FocusSession`, `Match` — they carry behavior (`can_transition_to`, `remaining_seconds`, etc.) and benefit from being framework-free.
- **ORM-only (used directly as the entity)**: `Note`, `Achievement`, `ShopItem`, `UserAchievement` — pure CRUD. The repository returns a small dataclass record (`NoteRecord`, etc.) just to avoid leaking ORM objects across layers, but there's no behavior worth duplicating.

When adding new entities, ask "does it have non-trivial state transitions or invariants?" If no, follow the ORM-only pattern.

### Dependency injection flow

FastAPI's `Depends` is the wiring mechanism. Everything routes through **`backend/app/core/deps.py`**:

- `get_db` opens an `AsyncSession` per request, commits on success, rolls back on exception
- `get_auth_provider` dispatches on `settings.auth_provider` (env-driven) to pick `LocalJWTProvider` vs `CognitoProvider`
- `get_current_user_id` parses the `Authorization: Bearer ...` header through the chosen provider
- `get_ws_manager` returns a process-singleton `WSManager`
- `get_event_bus` returns the process-singleton in-memory `EventBus`

If you add a new port, expose a `getX` function in `deps.py` and a `XDep = Annotated[X, Depends(getX)]` alias. Routers should only touch the alias, never instantiate adapters directly.

### Realtime (WebSocket + Redis Pub/Sub)

`api/v1/ws/router.py:ws_connect` is the single WebSocket endpoint. Per process there are two things:

1. **`WSManager`** (`infrastructure/messaging/ws_manager.py`) — `dict[user_id, set[WebSocket]]`, only knows about sockets connected to *this* process.
2. **`RedisPubSubPublisher`** (`infrastructure/messaging/pubsub.py`) — subscribes to `user:{id}` + `room:{id}` channels and forwards published payloads into the local `WSManager`.

To deliver a message to a user from anywhere (e.g. from `MatchingService`), publish through `IRealtimePublisher.publish("user:abc", payload)`. **Do not** try to send through a `WebSocket` directly outside the router — only the connected process owns the socket. The redis-pub/sub bridge handles cross-process fan-out and lets us scale horizontally without sticky sessions becoming load-bearing.

### Event bus

`app/core/events.py:EventBus` is a synchronous async dispatcher. Domain services publish dataclass events (`SessionCompleted`, `MatchAccepted`, ...) and subscribers in `AchievementService` etc. react. This decouples cross-feature reactions without coupling services to each other. v2 swap path: Redis Streams or EventBridge — keep the subscriber signature `(event) -> Awaitable[None]` stable.

### Worker process

`backend/app/worker.py` is a separate container in `docker-compose.yml`. It runs `APSchedulerAdapter` jobs (60-second abandoned-session sweep at MVP). Long-running cron logic belongs here, **not** in FastAPI `BackgroundTasks` (which die with the request). To add a job, define a coroutine in `worker.py` and call `scheduler.schedule_interval(...)` or `schedule_cron(...)`.

### Consent, password reset, and rate limiting

`/signup` records consent (`terms_accepted_at`, `terms_version`, `marketing_opt_in`); the frontend sends `terms_version` from `frontend/lib/config/legal.ts:LEGAL.termsVersion` and the backend rejects on mismatch. Bump that constant whenever the legal pages change materially.

Password reset flow:

1. `/forgot-password` → `PasswordResetService.request_reset` generates a `secrets.token_urlsafe(32)` raw token, stores only `sha256(token)` in `password_reset_tokens`, invalidates any prior active token for the user, then dispatches via `INotificationService.send_email`. Endpoint always returns `{ok: true}` to prevent email enumeration.
2. `/reset-password` → service validates token (active, not expired, not consumed), enforces `validate_password_strength`, updates `users.password_hash`, marks token consumed (single-use).

`INotificationService` lives in `app/domain/notifications.py` (not `infrastructure/`) so domain services depend only on the port. To switch from `LogNotifier` to `SESNotifier`, change `get_notifier()` in `core/deps.py` — no service-layer changes.

Auth endpoints are rate-limited via `IRateLimiter` (Redis-backed in prod, `MemoryRateLimiter` for tests). Limits live in `api/v1/auth/router.py`; tune them there. The 429 response is wrapped in the standard `LowBatteryTownError` envelope.

`SecurityHeadersMiddleware` (`core/middleware/security_headers.py`) adds `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy` to every API response; HSTS only fires when `APP_ENV=production`. The frontend CSP lives in `frontend/next.config.mjs` and reads `NEXT_PUBLIC_API_BASE_URL` to whitelist the backend in `connect-src`.

### Frontend: feature-scoped state + transport seams

- **State**: per-feature Zustand stores in `frontend/lib/state/` (`authStore`, `timerStore`, `sceneStore`, `matchStore`). Don't add one mega-store.
- **API transport**: `frontend/lib/api/client.ts` is the only place that touches `fetch`. It auto-attaches the bearer token from `tokenStore`, transparently retries once with a refreshed token on 401, normalizes error shape into `ApiError`. Endpoint wrappers live in `lib/api/endpoints.ts` and consume **generated** types from `lib/api/types.gen.ts`.
- **WebSocket transport**: `lib/ws/client.ts` is a singleton with exponential-backoff reconnect. Components subscribe via `useRealtime((msg) => {...})` — they never touch `WebSocket` directly.
- **Scene system**: `lib/data/scenes.ts` defines each scene's gradients/opacity tokens; `useSceneStore` cycles through `SCENE_ORDER`. Scene-aware components (`Sky`, `StarsLayer`, `Moon`, `WeatherBadge`) just read `current` from the store. Adding a new scene = add one entry to both `SCENES` and `SCENE_ORDER`, no component changes.

### What lives at the root vs in services

- `frontend/app/globals.css` ports the CSS custom properties from `reference.html` (`--bg`, `--a1..a4`, `--teal`, `--pink`, etc.). Tailwind exposes them as `bg-bg`, `text-accent-2`, etc. via `tailwind.config.ts`.
- Global CRT/grain/vignette overlays live in `app/layout.tsx`. Anything full-screen goes there, not in individual pages.

## Conventions and gotchas

- **Windows line endings**: `git add` emits CRLF warnings — that's `core.autocrlf=true` doing its job. Leave it.
- **Alembic location**: `backend/alembic/` is a sibling of `app/`, not inside it. `prepend_sys_path = .` in `alembic.ini` makes `app.*` imports work inside `env.py`. Don't move it.
- **`focus_session_service.get_owned`** is called by `api/v1/sessions/router.py:get_session` and is the same helper that `complete` / `cancel` use internally for the ownership check. Keep them all on this single public entry point.
- **AWS adapters are stubs**: `infrastructure/auth/providers/cognito.py` and `infrastructure/storage/s3.py` raise `NotImplementedError`. Do not import them outside `core/deps.py`'s dispatch path until they have real bodies.
- **Don't bypass `IRealtimePublisher`**: chat messages go through Redis even within the same process, so that scaling to >1 backend container Just Works.
- **Frontend types are committed**: `frontend/lib/api/types.gen.ts` is in git (see `.gitignore`'s `!` rule). Regenerate via the script; don't hand-edit.
- **MVP-only stubs**: payments (`shop/`), achievements seed, and the match-modal "candidate" picker (currently shows a fake match without a real candidate id) are intentionally incomplete. Look for `# v2`, `TODO`, or `# stub` comments before redesigning.

## Where to extend next (per the original plan)

- New matching algorithm → new `ICompatibilityStrategy` in `domain/services/strategies/`, wire via DI in `api/v1/matches/router.py:_service`
- Real auth provider → fill in `CognitoProvider.verify_access_token` against your User Pool's JWKS, set `AUTH_PROVIDER=cognito`
- Real storage → fill in `S3Storage` with `boto3` presigned URLs, inject via `deps.py`
- New scheduled job → add a coroutine to `worker.py`, `scheduler.schedule_interval(...)`
- Full AWS deployment → `infra/README.md` has the CDK stack plan and cost estimate (not implemented yet)
