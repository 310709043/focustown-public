# Focus Town

Pomodoro-based social focus app. Pixel city scenes, live leaderboards, partner matching, shared focus rooms with realtime chat.

- **Frontend**: Next.js 15 (App Router) + Tailwind + Zustand
- **Backend**: FastAPI + SQLAlchemy 2 (async) + Alembic + Redis Pub/Sub + APScheduler
- **MVP-but-extensible**: SOLID ports & adapters; swap `LocalJWTProvider` → Cognito, `LocalFSStorage` → S3, etc. without touching domain/services.

## Quick start (Docker)

```bash
cp .env.example .env
docker compose up --build
```

- Frontend: http://localhost:3000
- Backend (SwaggerUI): http://localhost:8000/docs
- Health: http://localhost:8000/healthz

Run migrations (first time, or after model changes):

```bash
docker compose exec backend alembic upgrade head
```

Regenerate frontend TypeScript types from the live OpenAPI spec:

```bash
./scripts/gen-api-types.sh
```

## Running pieces standalone

### Backend (Python 3.12)

```bash
cd backend
pip install -e ".[dev]"
alembic upgrade head
uvicorn app.main:app --reload
```

### Frontend (Node 20 + pnpm)

```bash
cd frontend
pnpm install
pnpm dev
```

## Repo layout

See [`C:/Users/USER/.claude/plans/reference-html-nextjs-fastapi-solid-pat-flickering-key.md`](C:/Users/USER/.claude/plans/reference-html-nextjs-fastapi-solid-pat-flickering-key.md) for the architectural rationale. Short version:

```
focustwon/
├── reference.html         # original UI prototype (1318 lines)
├── docker-compose.yml
├── .env.example
├── backend/
│   ├── app/
│   │   ├── core/          # config, deps, security, events, logging, clock, ids
│   │   ├── domain/        # pure business: models, repository Protocols, services, strategies
│   │   ├── infrastructure/ # adapters: db, cache, auth providers, messaging, jobs, ...
│   │   ├── api/v1/        # FastAPI routers (per feature)
│   │   ├── main.py        # app factory
│   │   └── worker.py      # APScheduler entry (separate process)
│   └── alembic/           # migrations (sibling of app/, not inside it)
├── frontend/
│   ├── app/               # pages (Splash, signin, signup, select-character, town, focus/[id], awards, shop)
│   ├── components/        # scene / panels / focus-room / modals / shared
│   └── lib/
│       ├── api/           # client + endpoints + generated types
│       ├── ws/            # WebSocket client + useRealtime hook
│       ├── state/         # Zustand stores (auth, timer, scene, match)
│       ├── hooks/         # useTimer, etc.
│       └── data/          # CHARACTERS, SCENES constants ported from reference.html
├── infra/                 # AWS CDK stacks — placeholder, see infra/README.md
└── .github/workflows/     # CI: backend (pytest + ruff) + frontend (typecheck + build)
```

## Verification (end-to-end smoke test)

1. `docker compose up` — all 5 containers green
2. `docker compose exec backend alembic upgrade head` — migration succeeds
3. Open http://localhost:8000/docs — all v1 endpoints listed; GET `/healthz` → 200
4. Open http://localhost:3000 → Splash → Sign up → select character → arrive at /town with the animated scene
5. Click 🍅 專注 → start a focus session → backend `focus_sessions` table gains a row with `status=completed` once it finishes
6. Open two browser tabs, accept a match in one → both land in `/focus/<match_id>` → chat from A appears in B's pane via WebSocket
7. Force a session into the past, wait 60s — worker container marks it `abandoned`
8. `./scripts/gen-api-types.sh` regenerates `frontend/lib/api/types.gen.ts` and `pnpm typecheck` stays clean

## Where to extend next

- **Compatibility scoring**: implement a new `ICompatibilityStrategy` in `backend/app/domain/services/strategies/` and wire it into `MatchingService` via DI
- **Storage**: implement `S3Storage` (`infrastructure/storage/s3.py`) with `boto3` presigned URLs and switch via env
- **Auth**: implement `CognitoProvider.verify_access_token` against your User Pool's JWKS; flip `AUTH_PROVIDER=cognito`
- **Scheduling**: swap `APSchedulerAdapter` for an `EventBridgeAdapter` when moving to AWS

See `infra/README.md` for the full AWS migration plan and cost estimate.
