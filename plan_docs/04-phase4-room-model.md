# Phase 4 — Room Model (空房間)

> Status: **IN-PROGRESS (implementation)**
> Roadmap entry: see `plan_docs/00-roadmap.md` Phase 4
> Depends on: Phase 1 (Presence — DONE)、Phase 2 (Wallet — DONE)、Phase 3 (Equipment — DONE)
> Unblocks: Phase 5 (房間布置)、Phase 7 (房間音樂庫)、Phase 8 (進房/離房)

## Context

Roadmap 第二大區塊「房間 (Room)」由 Phase 4–9 構成。Phase 4 是這條線最關鍵的奠基 — 一旦 `rooms` 表存在，後續所有「布置 / 音樂庫 / 訪客 / 同步播放」都接在它上面。Phase 4 自身故意保持極小：每個使用者**自動擁有一間空房**，可以從街景走進去；房內目前只渲染屋主名牌（待 Phase 5 開放裝飾、Phase 8 開放訪客）。

雖然 Phase 4 不開放訪客，schema 必須**為 Phase 8 預埋**訪客存取模型 — 否則 Phase 8 上線時還要動 migration 改 visibility / max_visitors。本 plan 一次定下這些欄位，後續 Phase 只擴功能不動表結構。

WebSocket `room:{id}` channel + `IRealtimePublisher.room_channel()` 在 Phase 1 已實作，本 Phase **不**新增 WS 訊息（房間目前是單人；real-time 從 Phase 8 開始用）。

## Scope

### In Scope

- 後端：`rooms` table（id / owner_user_id UNIQUE / name / theme / visibility / max_visitors / TimestampMixin）
- 後端：`Room` domain model + `IRoomRepo` Protocol + `SqlRoomRepo` impl
- 後端：`RoomService` — `get_or_create_for_user` (lazy create)、`update`、`get_by_id`（Phase 4 owner-only）
- 後端：`GET /api/v1/me/room`（lazy create）、`PUT /api/v1/me/room`（name / theme）、`GET /api/v1/rooms/{room_id}`（403 for non-owner，Phase 8 會放寬）
- 後端：theme 驗證白名單（同前端 SCENES 7 個值）
- 前端：`/town/room/[id]` 路由，渲染空房 + 屋主名牌 + 名稱/主題編輯 UI（屋主才看得到）
- 前端：`/town` navbar 加「🏠 我的房間」按鈕 → 走 `roomApi.getMine()` 拿到 room.id → `router.push("/town/room/{id}")`
- 前端：`roomStore` Zustand store + `roomApi` endpoint client + `Room` type

### Out of Scope（後續 Phase）

- 房間裝飾 / 飾品擺放 → Phase 5
- 房間音樂庫 → Phase 7
- 訪客進房 / 離房 / 5 人上限執行 / WS `room:{id}` 廣播 → Phase 8
- 屋主 presence 切到 `in_room`、街景消失 → Phase 8
- 多間房 / 副本房 / 二手轉手 → 未來
- 房間 hero 圖 / cover photo → 未來

### Open Questions resolved（plan 階段已決）

| Open Q | 決議 |
|--------|------|
| 進房機制 | **全公開 + Phase 8 點街上頭像進房**；schema 加 `visibility` enum (`public` / `invite_only`)，Phase 4 全部 default `public` |
| theme 來源 | **復用既有 7 個 SCENES**（`dawn / day / dusk / night / storm / snow / aurora`），default `night` |
| 房間 id vs user id 作 URL | **用 room.id**（first-class entity；Phase 8 訪客連結要 shareable）|
| 一人幾間房 | **一間**（UNIQUE constraint on `owner_user_id`；多間留未來）|

## SOLID Design Overview

| 原則 | 應用 |
|------|------|
| **S** | `RoomService` 只管房間 CRUD + ownership/visibility 檢查；不碰 presence、不碰 inventory；`IRoomRepo` 只做純資料 |
| **O** | `visibility` enum 預埋 `invite_only`，Phase 8 開新存取規則時只改 service 判斷，不改 repo/migration；`theme` 是 VARCHAR + service 白名單，未來新增 theme 不動 schema |
| **L** | `RoomRecord` dataclass 是純值物件，任何 repo impl 換上都等價；測試用 `FakeRoomRepo` 即可 |
| **I** | `IRoomRepo` 只暴露 `get_by_owner` / `get_by_id` / `create` / `update`，**不**包成 generic CRUD；Phase 8 需要的 `list_public` / `add_visitor` 等不在這個 Protocol 上膨脹 |
| **D** | router 注入 `RoomServiceDep`、service 注入 `IRoomRepo`；service 不 import sqlalchemy / fastapi（沿襲 hexagonal） |

## Data Model

### Migration `0004_rooms.py`（手寫；autogenerate 不認 partial index / enum check）

`backend/alembic/versions/20260514_XXXX_0004_rooms.py`：

```python
revision = "0004"
down_revision = "0003"

def upgrade():
    op.create_table(
        "rooms",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("owner_user_id", sa.String(36),
                  sa.ForeignKey("users.id", ondelete="CASCADE"),
                  nullable=False),
        sa.Column("name", sa.String(64), nullable=False),
        sa.Column("theme", sa.String(16), nullable=False, server_default="night"),
        sa.Column("visibility", sa.String(16), nullable=False, server_default="public"),
        sa.Column("max_visitors", sa.Integer(), nullable=False, server_default="5"),
        sa.Column("created_at", sa.DateTime(timezone=True),
                  nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True),
                  nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("owner_user_id", name="uq_rooms_owner"),
        sa.CheckConstraint(
            "visibility IN ('public', 'invite_only')",
            name="ck_rooms_visibility",
        ),
    )
    op.create_index("ix_rooms_owner_user_id", "rooms", ["owner_user_id"])

def downgrade():
    op.drop_index("ix_rooms_owner_user_id", "rooms")
    op.drop_table("rooms")
```

**設計重點**：
- `owner_user_id` ON DELETE CASCADE：使用者帳號刪除時房間一併消失（Phase 5 的 `room_items`、Phase 7 的 `room_tracks` 也將 cascade）
- `UNIQUE(owner_user_id)`：強制「一人一房」於 DB 層，concurrent lazy-create 由 IntegrityError 收尾，service 不靠 app 邏輯保證 idempotency（與 Phase 2 idempotency 慣例一致）
- `visibility` 的 CHECK constraint：DB 層擋住非法值；service 仍 enum-typed
- `theme` 不在 DB 加 CHECK：白名單在 domain 層維護（與 Phase 5 / 未來擴充 theme 可以單側更新而不動 schema）

## Backend — Domain Layer

### `app/domain/models/room.py`（新）

```python
from dataclasses import dataclass
from datetime import datetime
from typing import Literal

# 同 frontend/lib/data/scenes.ts 的 SceneName
ALLOWED_THEMES: frozenset[str] = frozenset(
    {"dawn", "day", "dusk", "night", "storm", "snow", "aurora"}
)
DEFAULT_THEME = "night"

RoomVisibility = Literal["public", "invite_only"]

@dataclass(slots=True)
class Room:
    id: str
    owner_user_id: str
    name: str
    theme: str
    visibility: RoomVisibility
    max_visitors: int
    created_at: datetime
    updated_at: datetime
```

### `app/domain/repositories/room_repo.py`（新）

```python
from typing import Protocol
from app.core.sentinels import UNSET, UnsetType
from app.domain.models.room import Room, RoomVisibility

class IRoomRepo(Protocol):
    async def get_by_owner(self, owner_user_id: str) -> Room | None: ...
    async def get_by_id(self, room_id: str) -> Room | None: ...
    async def create(
        self, *,
        room_id: str,
        owner_user_id: str,
        name: str,
        theme: str,
        visibility: RoomVisibility = "public",
        max_visitors: int = 5,
    ) -> Room: ...
    async def update(
        self, *,
        room_id: str,
        name: str | UnsetType = UNSET,
        theme: str | UnsetType = UNSET,
    ) -> Room: ...
```

### `app/domain/services/room_service.py`（新）

```python
@dataclass(slots=True)
class RoomService:
    rooms: IRoomRepo
    users: IUserRepo
    clock: IClock
    id_gen: IIdGenerator

    async def get_or_create_for_user(self, *, user_id: str) -> Room:
        existing = await self.rooms.get_by_owner(user_id)
        if existing:
            return existing
        user = await self.users.get_by_id(user_id)
        if user is None:
            raise NotFoundError("user_not_found")
        default_name = f"{user.display_name} 的房間"
        try:
            return await self.rooms.create(
                room_id=self.id_gen.new(),
                owner_user_id=user_id,
                name=default_name,
                theme=DEFAULT_THEME,
            )
        except IntegrityError:
            # 並發 lazy-create：另一個 request 已建好，重讀一次（UNIQUE 守住一致性）
            again = await self.rooms.get_by_owner(user_id)
            if again is None:
                raise
            return again

    async def update(
        self, *, user_id: str,
        name: str | UnsetType = UNSET,
        theme: str | UnsetType = UNSET,
    ) -> Room:
        room = await self.rooms.get_by_owner(user_id)
        if room is None:
            raise NotFoundError("room_not_found")
        if isinstance(name, str):
            if not (1 <= len(name.strip()) <= 64):
                raise BusinessError("invalid_room_name")
            name = name.strip()
        if isinstance(theme, str) and theme not in ALLOWED_THEMES:
            raise BusinessError("invalid_room_theme")
        return await self.rooms.update(
            room_id=room.id, name=name, theme=theme,
        )

    async def get_by_id(self, *, room_id: str, requester_user_id: str) -> Room:
        room = await self.rooms.get_by_id(room_id)
        if room is None:
            raise NotFoundError("room_not_found")
        # Phase 4：只有屋主可看。Phase 8 將擴 visitor 規則
        if room.owner_user_id != requester_user_id:
            raise ForbiddenError("room_not_accessible")
        return room
```

## Backend — Infrastructure Layer

### `app/infrastructure/db/models/room.py`（新）

```python
class RoomORM(Base, TimestampMixin):
    __tablename__ = "rooms"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    owner_user_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(64), nullable=False)
    theme: Mapped[str] = mapped_column(String(16), nullable=False, default="night")
    visibility: Mapped[str] = mapped_column(String(16), nullable=False, default="public")
    max_visitors: Mapped[int] = mapped_column(Integer, nullable=False, default=5)
    __table_args__ = (
        UniqueConstraint("owner_user_id", name="uq_rooms_owner"),
        CheckConstraint(
            "visibility IN ('public', 'invite_only')",
            name="ck_rooms_visibility",
        ),
    )
```

### `app/infrastructure/db/repositories/room_repo.py`（新）

- `_to_domain(row: RoomORM) -> Room` — 純複製
- `create(...)`：插入 → flush → **`await session.refresh(row, ["updated_at"])`**（避免 TimestampMixin 的 server_default 重新整理後 MissingGreenlet — Phase 3 既知陷阱）
- `update(...)`：partial-update pattern with UNSET sentinel；寫入後同樣 `refresh(["updated_at"])`

### DI — `app/core/deps.py`

```python
def get_room_repo(db: DbDep) -> IRoomRepo:
    return SqlRoomRepo(db)

RoomRepoDep = Annotated[IRoomRepo, Depends(get_room_repo)]

def get_room_service(
    rooms: RoomRepoDep,
    users: UserRepoDep,
    clock: ClockDep,
    id_gen: IdGenDep,
) -> RoomService:
    return RoomService(rooms=rooms, users=users, clock=clock, id_gen=id_gen)

RoomServiceDep = Annotated[RoomService, Depends(get_room_service)]
```

## Backend — API Layer

### `app/api/v1/rooms/router.py`（新）

```
GET  /api/v1/me/room                    → RoomResponse（lazy create）
PUT  /api/v1/me/room                    → RoomResponse
GET  /api/v1/rooms/{room_id}            → RoomResponse（Phase 4：403 if not owner）
```

### `app/api/v1/rooms/schemas.py`（新）

```python
RoomTheme = Literal["dawn","day","dusk","night","storm","snow","aurora"]

class RoomResponse(BaseModel):
    id: str
    owner_user_id: str
    name: str
    theme: RoomTheme
    visibility: Literal["public","invite_only"]
    max_visitors: int
    created_at: datetime
    updated_at: datetime

class UpdateRoomRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=64)
    theme: RoomTheme | None = None
```

### `app/api/v1/__init__.py`

```python
from app.api.v1.rooms.router import router as rooms_router
api_router.include_router(rooms_router)  # routes 已包含 /me/room 與 /rooms/{id}
```

字母順序插在 `presence` 之後、`sessions` 之前。

## Frontend Implementation

### 1) 型別 `lib/api/types.gen.ts`

```ts
export type RoomTheme = "dawn"|"day"|"dusk"|"night"|"storm"|"snow"|"aurora";
export type RoomVisibility = "public" | "invite_only";

export type Room = {
  id: string;
  owner_user_id: string;
  name: string;
  theme: RoomTheme;
  visibility: RoomVisibility;
  max_visitors: number;
  created_at: string;
  updated_at: string;
};
```

### 2) `lib/api/endpoints.ts`

```ts
export const roomApi = {
  getMine: () => apiFetch<Room>("/api/v1/me/room", { method: "GET" }),
  updateMine: (body: { name?: string; theme?: RoomTheme }) =>
    apiFetch<Room>("/api/v1/me/room", { method: "PUT", body }),
  getById: (roomId: string) =>
    apiFetch<Room>(`/api/v1/rooms/${roomId}`, { method: "GET" }),
};
```

### 3) `lib/state/roomStore.ts`（新，仿 walletStore pattern）

```ts
interface RoomStore {
  myRoom: Room | null;
  loading: boolean;
  error: string | null;
  hydrate: () => Promise<void>;          // calls roomApi.getMine()
  update: (patch: {name?:string; theme?:RoomTheme}) => Promise<void>;
  reset: () => void;
}
```

immutable 更新；錯誤訊息存進 store 不直接 throw 到 UI。

### 4) Aesthetic Design Vision（套 `/frontend-design` 思考）

**Tone direction**: 「lofi pixel **interior** — 從街景的霓虹奇觀走進個人的 8-bit 起居室」。Phase 4 是品牌第一次**從室外切到室內**，這個過渡值得設計記憶點。沿用既有 violet/teal/amber 色票 + DotGothic16/VT323/Press Start 2P 三種字 — **不新增任何字型**（避免 AI 一般化），靠**版式 + 動畫 + 像素細節**達成獨特性。

**One thing they'll remember**: 開門進房的 **shutter-iris 過場** — 整個畫面從中心拉開一個 8-bit「百葉窗開門」動畫（4 條水平條由中央上下分裂），房間像被「打開」而非「載入」。離房時反向收回。

**3 個視覺主柱**：

1. **Doorway transition (新 keyframe)**
   `@keyframes roomShutterOpen` — 4 條 100% 寬、25% 高的暗色條，從中心分別往上下移出視窗，總時長 600ms，cubic-bezier(0.16, 1, 0.3, 1)。掛在房間頁 mount 一次，離開時 unmount 不 reverse（保持輕量；返街景由 navbar 自己處理）。
   寫進 `app/globals.css` + 在 `tailwind.config.ts` 加 `roomShutterOpen: '...'` 進 animation map。

2. **Wall + floor 的「室內」格律**
   - 牆面：`linear-gradient(180deg, theme.skyTop 0%, theme.skyBottom 55%)` 加一層 `repeating-linear-gradient(90deg, transparent 0 47px, rgba(167,139,250,0.04) 47px 48px)` 模擬壁紙直紋（48px 為基本格）
   - 地板：viewport 下方 38%，`linear-gradient(180deg, #0a0418 0%, #050010 100%)` 鋪一層 `repeating-linear-gradient(0deg, transparent 0 11px, rgba(167,139,250,0.06) 11px 12px)` 像素地磚，**底邊加 1px solid var(--a3) 的踢腳線**（地/牆分界）
   - 窗：右上 1/3 區掛一面 **80×60 像素窗框**，內容是縮小版的當前 sceneStore SCENE（同一個 Sky 組件 transform: scale(0.18)），看出去就是「街景現在的天氣」— 室內看室外的小宇宙感

3. **屋主名牌：engraved pixel plaque**
   置於後牆中央偏左，**不是** HUD badge 風格 — 改成一塊銅雕質感的方牌：
   - 框：`box-shadow: 0 0 0 1px #b97f3a inset, 0 0 0 2px #1a0e22 inset, 0 1px 0 0 #1a0e22, 0 2px 0 0 #b97f3a` 模擬刻槽
   - 內容：第一行 character emoji（24px）、第二行 display_name（Press Start 2P, 14px, color: #ffd9a8）、第三行 role_label（VT323, 12px, color: var(--muted)）
   - 動畫：每 6 秒 `animate-pixelFlicker`（既有），讓刻字有微閃

**Editable chrome**（屋主限定）：
- 房名 inline editing：點房名 → 變一條像素輸入框（border-bottom: 2px dashed var(--amber)、blink caret）；ESC 取消 / Enter 送出；不彈 modal
- Theme 下拉：右下角小工具列，7 個 chip（每個 chip 是 24×24 縮圖 — 渲染對應 SCENE 的主色 swatch）；點擊瞬間整個房間 cross-fade 300ms 到新 theme

**Visual references**：
- 街景 navbar 的 nameplate（`/town/page.tsx:177-185`） — 不再用此 pattern，因為「室內」要有別於「街上」
- `frontend/components/scene/LeaderboardWindow.tsx` 的 `.pixel-edge` + halo glow — 用在「窗」的框
- `frontend/app/globals.css` `.pixel-btn` — 用在 theme chips

### 5) 路由 `app/town/room/[id]/page.tsx`（新）

頁面結構（單檔；超過 250 行再抽 component）：

```
┌─────────────────────────────────────────────────┐
│ Navbar: [← 回街景]   {room.name (editable)}      │  56px，沿用既有 navbar 風格
├─────────────────────────────────────────────────┤
│ ╭─[shutter-iris open animation, 600ms once]─╮   │
│ │                                           │   │
│ │   壁紙直紋 + 右上「室外窗」mini-scene       │   │
│ │                                           │   │
│ │            ┌──[名牌 engraved]──┐           │   │
│ │            │  🧑‍🎨               │           │   │
│ │            │  ALICE             │           │   │
│ │            │  pixel artisan     │           │   │
│ │            └────────────────────┘           │   │
│ │                                           │   │
│ │  像素地磚 + 踢腳線                           │   │
│ ╰───────────────────────────────────────────╯   │
│                                                 │
│                          [theme: ◐◑◒◓◔◕☄] ⚙ │  右下工具列
└─────────────────────────────────────────────────┘
```

掛載流程：
1. `useParams()` 拿 `id`
2. `roomApi.getById(id)`：成功 → 寫 `roomStore.myRoom`；403 → 顯示 "🔒 這間房需要 Phase 8 訪客機制"（同款 engraved plaque 風格，但內容是上鎖訊息 — 維持風格一致而非用陽春 div）
3. 確認 `room.owner_user_id === user.id` 才顯示編輯 UI
4. 編輯 name / theme → 樂觀更新 + `roomApi.updateMine` + 失敗 revert + 觸發 `coinPop` flash 確認

> **不**抽 InteriorScene 組件（YAGNI）。Wall/floor/window/plaque 都寫在 page.tsx 為 inline sub-components（`<Wallpaper theme={...} />`、`<Floor />`、`<OutsideWindow />`、`<OwnerPlaque char={...} />`）。Phase 5 開放裝飾時再 promote 到 `components/room/`。

### 6) Navbar 入口 `app/town/page.tsx`

在現有 navbar 右側 cluster（line ~177-185 區，「🛒 道具」之前）插入：

```tsx
<button
  className="pixel-btn"
  style={{
    background: "linear-gradient(180deg, rgba(252,211,77,0.14), rgba(252,211,77,0.06))",
    borderColor: "var(--amber)",
    color: "var(--amber)",
  }}
  onClick={async () => {
    const room = await roomApi.getMine();
    router.push(`/town/room/${room.id}`);
  }}
>🏠 我的房間</button>
```

特意用 amber（與 shop 的 teal、awards 的 a2 區隔）— 暗示「家」的暖色。

### 7) CSS additions（`app/globals.css` + `tailwind.config.ts`）

```css
@keyframes roomShutterOpen {
  0%   { clip-path: inset(50% 0 50% 0); }
  100% { clip-path: inset(0 0 0 0); }
}
@keyframes themeCrossfade {
  0%   { opacity: 0; }
  100% { opacity: 1; }
}
@keyframes plaqueFlicker {
  0%, 92%, 100% { filter: brightness(1); }
  94%           { filter: brightness(1.3); }
  96%           { filter: brightness(0.9); }
}
```

`tailwind.config.ts` animation map：
```ts
animation: {
  ...既有,
  roomShutterOpen: 'roomShutterOpen 600ms cubic-bezier(0.16, 1, 0.3, 1) both',
  themeCrossfade: 'themeCrossfade 300ms ease-out both',
  plaqueFlicker: 'plaqueFlicker 6s infinite',
},
```

### 8) 視覺：theme 影響背景

`SCENES[theme]` 已有 `skyTop / skyBottom / starOpacity` 等 token。房間頁的 `<Wallpaper>` 讀取 `SCENES[room.theme]` 兩個 sky 色作為牆面 gradient，**並不**呼叫 `useSceneStore.setScene(theme)`（街景的 SCENE cycle 與房間 theme 解耦 — 街景由時間驅動，房間由屋主選擇）。**這是刻意的**：未來房間 theme 可以加入街景沒有的色票（如 cozy、cafe），不必同步。

> **不新增 SCENES**。Phase 4 用既有 7 個，與後端 ALLOWED_THEMES 對齊；新 theme 在 Phase 5 / 之後再開。

## Verification

### Unit tests — `backend/tests/unit/test_room_service.py`（新）

1. `get_or_create_for_user` 首次 → 建房；name 為 `{display_name} 的房間`；theme `night`；visibility `public`
2. `get_or_create_for_user` 第二次 → 回傳同一筆（不新增）
3. `get_or_create_for_user` user 不存在 → `NotFoundError("user_not_found")`
4. `get_or_create_for_user` 並發（FakeRoomRepo 強拋 IntegrityError）→ service 重讀 → 回到既存 room（不再 raise）
5. `update` name 空字串 / 65 char → `BusinessError("invalid_room_name")`
6. `update` theme 非白名單 → `BusinessError("invalid_room_theme")`
7. `update` 正常 → 回傳更新後 room，name/theme 已變
8. `get_by_id` 非屋主 → `ForbiddenError("room_not_accessible")`
9. `get_by_id` 屋主 → 200

### API integration / E2E（本地 docker compose）

1. `docker compose exec backend alembic upgrade head` → migration 0004 成功
2. alice 登入 → `GET /me/room` → 200 + lazy-created room
3. 第二次 `GET /me/room` → 同一筆（DB row 不變）
4. `PUT /me/room {name:"alice 的書房", theme:"dawn"}` → 200
5. `GET /rooms/{alice_room_id}` 以 alice 身份 → 200
6. `GET /rooms/{alice_room_id}` 以 bob 身份 → 403 `room_not_accessible`
7. 前端：alice 點 navbar「🏠 我的房間」→ `/town/room/{id}`
8. 頁面顯示 alice 名牌 + 名稱 + theme（背景套 dawn 色票）
9. 改名 / 切 theme → 樂觀更新 → 重新整理仍生效

### Regression

- 既有 39 個 unit tests + 36 個 password-reset tests（75/75）全綠
- `ruff check .` 不新增錯誤（基線 16）
- `pnpm typecheck && pnpm lint && pnpm build` 全綠

## Decisions Made

| Decision | Choice | Why |
|----------|--------|-----|
| 一人幾間房 | 1 間（UNIQUE on owner_user_id）| Roadmap 限制；多間可後期擴 |
| Lazy create 位置 | `GET /me/room` first call | Endpoint 自然語意；客戶端不用 POST |
| Lazy create 並發 | DB UNIQUE + service catch IntegrityError | 與 Phase 2 idempotency 慣例一致 |
| 進房機制 | `visibility="public"` default；Phase 8 點街上頭像進房 | 用戶選定；schema 預埋 enum |
| theme 來源 | 復用 SCENES 7 個值 | 零新增視覺資產；前後端共享列舉 |
| theme 驗證 | domain layer 白名單 + Pydantic Literal | 雙重防線 |
| URL 用 room.id | first-class entity | Phase 8 shareable URL；不綁 owner_user_id |
| owner-only GET /rooms/{id} | Phase 4 限制；Phase 8 放寬 | 不擋未來，但本 Phase 不暴露任何訪客面 |
| FK ON DELETE | CASCADE on owner_user_id | 房間隨使用者生死；future Phase 5/7 同樣 cascade |
| WS 廣播 | **無**（Phase 4 單人） | YAGNI；Phase 8 才啟用 `room:{id}` |
| Presence integration | **無**（不切 `in_room`）| Phase 8 才處理；roadmap 已明確分工 |
| 房間名 default | `{display_name} 的房間` | 預設不空白；使用者可立即改 |
| max_visitors | 5（hard-coded default） | Roadmap 規定；schema 留欄位但 Phase 4 不開放修改 |
| 室內視覺方向 | 8-bit interior：壁紙直紋 + 像素地磚 + 室外窗 + engraved 名牌 | 從街景過渡到室內要有記憶點；不抽元件、所有 inline |
| 入場動畫 | `roomShutterOpen` 8-bit 百葉窗 600ms | 「打開」勝於「載入」；只在 mount 跑一次 |
| 房間 theme vs sceneStore | 解耦（不互相 set） | 街景由時間 cycle、房間由屋主選；未來可加房間限定 theme |
| 字型 | 不新增；維持 DotGothic16 / VT323 / Press Start 2P | 反 AI 一般化；既有三字夠表達層次（題字 / UI / 標題） |
| 新 component 抽取 | **不抽**（inline 在 page.tsx）| YAGNI；Phase 5 開放裝飾才 promote 到 `components/room/` |
| 「我的房間」按鈕色 | amber（var(--amber)）| 與 shop teal、awards a2 區隔，暗示「家」的暖色 |

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Concurrent lazy-create (同 user 同時兩個 tab 開房間) | DB UNIQUE + service catch IntegrityError → 重讀 |
| TimestampMixin server-side onupdate 在 async session 變 expired | `await session.refresh(row, ["updated_at"])` 在 create / update 後（Phase 3 既知陷阱） |
| Phase 5 / 7 / 8 改 schema | 預埋 `visibility` / `max_visitors`；FK CASCADE 設好；rooms 表本 Phase 後 freeze |
| theme 白名單與前端 SCENES 漂移 | 文件化「SCENES 是 source of truth」；新增 scene 時同步加進 `ALLOWED_THEMES` |
| 屋主誤刪自己 ID（DB 直改）→ room 孤兒 | CASCADE 自動清；不依賴應用層 |
| 前端進到非自己的房間 URL | API 直接 403；前端顯示 Phase 8 placeholder |
| 房間名 SQL injection / XSS | Pydantic schema 限 1-64 char；前端 React 預設 escape；無 raw SQL |
| `/me/room` 與 `/rooms/{id}` 命名衝突 | `/me/room` 一定在前；FastAPI 路徑解析時 `/me` 是 literal，不會被 `{room_id}` 抓住 |

## Files to Touch

### 新增

**Backend**
- `backend/app/domain/models/room.py`
- `backend/app/domain/repositories/room_repo.py`
- `backend/app/domain/services/room_service.py`
- `backend/app/infrastructure/db/models/room.py`
- `backend/app/infrastructure/db/repositories/room_repo.py`
- `backend/app/api/v1/rooms/__init__.py`
- `backend/app/api/v1/rooms/router.py`
- `backend/app/api/v1/rooms/schemas.py`
- `backend/alembic/versions/20260514_XXXX_0004_rooms.py`
- `backend/tests/unit/test_room_service.py`
- `plan_docs/04-phase4-room-model.md`（ExitPlanMode 後第一步：複製本檔內容過去）

**Frontend**
- `frontend/app/town/room/[id]/page.tsx`
- `frontend/lib/state/roomStore.ts`

### 修改

**Backend**
- `backend/app/api/v1/__init__.py` — 註冊 rooms_router
- `backend/app/core/deps.py` — 加 `get_room_repo` / `get_room_service` 兩個 Dep
- `backend/app/infrastructure/db/models/__init__.py` — re-export `RoomORM`（讓 alembic env 抓得到）

**Frontend**
- `frontend/lib/api/types.gen.ts` — 加 `Room` / `RoomTheme` / `RoomVisibility`
- `frontend/lib/api/endpoints.ts` — 加 `roomApi`
- `frontend/app/town/page.tsx` — navbar 右側加「🏠 我的房間」按鈕（amber 暖色，與 shop teal 區隔）
- `frontend/app/globals.css` — 加 `roomShutterOpen` / `themeCrossfade` / `plaqueFlicker` 三個 keyframe
- `frontend/tailwind.config.ts` — animation map 註冊上面三個

### 不動

- `frontend/components/scene/*` — Phase 4 不抽 InteriorScene；wall/floor/window/plaque 都 inline 在 page.tsx
- `backend/app/api/v1/ws/router.py` — Phase 4 沒有 WS 訊息
- `backend/app/domain/services/presence_service.py` — `in_room` 切換留給 Phase 8
- `frontend/lib/data/scenes.ts` — 7 個 SCENES 不擴；後端 ALLOWED_THEMES 對齊
- `frontend/components/scene/LeaderboardWindow.tsx` — 只「參考」`.pixel-edge` 樣式，不改檔

## Workflow

1. 開分支 `feat/phase-4`（從 main）
2. ExitPlanMode → 把本檔內容複製到 `plan_docs/04-phase4-room-model.md` 作為 canonical
3. 後端：domain → infra → API → migration → DI → unit tests（TDD 為佳）
4. `cd backend && pytest tests/unit -q` 75 + 9 = 84/84 全綠 + `ruff check .` 無新錯
5. `docker compose exec backend alembic upgrade head` 跑 migration 0004
6. 後端 API 跑得起來後跑 `./scripts/gen-api-types.sh` 對齊（或手寫 types.gen.ts，與前 3 Phase 一致）
7. 前端：types → endpoints → store → page → navbar entry
8. `cd frontend && pnpm typecheck && pnpm lint && pnpm build` 全綠
9. 多瀏覽器 E2E 煙霧：alice 跑完 Verification 第 7-9 步、bob 試 403
10. commit → push → `gh pr create --base main --head feat/phase-4`
11. PR merge 後 roadmap 表 Phase 4 → DONE，回填 commit + PR 連結

## Next After Phase 4

- Phase 5（房間布置）會擴 `room_items` 表 + `IRoomItemRepo`，沿用本 Phase 的 `IRoomRepo.get_by_owner` 取得房間 id
- Phase 7（音樂庫）擴 `room_tracks`
- Phase 8（訪客）放寬 `RoomService.get_by_id` 的 owner-only 規則；加 `visit / leave` 方法 + presence state 切換 + WS `room:{id}` chat / presence 廣播
