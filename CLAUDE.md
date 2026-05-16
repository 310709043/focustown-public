# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Focus Town — Pomodoro-based social focus app. Pixel-city UI, live leaderboards, partner matching, shared focus rooms with realtime chat. Frontend = Next.js 15 (App Router). Backend = FastAPI + SQLAlchemy 2 async. Postgres + Redis. The original 1318-line single-file UI prototype was the source of visual/interaction design; it has been removed from the working tree but is preserved in git history at `82880df:reference.html` (recover with `git show 82880df:reference.html > reference.html`).

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

Auth endpoints are rate-limited via `IRateLimiter` (Redis-backed in prod, `MemoryRateLimiter` for tests). Limits live in `api/v1/auth/router.py`; tune them there. The 429 response is wrapped in the standard `FocusTownError` envelope.

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
