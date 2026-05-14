# Phase 1 — 街景接上真實在線使用者

> Status: **DRAFT (awaiting approval → implementation)**
> Roadmap entry: see `plan_docs/00-roadmap.md` Phase 1
> Depends on: 無
> Unblocks: Phase 3 (avatar 渲染)、Phase 8 (進房 / 離房 改 state)

## Context

街景 (`Pedestrians.tsx` + `CarsLane.tsx`) 目前是 10 個寫死的假 NPC，與既有的 30 人角色花名冊、真實在線使用者完全沒有關聯。Phase 1 把它換成「真實在線使用者驅動」，同時建立 presence 追蹤的基礎設施 — 為後續所有「誰在線 / 誰在房間」相關功能 (Phase 8 進房、Phase 9 同步播放) 提供共用 port。

CSS 動畫、視覺手感、角色色板都**保留**，只改資料來源。

## Scope

### In Scope (這個 Phase 要做完的)

- 後端新 port `IPresenceTracker` + Redis 實作 + `PresenceService`
- 後端新 API `GET /api/v1/presence/street`
- WS connect / disconnect lifecycle 自動寫入 / 清除 presence
- WS 廣播 `presence.changed` delta 給所有連線者
- 前端 `presenceStore` (Zustand) + 初始 fetch + WS delta 訂閱
- `Pedestrians.tsx` + `CarsLane.tsx` 改吃 store，**保留所有 CSS 動畫**
- 街景容量上限：**預設 12** (環境變數 `NEXT_PUBLIC_STREET_CAP` 可調)
- 每個在線使用者**同時出現在行人道 + 車道** (與舊視覺一致，Phase 3 才分流)

### Out of Scope (留給後續 Phase)

- `User.state = in_room` 切換 (Phase 8 — 但本 Phase 的 `IPresenceTracker.state` enum 預埋 `in_room`)
- 使用者買車 / 換頭像渲染 (Phase 3)
- 朋友 / 公開房間列表 (Phase 4+)
- 真實同步效能優化 (Phase 9 才需要)

## SOLID Design Overview

| 原則 | 應用 |
|------|------|
| **S** Single Responsibility | `IPresenceTracker` 只管「誰在哪個 state」；`IUserRepo` 只管 user 資料；`PresenceService` 編排兩者；WS router 只管 socket I/O |
| **O** Open/Closed | 新增 `InMemoryPresenceTracker` (測試用) / 未來 `DynamoDBPresenceTracker` 不用改 `PresenceService` |
| **L** Liskov | 所有 `IPresenceTracker` 實作可互換 (測試用 fake 與 prod Redis 同行為合約) |
| **I** Interface Segregation | `IPresenceTracker` 只有 5 個方法 (online/offline/update/get/list)；不混入 user 查詢 |
| **D** Dependency Inversion | WS router 與 API router 都依賴 `IPresenceTracker` Protocol，不直接 import `redis` |

新 Protocol 放在 `domain/repositories/presence.py`，沿用既有 `IRealtimePublisher` (`domain/repositories/realtime.py`) 的 convention。

## Backend Implementation

### 1) Domain Layer (純 Python，無外部依賴)

**新建 `backend/app/domain/repositories/presence.py`**

```python
from __future__ import annotations
from dataclasses import dataclass
from datetime import datetime
from typing import Literal, Protocol

PresenceState = Literal["on_street", "in_room", "offline"]
"""在街上 / 在房間裡 / 離線 (offline 通常代表已過 TTL)"""

@dataclass(slots=True, frozen=True)
class PresenceEntry:
    user_id: str
    state: PresenceState
    status: str            # "focus" | "break" | "deep" | "read" | "create" | "afk"
    last_seen_at: datetime

class IPresenceTracker(Protocol):
    async def online(self, user_id: str, *, state: PresenceState = "on_street",
                     status: str = "focus") -> None: ...
    async def offline(self, user_id: str) -> None: ...
    async def update(self, user_id: str, *, state: PresenceState | None = None,
                     status: str | None = None) -> None: ...
    async def get(self, user_id: str) -> PresenceEntry | None: ...
    async def list(self, *, state: PresenceState | None = None) -> list[PresenceEntry]: ...
```

**擴充 `backend/app/domain/repositories/user_repo.py`** (加一個方法即可)

```python
async def get_many_by_ids(self, user_ids: list[str]) -> list[User]: ...
```

**新建 `backend/app/domain/services/presence_service.py`**

```python
class PresenceService:
    def __init__(self, tracker: IPresenceTracker, users: IUserRepo,
                 publisher: IRealtimePublisher):
        self._tracker = tracker
        self._users = users
        self._pub = publisher

    async def connect(self, user_id: str) -> None:
        await self._tracker.online(user_id, state="on_street")
        await self._pub.publish("street",
            {"type": "presence.changed", "user_id": user_id,
             "state": "on_street", "status": "focus"})

    async def disconnect(self, user_id: str) -> None:
        await self._tracker.offline(user_id)
        await self._pub.publish("street",
            {"type": "presence.changed", "user_id": user_id, "state": "offline"})

    async def set_status(self, user_id: str, status: str) -> None:
        await self._tracker.update(user_id, status=status)
        await self._pub.publish("street",
            {"type": "presence.changed", "user_id": user_id, "status": status})

    async def list_street(self, *, cap: int) -> list[StreetUser]:
        """回給 HTTP 客戶端：在街上的使用者 + hydrated user data"""
        entries = await self._tracker.list(state="on_street")
        users = await self._users.get_many_by_ids([e.user_id for e in entries])
        users_by_id = {u.id: u for u in users}
        out = []
        for e in entries:
            u = users_by_id.get(e.user_id)
            if not u: continue
            out.append(StreetUser(id=u.id, display_name=u.display_name,
                                  character_key=u.character_key, status=e.status))
        return out[:cap]
```

`StreetUser` 是 domain DTO (純 dataclass)。

### 2) Infrastructure Layer

**新建 `backend/app/infrastructure/presence/redis_tracker.py`**

Redis key 設計：
- `presence:online` — SET of user_id，列出所有在線者
- `presence:user:{user_id}` — HASH { state, status, last_seen_at }，TTL **90 秒**
- TTL 是 safety net；正常 disconnect 會 explicit 移除

```python
class RedisPresenceTracker:
    PRESENCE_KEY = "presence:online"
    USER_KEY_FMT = "presence:user:{user_id}"
    TTL_SECONDS = 90

    def __init__(self, redis: Redis, clock: IClock):
        self._r = redis
        self._clock = clock

    async def online(self, user_id, *, state="on_street", status="focus"):
        now = self._clock.now()
        async with self._r.pipeline() as p:
            await p.hset(self._key(user_id), mapping={
                "state": state, "status": status, "last_seen_at": now.isoformat()})
            await p.expire(self._key(user_id), self.TTL_SECONDS)
            await p.sadd(self.PRESENCE_KEY, user_id)
            await p.execute()

    async def offline(self, user_id):
        async with self._r.pipeline() as p:
            await p.delete(self._key(user_id))
            await p.srem(self.PRESENCE_KEY, user_id)
            await p.execute()
    # ... update / get / list 同 pattern
```

擴充 `SqlUserRepo` 加 `get_many_by_ids` (SELECT WHERE id IN (...))。

### 3) API Layer

**新建 `backend/app/api/v1/presence/router.py`**

```python
router = APIRouter()

@router.get("/street", response_model=list[StreetUserResponse])
async def list_street(
    _: CurrentUserId,                       # 需登入
    tracker: PresenceTrackerDep,
    pub: RealtimePublisherDep,
    db: DbDep,
    cap: int = Query(12, ge=1, le=50),
) -> list[StreetUserResponse]:
    svc = PresenceService(tracker, SqlUserRepo(db), pub)
    users = await svc.list_street(cap=cap)
    return [StreetUserResponse(**asdict(u)) for u in users]
```

在 `app/main.py` 註冊 `/api/v1/presence` router。

### 4) WS Lifecycle 整合 (改 `backend/app/api/v1/ws/router.py`)

```python
# connect 區段：
await ws_mgr.connect(user_id, websocket)
await pub.add_channels([
    IRealtimePublisher.user_channel(user_id),
    "street",                                # ← 新增：所有人都收街景 delta
])
svc = PresenceService(tracker, SqlUserRepo(db), pub)
await svc.connect(user_id)                    # ← 寫 Redis + 廣播 presence.changed

# 訊息迴圈：
elif msg.get("type") == "presence":
    await svc.set_status(user_id, msg.get("status", "focus"))

# disconnect / except 區段：
finally:
    await svc.disconnect(user_id)             # ← 清 Redis + 廣播 offline
    ws_mgr.disconnect(user_id, websocket)
    await pub.stop()
```

### 5) DI Wiring (`backend/app/core/deps.py`)

```python
def get_presence_tracker(redis = Depends(get_redis), clock: ClockDep) -> IPresenceTracker:
    return RedisPresenceTracker(redis, clock)
PresenceTrackerDep = Annotated[IPresenceTracker, Depends(get_presence_tracker)]
```

⚠️ `get_redis` 需從 `infrastructure/cache/redis_client.py` 暴露給 DI；目前是直接 import — 若已可用就 reuse，否則加一個 `get_redis()` DI helper。

## Frontend Implementation

### 1) API Client (`frontend/lib/api/endpoints.ts`)

```ts
export type StreetUser = {
  id: string; display_name: string;
  character_key: string | null; status: string;
};
export const presenceApi = {
  async listStreet(cap = 12): Promise<StreetUser[]> {
    return apiFetch(`/api/v1/presence/street?cap=${cap}`);
  },
};
```

`types.gen.ts` 在後端 PR 合併後跑 `./scripts/gen-api-types.sh` 重產生。

### 2) WS Message Type (`frontend/lib/ws/client.ts`)

加進既有 `WsMessage` union：

```ts
| { type: "presence.changed"; user_id: string;
    state?: "on_street" | "in_room" | "offline"; status?: string }
```

### 3) State Store (`frontend/lib/state/presenceStore.ts` — 新建)

```ts
type PresenceMap = Record<string, StreetUser>;
type PresenceStore = {
  byId: PresenceMap;
  hydrate: (users: StreetUser[]) => void;
  applyDelta: (msg: PresenceChangedMessage) => void;
  onStreet: () => StreetUser[];      // 衍生：過濾 + 排序 + cap
};
export const usePresenceStore = create<PresenceStore>(...);
```

**Immutability**：每次更新都 `{...prev.byId, [id]: next}`，遵守專案 `.claude/rules/coding-style.md`。

### 4) Component Refactor

**`frontend/components/scene/Pedestrians.tsx`** (~175 行 → 預估 ~160 行)

- 移除 `import NPCS from "@/lib/data/npcs"`
- 改 `const users = usePresenceStore(s => s.onStreet())`
- `PedState[]` 改成 `Map<user_id, PedState>` — 新使用者進來時初始化 x / walkPhase，離開時刪除
- 隨機 x 跳躍、status 切換邏輯**保留** (視覺手感)
- `status` 從 store 讀，而非本地 random

**`frontend/components/scene/CarsLane.tsx`** 同樣改法。

掛載點 (`frontend/app/town/page.tsx`) 加：

```tsx
useEffect(() => {
  presenceApi.listStreet(CAP).then(usePresenceStore.getState().hydrate);
}, []);
useRealtime((msg) => {
  if (msg.type === "presence.changed") usePresenceStore.getState().applyDelta(msg);
});
```

## Data Flow (One Diagram)

```
Browser A (User X) ──WS connect──> Backend Process P1
                                          │
                                          ├─→ tracker.online(X)  ───→ Redis SET + HASH
                                          └─→ pub.publish("street", {presence.changed X on_street})
                                                                ↓
                              ┌────────────── Redis Pub/Sub ──────────────┐
                              ↓                                            ↓
                       Process P1                                    Process P2
                          ↓                                              ↓
                  All WS on this proc                          All WS on this proc
                          ↓                                              ↓
                    Browser A, B, C                                Browser D, E
                          ↓
                  presenceStore.applyDelta
                          ↓
              Pedestrians / CarsLane 重新 render
```

Browser 初次進站：`GET /presence/street` 拿快照 → `presenceStore.hydrate` → WS 開始接 delta。

## Migration / Setup

無 SQL migration (純 Redis state)。但部署順序要小心：

1. Backend 先部署 (新 API + WS lifecycle 變動向後相容：未連的舊 client 不受影響)
2. 跑 `./scripts/gen-api-types.sh` 在 backend 已起的情況下，重產生 `types.gen.ts`
3. Frontend 部署

本地步驟：
```bash
docker compose up --build -d
# 確認 Redis 健康
docker compose exec redis redis-cli PING   # PONG
# 後端起來後跑 type generator
./scripts/gen-api-types.sh
```

## Verification

### Unit tests (backend)

新增 `backend/tests/unit/test_presence_service.py`：
- `InMemoryPresenceTracker` (測試用 fake) + mock `IUserRepo` + mock publisher
- 驗證 `connect / disconnect / set_status / list_street` 行為
- 驗證 publisher 收到正確 `presence.changed` payload

### Integration test (backend, 需要 Redis)

新增 `backend/tests/integration/test_redis_presence_tracker.py`：
- 起 Redis (docker compose 已有)
- 驗證 TTL、SET 操作、HASH 操作
- 並發兩個 `online()` 對同 user_id 不會出錯

### E2E manual (本地多使用者模擬)

```bash
docker compose up -d
docker compose exec backend alembic upgrade head
docker compose exec backend python /app/../scripts/seed-dev-data.py
```

1. **Chrome regular window** → 登入 seed user A → `/town`
2. **Chrome incognito window** → 登入 seed user B → `/town`
3. **Firefox window** → 登入 seed user C → `/town`
4. 預期：
   - 三個視窗都看到「3 個行人 + 3 輛車」分別對應 A/B/C，emoji + 顏色取自 `characters.ts`
   - 關掉 Firefox → A / B 視窗在 ~3 秒內看到 C 消失
   - C 重開後立刻又出現
5. 在 B 改 status (透過 TimerPanel 切 break) → A / C 視窗看到 B 的 status bubble 改字

### Playwright (defer 到 Phase 8+，但結構先預留)

`frontend/e2e/presence.spec.ts` (草稿)：開 3 個 browser context，assert `[data-testid="pedestrian"]` 數量 = 3。

## Decisions Made (in this plan)

| Decision | Choice | Why |
|----------|--------|-----|
| Visual mapping | 每個 user 同時是行人 + 車 | User 已選 (preserve 視覺) |
| 街景容量上限 | 12 (env-tunable) | 超過視覺擁擠；用 `cap` query 參數而非寫死 |
| HB 機制 | WS connection 本身就是 HB；Redis TTL 90s 為 safety net | 不需額外 ping，省複雜度 |
| `state` enum | `on_street | in_room | offline` (預埋 `in_room`) | Phase 8 可直接用 |
| `status` vs `state` | 分開存，orthogonal | 一個是「在哪」一個是「做什麼」 |
| Auth on `/presence/street` | 需登入 (`CurrentUserId`) | 與其他 endpoint 一致 |
| `PresenceService` 是否拆 query/command | 不拆 | Phase 1 規模小，過早拆會 over-engineer |
| 訪客名 (Phase 8) | N/A this phase | 已在 PresenceState 預埋 in_room |

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| 程序當掉沒呼叫 `offline()` → 殘留 online | Redis TTL 90s 自然過期；前端 store 也做 stale 過濾 (> 90s 視為離線) |
| 兩個 process 同時收到同一 user 連線 (multi-tab) | `WSManager._conns` 用 set，`SADD` 冪等；disconnect 後 ws_mgr 仍有其他 socket 就不該 mark offline → 改用 `len(ws_mgr._conns[user_id]) == 0` 判斷 |
| 大量在線時 `get_many_by_ids` 慢 | `cap=12` 限制；後端可加 `users_by_id` LRU cache (defer) |
| 前端 store 與 server 不一致 | 每 60 秒重新 `listStreet()` hydrate (drift correction) |

## Files to Touch

**新增**：
- `backend/app/domain/repositories/presence.py`
- `backend/app/domain/services/presence_service.py`
- `backend/app/infrastructure/presence/__init__.py`
- `backend/app/infrastructure/presence/redis_tracker.py`
- `backend/app/api/v1/presence/__init__.py`
- `backend/app/api/v1/presence/router.py`
- `backend/app/api/v1/presence/schemas.py`
- `backend/tests/unit/test_presence_service.py`
- `backend/tests/integration/test_redis_presence_tracker.py` (optional)
- `frontend/lib/state/presenceStore.ts`

**修改**：
- `backend/app/domain/repositories/user_repo.py` (加 `get_many_by_ids` Protocol method)
- `backend/app/infrastructure/db/repositories/user_repo.py` (加 SQL 實作)
- `backend/app/api/v1/ws/router.py` (connect / disconnect / presence message hook)
- `backend/app/core/deps.py` (加 `PresenceTrackerDep`，確保 `get_redis` 暴露給 DI)
- `backend/app/main.py` (註冊 presence router)
- `frontend/lib/api/endpoints.ts` (加 `presenceApi`)
- `frontend/lib/api/types.gen.ts` (auto-regenerate)
- `frontend/lib/ws/client.ts` (加 `presence.changed` message type)
- `frontend/components/scene/Pedestrians.tsx` (改資料來源)
- `frontend/components/scene/CarsLane.tsx` (改資料來源)
- `frontend/app/town/page.tsx` (mount hydrate + WS subscribe)

## Next After Phase 1

回 `plan_docs/00-roadmap.md` Phase 1 狀態欄改 DONE → 接 Phase 2 (虛擬貨幣 + 真實購買)。
