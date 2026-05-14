# Phase 3 — Avatar / 車輛裝備

> Status: **DRAFT (awaiting approval → implementation)**
> Roadmap entry: see `plan_docs/00-roadmap.md` Phase 3
> Depends on: Phase 1 (街景接真實使用者 — DONE)、Phase 2 (user_items + 購買 — DONE)
> Unblocks: Phase 5 (房間布置中重用 render_meta JSONB)

## Context

Phase 2 讓使用者可以買到 4 種 car 商品 (霓虹跑車、復古計程車、F1 賽車、星空巴士)，但**買來後在街上看不出來** — 街景的車仍然套用 `character.bodyColor / roofColor` (來自 character_key 的內建調色盤)。Phase 3 把「擁有」變成「展示」：使用者可以「裝備」一輛買來的車，街景上的車身顏色 + 車牌 emoji 就會切換成那輛車的視覺。

這也建立「個人外觀」第二個維度的基礎 (Phase 3 完成「車」；avatar/人物換裝因為目前還沒有 avatar 類型的商品，schema 預埋但 UI 暫不開放)。

## Scope

### In Scope

- 後端：`users.equipped_vehicle_item_id` 欄位 + `equipped_avatar_item_id` (前者啟用、後者預埋)
- 後端：`shop_items.render_meta` JSONB 欄位 — 描述商品的視覺屬性 (車輛用 `{icon, body_color, roof_color}`)
- 後端：`EquipmentService` (domain) + `PUT /api/v1/me/equipment` API
- 後端：`/presence/street` response 含已裝備車輛的 render_meta
- 後端：`/auth/me` response 含 `equipped_vehicle` (使用者重新登入或進站時能正確還原裝備狀態)
- 後端：裝備變動 → WS `presence.changed { equipment_changed: true }` 推送，其他客戶端觸發 rehydrate
- 後端：seed 4 個 car 商品的 render_meta (顯示獨特顏色，與 30 人花名冊調色盤區隔)
- 前端：`CarsLane` 渲染時優先讀 user.vehicle.render_meta，沒有則 fallback 到 character 預設
- 前端：Shop 頁面 car 類別卡片加「裝備 / 卸下 / 裝備中」三態按鈕
- 前端：`presenceStore` 新增 force-rehydrate 路徑、自身裝備同步到 authStore

### Out of Scope (留給後續 Phase)

- avatar 類別商品 (目前沒有 avatar 類別 shop_item — 預埋欄位即可)
- 服裝/帽子/effect 等多槽位裝備 (Phase 3 只有單一車輛槽位)
- 街景中的「進場切換」動畫 (車身顏色直接變)
- 商品贈送 / 二手交易 / 退款 (未來)
- AchievementService 重複訂閱 bug 修復 (與 Phase 2 同列 TODO)

## SOLID Design Overview

| 原則 | 應用 |
|------|------|
| **S** | `EquipmentService` 只管「裝備關係」；`IUserItemRepo.owns()` 仍是擁有檢查的唯一入口；`PresenceService.list_street` 仍只負責收集，hydration 用新的 `IVehicleViewRepo`/查詢 |
| **O** | 加 `equipped_avatar_item_id` (此 Phase 不用) 不需改任何 service；未來 avatar 類別商品上線時，UI 換一個 mounting point 即可 |
| **L** | `render_meta` JSONB 任何結構都接受，僅在 service 層用 dataclass 標型 (VehicleRenderMeta)；測試可用 dict |
| **I** | 新 Protocol `IShopItemReadRepo.get_render_metas(ids)` 不再硬塞到既有 `IShopRepo`，避免介面膨脹 |
| **D** | API router 與 Equipment service 都依賴 Protocols，不直接 import SQLAlchemy |

## Data Model

### Migration `0003_equipment.py` (手寫)

```sql
-- users 新增兩個 nullable FK 到 shop_items
ALTER TABLE users
  ADD COLUMN equipped_vehicle_item_id VARCHAR(36)
    REFERENCES shop_items(id) ON DELETE SET NULL,
  ADD COLUMN equipped_avatar_item_id VARCHAR(36)
    REFERENCES shop_items(id) ON DELETE SET NULL;

-- shop_items 新增 render_meta JSONB
ALTER TABLE shop_items
  ADD COLUMN render_meta JSONB NULL;

-- (optional) index for street view: SELECT users WHERE equipped_vehicle_item_id IS NOT NULL
CREATE INDEX ix_users_equipped_vehicle
  ON users (equipped_vehicle_item_id)
  WHERE equipped_vehicle_item_id IS NOT NULL;
```

**Why FK 到 `shop_items` (而不是 `user_items`)**：
- 簡化「資料隔離」— shop_items 永遠存在 (即使 user_items 被刪)
- Service 層做 ownership 檢查 (`IUserItemRepo.owns()`)，DB 不用做 join 來驗證
- ON DELETE SET NULL：若 shop_item 被官方下架，所有裝備此商品的使用者會自動退裝 (而不是 RESTRICT 阻止下架)

### `shop_items.render_meta` JSONB 慣例

```jsonc
// 車輛 (category=car):
{ "icon": "🚗", "body_color": "#a855f7", "roof_color": "#6b21a8" }

// 場景 / 特效：Phase 5 / 未來再定義
null
```

Service 層用 Pydantic v2 `VehicleRenderMeta(BaseModel)` 從 JSONB 解析；解析失敗 → 視同 `null` (容錯)。

## Backend — Domain Layer

### Protocol 擴充

`backend/app/domain/repositories/user_repo.py`

```python
async def update_equipment(
    self,
    *,
    user_id: str,
    equipped_vehicle_item_id: str | None | UnsetType = UNSET,
    equipped_avatar_item_id: str | None | UnsetType = UNSET,
) -> User:
    """Partial update — only fields actually passed are written.

    UNSET sentinel needed because ``None`` is a meaningful value
    (= 退裝). The sentinel distinguishes "don't touch" from "set to NULL".
    """
```

(Define `UNSET` + `UnsetType` in `app/core/sentinels.py`; reuse if exists.)

### User domain extend

`backend/app/domain/models/user.py`

```python
@dataclass(slots=True)
class User:
    id: str
    email: str
    display_name: str
    character_key: str | None
    role_label: str | None
    is_active: bool
    equipped_vehicle_item_id: str | None    # NEW
    equipped_avatar_item_id: str | None     # NEW (forward-compat)
    created_at: datetime
    updated_at: datetime
```

### EquipmentService (新)

`backend/app/domain/services/equipment_service.py`

```python
@dataclass(slots=True, frozen=True)
class VehicleRenderMeta:
    icon: str
    body_color: str
    roof_color: str

class EquipmentService:
    """Validates ownership + flips the equip pointer + broadcasts."""

    def __init__(
        self,
        users: IUserRepo,
        user_items: IUserItemRepo,
        shop: IShopRepo,                         # for render_meta lookup
        publisher: IRealtimePublisher,
    ): ...

    async def equip_vehicle(
        self, *, user_id: str, shop_item_id: str | None
    ) -> User:
        """Set equipped_vehicle. shop_item_id=None unequips."""
        if shop_item_id is not None:
            item = await self._shop.get_by_id(shop_item_id)
            if item is None:
                raise NotFoundError("item_not_found")
            if item.category != "car":
                raise BusinessError("item_not_a_vehicle")
            if not await self._user_items.owns(
                user_id=user_id, shop_item_id=shop_item_id
            ):
                raise ForbiddenError("item_not_owned")

        user = await self._users.update_equipment(
            user_id=user_id,
            equipped_vehicle_item_id=shop_item_id,
        )
        await self._pub.publish(
            STREET_CHANNEL,
            {
                "type": "presence.changed",
                "user_id": user_id,
                "state": "on_street",
                "equipment_changed": True,
            },
        )
        return user
```

### PresenceService.list_street 擴充

加入 vehicle render_meta hydration：

```python
@dataclass(slots=True, frozen=True)
class StreetUser:
    id: str
    display_name: str
    character_key: str | None
    status: str
    vehicle: VehicleRenderMeta | None    # NEW

async def list_street(self, users: IUserRepo, shop: IShopRepo, *, cap: int):
    entries = await self._tracker.list(state="on_street")
    user_rows = await users.get_many_by_ids([e.user_id for e in entries])
    # Collect distinct equipped vehicle ids and bulk-fetch their render_meta
    vehicle_ids = {u.equipped_vehicle_item_id for u in user_rows
                   if u.equipped_vehicle_item_id}
    render_metas = await shop.get_render_metas(list(vehicle_ids))   # new repo method
    ...
    # Combine into StreetUser
```

`IShopRepo.get_render_metas(ids: list[str]) -> dict[str, dict | None]` — bulk SELECT to avoid N+1.

## Backend — Infrastructure Layer

### ORM 更新

`backend/app/infrastructure/db/models/user.py`:

```python
equipped_vehicle_item_id: Mapped[str | None] = mapped_column(
    String(36),
    ForeignKey("shop_items.id", ondelete="SET NULL"),
    nullable=True,
)
equipped_avatar_item_id: Mapped[str | None] = mapped_column(
    String(36),
    ForeignKey("shop_items.id", ondelete="SET NULL"),
    nullable=True,
)
```

`backend/app/infrastructure/db/models/shop_item.py`:

```python
from sqlalchemy.dialects.postgresql import JSONB

render_meta: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
```

### SqlUserRepo 擴充

加 `update_equipment` (同 `update_profile` 的 partial-update pattern；用 UNSET 哨兵)。

### SqlShopRepo 擴充

加 `get_render_metas(ids)` — `SELECT id, render_meta FROM shop_items WHERE id IN (...)`，回 dict。

## Backend — API Layer

### 新檔 `app/api/v1/equipment/router.py` + `schemas.py`

```
PUT /api/v1/me/equipment
body: { vehicle_item_id?: string | null, avatar_item_id?: string | null }
→ 200 EquipmentResponse: { equipped_vehicle?: VehicleRenderMeta }
```

兩種語意：
- key 沒帶 → 不變動
- key 帶 `null` → 卸下
- key 帶字串 → 裝備指定 shop_item_id (驗證所有權 + 類別)

### `/auth/me` 擴充

回應 schema 加 `equipped_vehicle: VehicleRenderMeta | null` (重新整理頁面要能還原狀態)。`auth/router.py` 在 build response 時呼叫 shop.get_render_metas 拿一筆。

### `/presence/street` 擴充

response 加 `vehicle: VehicleRenderMeta | null` (per user)。Phase 1 客戶端已經有 `presenceApi.listStreet()` 呼叫，這次只是 payload 變大；frontend 型別同步擴充即可。

### WS `presence.changed` 擴充

加新欄位 `equipment_changed?: boolean`。客戶端視為 force-rehydrate 訊號。其他既有欄位 (state / status) 保持向後相容。

## Frontend Implementation

### 1) 型別 (`lib/api/types.gen.ts`)

```ts
export type VehicleRenderMeta = {
  icon: string;
  body_color: string;
  roof_color: string;
};

export type StreetUser = {
  id: string; display_name: string;
  character_key: string | null; status: string;
  vehicle: VehicleRenderMeta | null;          // NEW
};

export type User = {
  id: string; email: string; display_name: string;
  character_key: string | null; role_label: string | null;
  equipped_vehicle_item_id: string | null;    // NEW
  equipped_vehicle: VehicleRenderMeta | null; // NEW (hydrated)
};
```

### 2) API client (`lib/api/endpoints.ts`)

```ts
export const equipmentApi = {
  setVehicle: (vehicleItemId: string | null) =>
    apiFetch<{ equipped_vehicle: VehicleRenderMeta | null }>(
      "/api/v1/me/equipment",
      { method: "PUT", body: { vehicle_item_id: vehicleItemId } },
    ),
};
```

### 3) WS 訊息 (`lib/ws/client.ts`)

加 `equipment_changed?: boolean` 到 `presence.changed` variant 上。

### 4) Store 變更

`presenceStore.applyDelta`：

```ts
if (msg.equipment_changed) {
  return { ...prev, pendingRehydrate: true };
}
```

(優先級高於既有 status/state 分支。)

`authStore`：加 `setEquippedVehicle(meta)` action — 從 equipmentApi 回應寫入，UI 立刻反應。

### 5) `CarsLane.tsx` 渲染邏輯

```tsx
const ch = findCharacter(user.character_key) ?? fallbackCharacter(user.id);
const v = user.vehicle;  // 可能 null
const body = v?.body_color ?? ch.bodyColor;
const roof = v?.roof_color ?? ch.roofColor;
const plateEmoji = v?.icon ?? ch.emoji;
// 套到既有 JSX 即可
```

### 6) Shop 頁面：裝備 toggle

`car` 類別商品卡片在「已擁有 ✓」狀態下，**取代** 「購買 / 已擁有」按鈕為：

- 未裝備此車 → 「👤 裝備」(amber 描邊)
- 已裝備此車 → 「✓ 裝備中」(teal 實心) 點擊卸下
- 點擊呼叫 `equipmentApi.setVehicle(item.id | null)` → 更新 authStore + 樂觀 UI

Visual flourish (frontend-design 指引)：裝備成功時也用既有 `animate-coinPop` keyframe 出 "✦ 裝備" 字樣。

### 7) Seed 更新

`scripts/seed-dev-data.py` 為 4 個 car 商品填 `render_meta` (不同色系，與 30 人花名冊調色盤刻意拉開)：

```python
{ "category": "car", "icon": "🚗", "name": "霓虹跑車",
  "render_meta": {"icon": "🚗", "body_color": "#a855f7", "roof_color": "#6b21a8"} },
{ "category": "car", "icon": "🚕", "name": "復古計程車",
  "render_meta": {"icon": "🚕", "body_color": "#fbbf24", "roof_color": "#b45309"} },
{ "category": "car", "icon": "🏎️", "name": "F1 賽車",
  "render_meta": {"icon": "🏎️", "body_color": "#dc2626", "roof_color": "#7f1d1d"} },
{ "category": "car", "icon": "🚌", "name": "星空巴士",
  "render_meta": {"icon": "🚌", "body_color": "#1e3a8a", "roof_color": "#0c1d4f"} },
```

如果 shop_items 已存在 (Phase 2 已 seed)：seed script 改為 backfill `UPDATE shop_items SET render_meta=... WHERE name=...`。

## Verification

### Unit tests (backend, 純 fake)

`tests/unit/test_equipment_service.py` (新)：
- 裝備未擁有的 → ForbiddenError("item_not_owned")
- 裝備非 car 類別 → BusinessError("item_not_a_vehicle")
- 裝備不存在的 id → NotFoundError("item_not_found")
- 裝備自己擁有的 car → User.equipped_vehicle_item_id 更新；publisher 收到 equipment_changed=true
- 卸下 (vehicle_item_id=None) → 欄位變 None；publisher 一樣推送

`tests/unit/test_presence_service.py` 既有測試擴充：
- `list_street` 回的 StreetUser 含 vehicle (test fixture 給 user 一個 equipped_vehicle_item_id + fake shop.get_render_metas)
- 未裝備使用者 → vehicle=None

### E2E (本地 docker compose)

1. 重啟 docker compose 跑新 migration
2. seed 重跑 (backfill render_meta)
3. 用 alice signin → 確認 /auth/me 含 `equipped_vehicle: null`
4. alice 完成 30 min session → 賺 100 cT
5. alice 買 F1 賽車 (120 cT 太貴；先讓她多跑 session 或改先試 50 cT 復古計程車)
6. `PUT /me/equipment {vehicle_item_id: "<taxi_id>"}` → 200
7. `GET /presence/street` → alice 那筆 `vehicle: {icon:"🚕", body_color:"#fbbf24", ...}`
8. 多瀏覽器：bob 視窗已開著街景；alice 一裝備，bob 視窗的 alice 那輛車立刻變黃色 (WS push → rehydrate)
9. `PUT /me/equipment {vehicle_item_id: null}` → 卸下；街景車身顏色回到 character 預設色

### Regression

- 既有 30 個單元測試 (Phase 1 + 2) 全綠
- frontend `pnpm typecheck + lint + build` 全綠

## Decisions Made (in this plan)

| Decision | Choice | Why |
|----------|--------|-----|
| 裝備類別 | 本 Phase 只啟用 car；avatar 預埋欄位但無 UI | 目前沒有 avatar 類商品 |
| 裝備數量 | 每類別單一槽位 (vehicle 一個) | MVP 簡單；多槽位等需求出現 |
| FK 目標 | `users.equipped_*_item_id` 指向 `shop_items.id`，service 層查 ownership | 簡化 schema；ownership 是領域邏輯 |
| ON DELETE | SET NULL | 商品下架不該打死 user 紀錄 |
| render_meta | JSONB on `shop_items` | 彈性、未來 avatar/scene/effect 可擴 |
| 視覺 fallback | 沒裝備 → 用 character 預設 (Phase 1 行為) | 體驗連續性 |
| 廣播 | `presence.changed { equipment_changed: true }` | 重用既有 channel；client 觸發 rehydrate |
| 自身狀態同步 | PUT 回應寫進 authStore | 不靠 WS 自循環推自己 |
| 退裝 | `vehicle_item_id: null` body | 對稱、明確、不另開 endpoint |
| 跨類別誤裝 | 後端 reject (`item_not_a_vehicle`) | 防呆 |
| Avatar UI | Phase 3 不開放，欄位預埋 | YAGNI but extension-ready |

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| 商品下架但裝備未清 | FK ON DELETE SET NULL 自動處理 |
| 大量在線時 list_street + 每人 render_meta → N+1 | `get_render_metas(ids)` bulk SELECT |
| render_meta 格式不一致 | service 層 Pydantic 解析；失敗視同 null 而非 500 |
| 同一車輛瞬間多次 equip toggle | 後端 idempotent (重複 PUT 相同 vehicle_item_id 不報錯)；前端按鈕 disabled 直到回應 |
| 既有 user_items 與裝備的關係 (Phase 2 已建) | ownership 仍以 user_items 為 source of truth；裝備指標獨立 |
| 既有 Phase 2 seed 已建 shop_items 沒 render_meta | seed script 走 `UPDATE ... WHERE name=` 路徑 backfill |

## Files to Touch

### 新增

**Backend**
- `app/domain/services/equipment_service.py` (含 `VehicleRenderMeta` dataclass)
- `app/api/v1/equipment/__init__.py`
- `app/api/v1/equipment/router.py`
- `app/api/v1/equipment/schemas.py`
- `app/core/sentinels.py` (若不存在；定 `UNSET` + `UnsetType`)
- `alembic/versions/20260514_XXXX_0003_equipment.py`
- `tests/unit/test_equipment_service.py`

**Frontend**
- (無新檔；既有元件擴充 + types/api/store 加欄位)

### 修改

**Backend**
- `app/domain/models/user.py` — User dataclass 加兩個 equipped_* 欄位
- `app/domain/repositories/user_repo.py` — IUserRepo 加 `update_equipment`
- `app/domain/repositories/shop_repo.py` — `IShopRepo` 加 `get_render_metas(ids)` + `ShopItemRecord` 加 `render_meta` 欄位
- `app/infrastructure/db/models/user.py` — 加兩個 FK 欄位
- `app/infrastructure/db/models/shop_item.py` — 加 `render_meta: JSONB`
- `app/infrastructure/db/repositories/user_repo.py` — `_to_domain` 帶上新欄位、加 `update_equipment` 實作
- `app/infrastructure/db/repositories/shop_repo.py` — `get_render_metas` 實作、`_to_record` 帶 render_meta
- `app/domain/services/presence_service.py` — `StreetUser` 加 vehicle；`list_street` 取 render_meta
- `app/api/v1/presence/router.py` + `schemas.py` — 回應加 vehicle；router 注入 SqlShopRepo
- `app/api/v1/auth/router.py` + `schemas.py` — `/me` response 加 `equipped_vehicle`
- `app/api/v1/__init__.py` — 註冊 equipment router
- `app/api/v1/ws/router.py` (no change — equipment 不從 WS inbound 進)
- `scripts/seed-dev-data.py` — 補 render_meta backfill 流程
- `tests/unit/test_presence_service.py` — fixture 與 assertion 加 vehicle 欄位

**Frontend**
- `lib/api/types.gen.ts` — 加 `VehicleRenderMeta`、`User`/`StreetUser` 加欄位
- `lib/api/endpoints.ts` — 加 `equipmentApi`
- `lib/ws/client.ts` — `presence.changed` 加 `equipment_changed?: boolean`
- `lib/state/presenceStore.ts` — `applyDelta` 處理 equipment_changed signal
- `lib/state/authStore.ts` — 加 `setEquippedVehicle` action
- `components/scene/CarsLane.tsx` — 渲染優先取 user.vehicle.render_meta
- `app/shop/page.tsx` — car 類別卡片加裝備 toggle

## Next After Phase 3

- 回 `plan_docs/00-roadmap.md` Phase 3 → DONE
- 接 Phase 4 (Room model — 每人有「我的房間」入口)。Phase 5 (房間布置) 會重用 Phase 3 的 `render_meta` JSONB pattern 給 scene/decoration items。
