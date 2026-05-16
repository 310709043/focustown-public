# Phase 6 — Perf Tier-2 + SOLID Refactor

> **Status**: PROPOSED · 2026-05-16
> **Predecessors**: PR #31 (CSP media-src fix), PR #32 (perf tier-1)
> **Successor**: TBD per outcome

## Context

PR #32 shipped the tier-1 perf wins (Turbopack, Docker volumes, Dockerfile layer split, 4 dynamic-imported scene components, two N+1 fixes, one compound index). This plan covers two follow-ups that share a theme — *make the existing architecture deliver what it already promises*:

1. **Perf Tier-2**: the items the explore agent quantified but PR #32 explicitly deferred (Google Fonts self-hosting, EventBus parallel dispatch, etc.). Each was deferred either because it was lower-impact than tier-1 wins or because it needed measurement before commitment. This phase picks up the ones that survive a stricter cost/benefit pass.

2. **SOLID Refactor**: the codebase audit (post-PR #32) surfaced 12 concrete drift points — three high-severity, five medium, four low. The architecture is fundamentally sound (ports & adapters, Protocol-based DI, dual-model where it counts) but several services have crept into direct service-on-service coupling, three protocols expose private state through the router, and five repos didn't get the ISP reader/writer split that `IRoomTrackRepo` / `IUserRepo` have.

The goal is not to rewrite; it is to **return drifted areas to the standard the rest of the codebase has set**, so the next feature added doesn't compound on top of inconsistency.

## Audit Findings (Summary)

### Backend SOLID (12 issues, 3 high / 5 medium / 4 low)

| # | Severity | Issue | Evidence |
|---|---|---|---|
| 1 | HIGH | Router calls private `_fetch_owned()` on service | `api/v1/sessions/router.py:95` |
| 2 | HIGH | `RoomVisitService` depends on concrete `PresenceService` (no Protocol) | `domain/services/room_visit_service.py:19,50` |
| 3 | HIGH | `AuthService.get_me_with_vehicle()` takes `IShopRepo` as method param instead of constructor | `domain/services/auth_service.py:96` |
| 4 | MED | Routers compose multiple services per request (no DI alias) | `shop/router.py:89`, `matches/router.py:67`, `sessions/router.py:30` |
| 5 | MED | 5 repos not split into Reader/Writer | `IFocusSessionRepo`, `INoteRepo`, `IMatchRepo`, `IRoomRepo`, `IShopRepo` |
| 6 | MED | `PurchaseService` depends on concrete `WalletService` | `domain/services/purchase_service.py:44` |
| 7 | MED | `CoinAwardService` factory workaround | `domain/services/coin_award_service.py:30` |
| 8 | MED | `MatchingService` strategy hardcoded in router (OCP) | `api/v1/matches/router.py:72` |
| 9 | LOW | Dual-model inconsistency (Note/Achievement/ShopItem ORM-only — fine if documented) | `domain/models/` vs `infrastructure/db/models/` |
| 10 | LOW | Router-level N+1 caching pattern (works, could centralize) | `api/v1/matches/router.py:41-64` |

### Frontend (4 issues, 1 high / 2 medium / 1 low)

| # | Severity | Issue | Evidence |
|---|---|---|---|
| F1 | HIGH | PersonalPlaylist types hand-written, duplicates `types.gen.ts` purpose | `lib/api/endpoints.ts:306-322` |
| F2 | MED | PersonalRadio has 4 hardcoded zh-TW aria-labels | `components/audio/PersonalRadio.tsx:164,184,198,214` |
| F3 | MED | `presenceStore` grew a second concern (equipment rehydrate signals) | `lib/state/presenceStore.ts:32-59` |
| F4 | LOW | Page-level realtime subscription does inline state mutation | `app/[locale]/town/page.tsx:107-129` |

### Deferred Perf (from PR #32)

| # | Item | Recommendation |
|---|---|---|
| P1 | Self-host Google Fonts (5 fonts, ~25KB WOFF2) | **Do** — 50-80ms FCP win, trivial |
| P2 | EventBus parallel dispatch via `asyncio.gather` | **Do** — 100-300ms per `SessionCompleted` (3 independent handlers) |
| P3 | i18n single-bundle per locale | **Investigate** — measure SSR cost first |
| P4 | LeaderboardPanel polling debounce (Intersection Observer + 60s) | **Investigate** — profile traffic first |
| P5 | FrameTicker → rAF | **Skip** — 5 FPS is intentional for pixel-art readability |
| P6 | `output: 'standalone'` | **Already done** — `next.config.mjs:31` |
| P7 | JWT user cache | **Skip** — verified no per-request DB lookup |
| P8 | Middleware reshuffle | **Skip** — already lean |
| P9 | Worker job rewrites | **Skip** — already efficient |

## Design Principles (Re-Stated)

These are not new — they're the standards PR #8 set and PR #29 + #32 partially honored:

- **DIP**: `domain/services/` depends on Protocols from `domain/repositories/` and `domain/notifications/`. NEVER on `infrastructure/`, `sqlalchemy`, `redis`, `boto3`, `fastapi`. Services never depend on other concrete services — only on Protocols.
- **ISP**: a service that only reads from a repo should depend on `IXxxReader`, not on the composed `IXxxRepo` that also has writers. Same for services that only write.
- **OCP**: extension points (strategies, notifiers, storage adapters) should be selected by config + DI, not hardcoded in routers.
- **SRP**: services own one cohesive responsibility; cross-feature reactions live in event subscribers, not in the originating service.
- **Routers stay thin**: validate, call **one** service method, return DTO. Multi-step orchestration belongs in a service.

## Proposed PR Plan

### PR3 — Quick wins (mixed, ~2 hours)

All low-risk + high-confidence items bundled. Six commits, each independently revertable.

| Commit | What | Why |
|---|---|---|
| `fix(api): promote FocusSessionService._fetch_owned to public get()` | Backend audit #1 — give the router a public method to call | SRP, encapsulation |
| `refactor(matches): inject ICompatibilityStrategy via deps.py` | Backend audit #8 — strategy chosen by config | OCP |
| `perf(events): dispatch handlers in parallel via asyncio.gather` | Deferred P2 — `SessionCompleted` has 3 independent subscribers | Latency on hot path |
| `perf(fonts): self-host the 5 pixel-art fonts as local WOFF2` | Deferred P1 — kill the Google Fonts external DNS lookup | FCP, offline-friendly |
| `fix(types): move PersonalPlaylist types into types.gen.ts` | Frontend audit F1 — single source of truth | Schema drift prevention |
| `i18n(audio): translate PersonalRadio aria-labels` | Frontend audit F2 — accessibility coverage for English | Localization completeness |

**Files** (each commit small):
- `backend/app/domain/services/focus_session_service.py`, `backend/app/api/v1/sessions/router.py`
- `backend/app/core/deps.py`, `backend/app/api/v1/matches/router.py`, `backend/app/core/config.py` (new `MATCHING_STRATEGY` setting)
- `backend/app/core/events.py`
- `frontend/public/fonts/*.woff2` (new), `frontend/app/globals.css`
- `frontend/lib/api/types.gen.ts`, `frontend/lib/api/endpoints.ts`
- `frontend/components/audio/PersonalRadio.tsx`, `frontend/messages/{en,zh-TW}/audio.json` (new namespace) or existing `library.json`

**Verification**:
- `ruff check .` clean on changed files
- `pytest tests/unit/` still 285+ passing
- `pnpm typecheck && pnpm lint`
- Browser: open `/town`, confirm PersonalRadio uses translated labels (switch locale to en), confirm fonts load from `/fonts/*` not Google
- After `SessionCompleted` fires (e.g. timer finish), backend trace shows handlers ran in parallel (handler latencies overlap)

### PR4 — Service-on-service decoupling (~3 hours)

Theme: "no service constructor takes another concrete service." Extract Protocols for what callers actually use.

| Commit | What |
|---|---|
| `refactor(presence): extract IPresenceStatusWriter Protocol` | Audit #2 — `RoomVisitService` only needs to write presence state, not the whole `PresenceService` API |
| `refactor(wallet): extract IWalletService Protocol; PurchaseService depends on it` | Audit #6 — `PurchaseService` should not import the concrete `WalletService` class |
| `refactor(coin-award): drop WalletServiceFactory workaround; inject IWalletService` | Audit #7 — once #6 lands, the event-handler factory bag is no longer needed |
| `refactor(auth): move IShopRepo from method param to constructor (or split service)` | Audit #3 — decision required: bake `shop` into `AuthService` constructor, OR split out a `UserVehicleResolver`; recommend the split to keep `AuthService` focused on credentials |

**New files**:
- `backend/app/domain/repositories/presence.py` — add `IPresenceStatusWriter` Protocol (if not already present per audit, only partially exists)
- `backend/app/domain/services/wallet_service_iface.py` (or inline in `wallet_service.py`) — `IWalletService` Protocol
- Possibly `backend/app/domain/services/user_vehicle_resolver.py` — new small service for the auth-side vehicle hydration

**Files modified**:
- `backend/app/domain/services/room_visit_service.py` — accept `IPresenceStatusWriter`, not `PresenceService`
- `backend/app/domain/services/purchase_service.py` — accept `IWalletService`
- `backend/app/domain/services/coin_award_service.py` — accept `IWalletService`, remove factory
- `backend/app/domain/services/auth_service.py` — see split decision above
- `backend/app/core/deps.py` — wire the new Protocols to their concrete adapters
- All call sites that construct these services (`api/v1/*/router.py`)
- Test fakes in `tests/unit/fakes.py` — add fakes for `IWalletService` + `IPresenceStatusWriter`

**Verification**:
- All existing tests pass (Protocol substitution is LSP-compliant)
- New unit tests in `tests/unit/test_room_visit_service.py` etc. can construct the service with a fake instead of the whole `PresenceService` stack
- `grep -rE "from app\.domain\.services\.[a-z_]+_service import [A-Z]" backend/app/domain/services/` returns zero hits (no service-imports-service)

### PR5 — Repository ISP split (~2 hours)

Theme: "repositories follow `IRoomTrackReader` / `IRoomTrackWriter` precedent." Split the 5 remaining mixed-protocol repos.

| Commit | Repos split |
|---|---|
| `refactor(repos): split IFocusSessionRepo into reader/writer` | `daily_leaderboard`, `list_active`, `list_by_user_since`, `count_completed_today` → Reader. `create`, `update_status` → Writer |
| `refactor(repos): split INoteRepo, IMatchRepo, IRoomRepo, IShopRepo` | Same pattern; each commit ~one repo if reviewers prefer smaller chunks |

**Strategy**:
- Keep composed `IFocusSessionRepo` as `Protocol(IFocusSessionReader, IFocusSessionWriter)` so existing call sites that want both still compile
- Update services to depend on the narrowest Protocol they need:
  - `LeaderboardService` → `IFocusSessionReader` only
  - `FocusSessionService` → both (manages lifecycle)
  - `RoomService` → `IRoomReader` for `get_by_owner`, `IRoomWriter` for `create`/`update`
  - `PurchaseService` → `IShopReader` for `get`, never touches write side
  - Etc.

**Verification**:
- Type-checker proves Protocol narrowing (mypy in strict mode would catch any caller asking for a method it shouldn't have)
- All 285+ unit tests still pass
- `grep` confirms each `_Reader` Protocol is consumed somewhere; nothing dead

### PR6 — Optional: instrumented perf measurement + tier-3 decisions

Don't write code; write benchmarks. Only commit changes that follow from numbers.

- Measure i18n bundle load time on actual page transitions (Chrome DevTools Performance trace, before vs after a build-time bundle plugin)
- Measure LeaderboardPanel network usage in a 1-hour browsing session (Network tab → save HAR → script analysis)
- Decide: do P3 + P4 *only if* the numbers justify them

If both worth doing, write PR7 with `messages-bundle.json` build step + `IntersectionObserver` polling guard.

## Out of Scope (Explicit)

These were considered and rejected; documenting so the next reviewer doesn't re-litigate:

- **FrameTicker rAF migration**: 5 FPS is a *design choice* for pixel-art aesthetic. Higher FPS would make sprites look like 3D animation, not chunky pixels. Don't change without a UI/design call.
- **`output: 'standalone'`**: already enabled.
- **JWT user cache**: verified — `get_current_user_id` does not trigger a per-request DB lookup. Caching nothing saves nothing.
- **Middleware reshuffle**: stack is CORS → SecurityHeaders, both lean. No Redis I/O per request.
- **Worker job rewrites**: already idempotent UPSERT-based; no destructive patterns.
- **Dual-model promotion for Note/Achievement/ShopItem**: these have no behavior beyond CRUD. Domain dataclass would be pure transport. Document the rule ("entities with state machines get models; CRUD-only stays ORM-only") rather than refactor.
- **Router-level `_dto` cache in matches**: works, micro-opt, not duplicated elsewhere. Leave until a second caller wants the same thing.

## Sequencing

```
PR3 (quick wins, ~2h)
   └─→ ship independently; users see fonts + parallel events benefit immediately

PR4 (decoupling, ~3h)
   └─→ depends on nothing; touches more files but lower latency risk

PR5 (ISP split, ~2h)
   └─→ depends on PR4 (cleaner constructor signatures make split obvious)

PR6 (measurement, no merge)
   └─→ independent track; results feed possible PR7
```

Total active engineering time: ~7 hours. Each PR is reviewable in 20-30 minutes by someone familiar with the codebase.

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| ISP split breaks an unexpected caller (mypy strict not enabled everywhere) | Each split commit runs the full test suite + `ruff check`; one repo at a time, easy to bisect |
| EventBus parallel dispatch surfaces a hidden ordering dependency between handlers | Add a unit test that asserts each handler runs without others' side-effects observable (independence assertion) |
| Self-hosted fonts ship wrong WOFF2 weights → layout shift | Match weights 1:1 from current `@import` URL; visual diff `/town` before/after |
| `AuthService` split changes route response shape | The split is internal — route DTO unchanged; covered by existing auth route tests |
| Decoupling work touches many files → big diff | Each commit is one Protocol + its immediate callers; aim for <300 lines per commit |

## Acceptance Criteria

PR3 ships when:
- All 6 commits land + green CI
- Browser smoke: `/town` shows translated radio labels in `en`, fonts no longer load from `fonts.googleapis.com`
- Backend: `SessionCompleted` event handler invocations overlap in trace

PR4 ships when:
- `grep` for service-on-service imports returns zero hits in `domain/services/`
- All 285+ tests pass
- New `IWalletService` + `IPresenceStatusWriter` Protocols exist with concrete implementations

PR5 ships when:
- Each of the 5 repos has `IXxxReader` + `IXxxWriter` + composed `IXxxRepo`
- Services consume narrowed Protocols (manually audited or mypy-verified)
- Test fakes split into reader/writer fakes (mirroring `FakeRoomTrackReader` / `FakeRoomTrackWriter` if those exist; otherwise composed fakes are fine)

## Open Questions

1. **PR4 — `AuthService` split decision**: bake `shop` into constructor, or carve out `UserVehicleResolver`? Defaulting to the latter (cleaner SRP), but pending owner call.
2. **PR5 — should the composed `IXxxRepo` Protocol stay?** Yes, for any caller that legitimately needs both R/W (e.g. `FocusSessionService`). The split is for *consumers*, not adapters.
3. **PR6 — measurement budget**: how much time is justified to instrument before deciding on P3/P4? Recommend ≤1 hour total.
