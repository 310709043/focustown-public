# Phase 2 — T 幣錢包 + 真實購買

> Status: **DRAFT (awaiting approval → implementation)**
> Roadmap entry: see `plan_docs/00-roadmap.md` Phase 2
> Depends on: Phase 1 (DONE)
> Unblocks: Phase 3 (avatar 裝備 — 從 user_items 讀)，Phase 5 (房間布置道具)

## Context

Phase 1 把街景接上真實使用者。Phase 2 要建立「靠專注賺幣 → 商店消費」的循環，這是把 Focus Town 從「展示用」升級到「有經濟系統」的關鍵 phase。使用者明確說 **T 幣是平台原生幣，未來會整合 Visa + 加密幣**，所以資料模型必須一次設計到位 — 不能只是在 `shop_items` 加一個 `price_coins` 欄位 (那會被 Phase 10 整合支付時打掉重練)。

## Scope

### In Scope (Phase 2 要做完)

- 完整的 multi-currency 資料模型 (T 幣為 MVP 唯一啟用幣別，TWD/USD/BTC 預留欄位)
- 賺取規則：`SessionCompleted` 事件 → 自動入帳 (idempotent，重複觸發只入帳一次)
- 購買流程：原子性扣款 + 庫存寫入 + 防雙重購買 (DB 約束)
- 完整 ledger (`wallet_transactions`) — 每一筆收支都有審計紀錄
- Navbar 持久 T 幣徽章 + 即時更新
- Shop 頁面：購買按鈕真正運作、餘額顯示、已擁有 badge、不足/已擁有錯誤提示
- 防止 EventBus subscriber 重複註冊 (CoinAwardService 在 lifespan 一次性註冊)

### Out of Scope (留給後續 Phase)

- 真實 Visa 串接 (Phase 10)
- 加密幣支付 (Phase 10+)
- 道具裝備 / 在街上顯示購買的車或頭像 (Phase 3)
- 道具贈送 / 二手市集 / 退款 (未來)
- AchievementService 的重複訂閱 bug 修復 (僅標 TODO，不在 Phase 2 修)
- 兌幣比例 / 商品折扣 / 限量道具 (未來)

### 賺取規則

- **30 分鐘專注 = 1 T**；15 分鐘 = 0.5 T；不滿 1 分鐘 = 0
- 內部公式：`award_minor_t = duration_seconds * 100 // 1800` (整數運算，cT = centiT)
- 15 min (900s) → 50 cT = 0.5 T ✅
- 30 min (1800s) → 100 cT = 1 T ✅
- 只在 `SessionCompleted` 觸發；`SessionAbandoned` / `SessionCancelled` 不入帳

## SOLID Design Overview

| 原則 | 應用 |
|------|------|
| **S** | `IWalletRepo` 只管錢包；`IUserItemRepo` 只管擁有；`IWalletTransactionRepo` 只管 ledger；`IShopItemPriceRepo` 只管價格；`WalletService` 只管收支；`PurchaseService` 編排購買；`CoinAwardService` 只處理事件→入帳 |
| **O** | 新幣別 (TWD/USD/BTC) 加在 `CURRENCIES` 字典與資料表 row，不需改 Service 程式碼 |
| **L** | 各 Protocol 實作可互換 (測試 fake / Postgres prod / 未來其他 DB) |
| **I** | Repo 與 Service 介面拆細；不會出現「上帝 service」拿著一堆無關 Repo |
| **D** | API router 與 Event handler 都依賴 Protocol，不直接 import SQLAlchemy / Redis |

## Data Model (1 column + 4 new tables)

Note: Postgres + SQLAlchemy 2 async + Alembic。**single migration** 涵蓋全部。

### 新增 1 個 lookup (in-app constant，不入 DB)

```python
# backend/app/domain/models/currency.py
@dataclass(frozen=True)
class CurrencyDef:
    code: str        # "T" | "TWD" | "USD" | "BTC"
    symbol: str      # "T" | "NT$" | "$" | "₿"
    minor_units: int # 1 unit = N minor (T=100, TWD=100, BTC=100_000_000)
    decimals: int    # display precision

CURRENCIES = {
    "T":   CurrencyDef(code="T",   symbol="T",   minor_units=100, decimals=2),
    "TWD": CurrencyDef(code="TWD", symbol="NT$", minor_units=100, decimals=0),  # NTD has no fractional
    # USD, BTC 預留，Phase 10 啟用
}
```

### 新增 4 張 table

```sql
-- 1) shop_item_prices: 每個商品可以有多幣別定價
CREATE TABLE shop_item_prices (
  id            VARCHAR(36) PRIMARY KEY,
  shop_item_id  VARCHAR(36) NOT NULL REFERENCES shop_items(id) ON DELETE CASCADE,
  currency_code VARCHAR(8)  NOT NULL,                -- "T" | "TWD" | ...
  amount_minor  BIGINT      NOT NULL CHECK (amount_minor > 0),
  active        BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (shop_item_id, currency_code)               -- 一個商品每幣別一個價
);
CREATE INDEX ix_shop_item_prices_item ON shop_item_prices (shop_item_id);

-- 2) user_wallets: 每個使用者每幣別一個錢包
CREATE TABLE user_wallets (
  id             VARCHAR(36) PRIMARY KEY,
  user_id        VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  currency_code  VARCHAR(8)  NOT NULL,
  balance_minor  BIGINT      NOT NULL DEFAULT 0 CHECK (balance_minor >= 0),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, currency_code)
);
CREATE INDEX ix_user_wallets_user ON user_wallets (user_id);

-- 3) wallet_transactions: 完整 ledger，每筆收支都記
CREATE TABLE wallet_transactions (
  id                   VARCHAR(36) PRIMARY KEY,
  user_id              VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  currency_code        VARCHAR(8)  NOT NULL,
  delta_minor          BIGINT      NOT NULL,          -- + credit, - debit
  reason               VARCHAR(32) NOT NULL,           -- "session_complete" | "purchase" | "admin_grant" | "refund"
  ref_type             VARCHAR(32),                    -- "focus_session" | "shop_item" | NULL
  ref_id               VARCHAR(36),
  balance_after_minor  BIGINT      NOT NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ix_wallet_txn_user_created
  ON wallet_transactions (user_id, created_at DESC);
-- Idempotency: 同一 reason+ref 對同一 user+currency 只能 credit 一次
CREATE UNIQUE INDEX ux_wallet_txn_idempotent
  ON wallet_transactions (user_id, currency_code, reason, ref_type, ref_id)
  WHERE reason IN ('session_complete', 'purchase');

-- 4) user_items: 使用者擁有的商品 (參考 user_achievements 的關聯表 pattern)
CREATE TABLE user_items (
  id                     VARCHAR(36) PRIMARY KEY,
  user_id                VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  shop_item_id           VARCHAR(36) NOT NULL REFERENCES shop_items(id) ON DELETE RESTRICT,
  acquired_via           VARCHAR(16) NOT NULL,         -- "purchase" | "grant"
  wallet_transaction_id  VARCHAR(36) REFERENCES wallet_transactions(id) ON DELETE SET NULL,
  acquired_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, shop_item_id)                       -- 同一道具不能買兩次
);
CREATE INDEX ix_user_items_user ON user_items (user_id);
```

### 既有 `shop_items.price_cents` 處理

- **不刪、不改** — 維持向後相容，避免 Frontend 既有 shop 顯示崩掉
- 在這個 phase 改成 **被忽略** — Shop UI 改成讀 `shop_item_prices`
- seed 腳本同步更新：所有 car/scene/effect 寫入 `T` 價格；`sub` (FOCUS+) 寫入 `TWD` 價格
- 未來 Phase 可移除 `price_cents` 欄位

## Backend — Domain Layer

### Protocols

```python
# backend/app/domain/repositories/wallet_repo.py
@dataclass(frozen=True, slots=True)
class Wallet:
    id: str
    user_id: str
    currency_code: str
    balance_minor: int

class IWalletRepo(Protocol):
    async def get(self, user_id: str, currency_code: str) -> Wallet | None: ...
    async def get_or_create(self, user_id: str, currency_code: str) -> Wallet: ...
    async def list_for_user(self, user_id: str) -> list[Wallet]: ...
    async def adjust(self, wallet_id: str, delta_minor: int) -> int: ...
    """Atomic: returns new balance, or raises InsufficientFunds if would underflow."""

# backend/app/domain/repositories/wallet_transaction_repo.py
@dataclass(frozen=True, slots=True)
class WalletTransaction:
    id: str
    user_id: str
    currency_code: str
    delta_minor: int
    reason: str
    ref_type: str | None
    ref_id: str | None
    balance_after_minor: int
    created_at: datetime

class IWalletTransactionRepo(Protocol):
    async def insert(self, *, id: str, user_id: str, currency_code: str,
                     delta_minor: int, reason: str, ref_type: str | None,
                     ref_id: str | None, balance_after_minor: int) -> WalletTransaction:
        """Raises IntegrityError on duplicate (idempotency boundary)."""
    async def list_for_user(self, user_id: str, *, limit: int) -> list[WalletTransaction]: ...

# backend/app/domain/repositories/user_item_repo.py
@dataclass(frozen=True, slots=True)
class UserItem:
    id: str
    user_id: str
    shop_item_id: str
    acquired_via: str
    acquired_at: datetime

class IUserItemRepo(Protocol):
    async def insert(self, *, id: str, user_id: str, shop_item_id: str,
                     acquired_via: str, wallet_transaction_id: str | None) -> UserItem:
        """Raises IntegrityError if user already owns the item."""
    async def list_for_user(self, user_id: str) -> list[UserItem]: ...
    async def owns(self, user_id: str, shop_item_id: str) -> bool: ...

# backend/app/domain/repositories/shop_item_price_repo.py
@dataclass(frozen=True, slots=True)
class ShopItemPrice:
    id: str
    shop_item_id: str
    currency_code: str
    amount_minor: int

class IShopItemPriceRepo(Protocol):
    async def list_for_item(self, shop_item_id: str) -> list[ShopItemPrice]: ...
    async def get(self, shop_item_id: str, currency_code: str) -> ShopItemPrice | None: ...
```

`IShopRepo` 擴充：`get_by_id(item_id)` (購買流程要查單一商品)。

### Services

```python
# backend/app/domain/services/wallet_service.py
class WalletService:
    """Credit / debit a user's wallet with full audit trail.

    All public methods are idempotent when called with the same
    (reason, ref_type, ref_id); the DB unique index is the authority.
    """
    def __init__(self, wallets: IWalletRepo, txns: IWalletTransactionRepo,
                 ids: IIdGenerator, clock: IClock): ...

    async def credit(self, *, user_id: str, currency_code: str,
                     amount_minor: int, reason: str,
                     ref_type: str | None = None, ref_id: str | None = None,
                     ) -> WalletTransaction: ...

    async def debit(self, *, user_id: str, currency_code: str,
                    amount_minor: int, reason: str,
                    ref_type: str | None = None, ref_id: str | None = None,
                    ) -> WalletTransaction:
        """Raises InsufficientFunds if balance < amount_minor."""

    async def get_balance_minor(self, user_id: str, currency_code: str) -> int: ...
```

```python
# backend/app/domain/services/purchase_service.py
class PurchaseService:
    """Buy a shop item with one of its supported currencies.

    Atomic invariants (one DB transaction):
      1. Wallet must have sufficient balance for the item's price in the chosen currency.
      2. User must not already own the item (UNIQUE (user_id, shop_item_id)).
      3. Ledger row, wallet adjustment, and user_items row all commit together.
    """
    def __init__(self, shop: IShopRepo, prices: IShopItemPriceRepo,
                 items: IUserItemRepo, wallets: WalletService,
                 ids: IIdGenerator): ...

    async def purchase(self, *, user_id: str, shop_item_id: str,
                       currency_code: str = "T") -> PurchaseResult:
        """Raises:
        - NotFoundError("item_not_found")
        - NotFoundError("price_not_available_in_currency")
        - ConflictError("already_owned")
        - BusinessError("insufficient_funds")
        """
```

```python
# backend/app/domain/services/coin_award_service.py
EARN_RATE_MINOR_PER_30MIN = 100   # 100 cT = 1 T per 30 min

class CoinAwardService:
    """Subscribes to SessionCompleted and credits T coins to the user.

    Subscription is registered ONCE at app startup (lifespan), not in __init__,
    so we avoid the duplicate-subscriber bug that afflicts AchievementService.
    """
    def __init__(self, wallets: WalletService): ...

    def register(self, bus: EventBus) -> None:
        bus.subscribe(SessionCompleted, self._on_session_completed)

    @staticmethod
    def compute_award_minor(duration_seconds: int) -> int:
        return max(0, duration_seconds * EARN_RATE_MINOR_PER_30MIN // 1800)

    async def _on_session_completed(self, event: SessionCompleted) -> None:
        award = self.compute_award_minor(event.duration_seconds)
        if award == 0:
            return
        try:
            await self._wallets.credit(
                user_id=event.user_id, currency_code="T",
                amount_minor=award, reason="session_complete",
                ref_type="focus_session", ref_id=event.session_id,
            )
        except IntegrityError:
            # Already credited — idempotency safety net.
            return
```

## Backend — Infrastructure Layer

新增 ORM：`WalletORM`、`WalletTransactionORM`、`UserItemORM`、`ShopItemPriceORM` (一個檔一張表，沿用 `infrastructure/db/models/` pattern)。

新增 SQL repo：`SqlWalletRepo`、`SqlWalletTransactionRepo`、`SqlUserItemRepo`、`SqlShopItemPriceRepo` (sibling to `SqlShopRepo`)。

`SqlWalletRepo.adjust(wallet_id, delta_minor)` 用 `UPDATE ... WHERE balance_minor + delta_minor >= 0 RETURNING balance_minor` 做原子扣款 — 失敗回 0 rows，service 層轉成 `InsufficientFunds`。

擴充 `SqlShopRepo.get_by_id`。

## Backend — API Layer

```
POST   /api/v1/shop/items/{item_id}/purchase    body: {currency_code: "T"}   → 201 PurchaseResponse
GET    /api/v1/me/wallet                                                      → list[WalletResponse]
GET    /api/v1/me/wallet/transactions?limit=20                                → list[WalletTransactionResponse]
GET    /api/v1/me/items                                                       → list[UserItemResponse]
GET    /api/v1/shop                                                            (既有，response 增加 prices: list[PriceDTO])
```

`POST .../purchase` 流程：
1. CurrentUserId 解析
2. `_service(db, ...)` 建 `PurchaseService`
3. `svc.purchase(user_id, item_id, currency_code)`
4. 同一 DB session、依 `get_db` 已封裝的 commit-on-success/rollback-on-exception 自動處理 atomicity
5. 返回 PurchaseResponse (item + new_balance + transaction_id)

錯誤 → 領域例外 → `FocusTownError` exception handler (既有) → JSON error envelope

## Backend — Subscription Wiring (修正既有 EventBus 模式)

**問題**：既有 `AchievementService.__init__` 直接呼叫 `events.subscribe()`，但每個 HTTP 請求都重新 instantiate，handler 會累積。

**Phase 2 不修這個 bug**，但 **CoinAwardService 不重蹈覆轍**：

```python
# backend/app/main.py 的 lifespan
@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    ...
    await init_redis(settings.redis_url)

    # Register domain event subscribers ONCE. CoinAwardService is stateless
    # except for its DB-bound dependencies, which it acquires per call
    # (see _open_db_session()).
    from app.core.deps import _event_bus
    from app.domain.services.coin_award_service import CoinAwardService
    coin_award = CoinAwardService(wallet_service_factory=_wallet_service_for_event)
    coin_award.register(_event_bus)
    ...
```

Wait — event handlers don't have a request-scoped DB session. They need to open their own. Two patterns:

- **A** Pass a `session_factory` to the service, open per-event
- **B** Use a long-lived session (dangerous)

Pattern A: `CoinAwardService` gets `session_factory: () -> AsyncSession`. On each event, opens a session, builds repos, commits.

```python
class CoinAwardService:
    def __init__(self, session_factory, clock, ids):
        self._session_factory = session_factory
        ...
    async def _on_session_completed(self, event):
        async with self._session_factory() as session:
            wallets = WalletService(SqlWalletRepo(session), ..., ids=self._ids, clock=self._clock)
            try:
                await wallets.credit(...)
                await session.commit()
            except IntegrityError:
                await session.rollback()  # idempotent skip
```

This is the clean pattern. `session_factory` injected in lifespan setup.

`AchievementService` should be refactored to this pattern too in a future Phase — flagged as known issue, NOT in Phase 2 scope.

## Migration Steps

1. **Alembic revision**: `alembic revision -m "add_wallet_and_items" --autogenerate`
   - autogenerate may not pick up new tables (target_metadata 設定要確認); 若不行則手寫 `upgrade()` / `downgrade()` 完整建表 SQL
2. **手動補上**: partial unique index `ux_wallet_txn_idempotent` (Alembic 不會 autogenerate 部分索引)
3. **Seed 更新** (`scripts/seed-dev-data.py`):
   - 每個 `car|scene|effect` item 寫入 `shop_item_prices(item_id, "T", amount_minor)` (取 `price_cents` 數字當 cT，例：4900 cents → 49 cT = 0.49 T)
   - `sub` (FOCUS+) item 寫入 `(item_id, "TWD", price_cents)` (保留 NT$129 = 12900 minor)
   - 為 3 個現有測試使用者 (alice/bob/carol) backfill `user_wallets(user_id, "T", 0)` 與 `user_wallets(user_id, "TWD", 0)` (lazy 建立也可，但 seed 階段建好更乾淨)

## Frontend Changes

### 1) Types (`lib/api/types.gen.ts` — 手寫，後續 gen-api 會覆寫)

```ts
export type ShopItemPrice = { currency_code: string; amount_minor: number };
export type ShopItem = {  // 擴充既有 type
  id: string; category: string; icon: string; name: string;
  description: string; price_cents: number; featured: boolean;
  prices: ShopItemPrice[];          // ← new
};
export type Wallet = { currency_code: string; balance_minor: number };
export type WalletTransaction = {
  id: string; currency_code: string; delta_minor: number;
  reason: string; balance_after_minor: number; created_at: string;
};
export type UserItem = {
  id: string; shop_item_id: string; acquired_via: string; acquired_at: string;
};
export type PurchaseResponse = {
  item_id: string;
  transaction: WalletTransaction;
  new_balance_minor: number;
};
```

### 2) API endpoints (`lib/api/endpoints.ts`)

```ts
export const walletApi = {
  list: () => apiFetch<Wallet[]>("/api/v1/me/wallet"),
  transactions: (limit = 20) =>
    apiFetch<WalletTransaction[]>(`/api/v1/me/wallet/transactions?limit=${limit}`),
};
export const userItemsApi = {
  list: () => apiFetch<UserItem[]>("/api/v1/me/items"),
};
export const purchaseApi = {
  buy: (itemId: string, currencyCode = "T") =>
    apiFetch<PurchaseResponse>(`/api/v1/shop/items/${itemId}/purchase`, {
      method: "POST",
      body: { currency_code: currencyCode },
    }),
};
```

### 3) Zustand store (`lib/state/walletStore.ts` — 新建)

```ts
// state: byCurrency: Record<string, number /* balance_minor */>
// actions: hydrate(), creditDelta(currency, delta), debitDelta(currency, delta), reset()
// selector: balanceFor(currency) -> number; format(currency) -> "1.25 T"
```

`(lib/state/userItemsStore.ts)` — 同樣 pattern：擁有的 item id Set + hydrate/add

### 4) WS push 即時餘額更新 (可選但建議)

後端在 `WalletService.credit/debit` 結束時透過 `IRealtimePublisher.publish(user_channel(user_id), {type: "wallet.updated", ...})` 推播；前端 `useRealtime` 在收到後更新 store。**Phase 2 範圍內加上** — 工作量 < 1 小時，UX 大躍進 (賺幣有即時回饋)。

### 5) Navbar 徽章 (`app/town/page.tsx`)

放在 `🛒 道具` link 左側，amber 配色 (T 幣專用色):

```tsx
<span title="T 幣餘額"
  style={{
    background: "rgba(252,211,77,0.08)",
    border: "1px solid rgba(252,211,77,0.4)",
    color: "var(--amber)",
    fontFamily: "VT323, monospace",
    /* ... */
  }}>
  💰 {formatT(balance_T_minor)}
</span>
```

### 6) Shop 頁面 (`app/shop/page.tsx`)

- 顯示 T 幣價格 (`prices.find(p => p.currency_code === "T").amount_minor / 100`)
- 購買按鈕：呼叫 `purchaseApi.buy(item.id)` → 樂觀更新 wallet store → server 回應後對齊
- 已擁有 → 按鈕改 "已擁有"，停用點擊
- 失敗 → toast 顯示「T 幣不足」或「已擁有」
- FOCUS+ subscription 卡仍用 `TWD` 價格、按鈕 stub (Phase 10 才實作)

### 7) Self-purchase celebration (small UX flourish)

按下購買成功時，從按鈕中心發散一個 amber 粒子動畫 (300ms scale + fade)。與既有 `animate-statusPop` 等 keyframes 同風格。

## Verification

### Unit tests (backend, 純 fake)

`tests/unit/test_wallet_service.py`：
- credit / debit 改變餘額正確
- 同 (reason, ref) 第二次 credit → IntegrityError → 上層 swallow
- 餘額不足 debit → InsufficientFunds

`tests/unit/test_purchase_service.py`：
- 正常購買 → user_items 出現、wallet 扣款、ledger 一筆
- 已擁有 → ConflictError
- 餘額不足 → InsufficientFunds
- 無此價格幣別 → NotFoundError

`tests/unit/test_coin_award_service.py`：
- compute_award_minor(0) → 0
- compute_award_minor(900) → 50
- compute_award_minor(1800) → 100
- compute_award_minor(1500) → 83
- 兩次同 session_id 呼叫 → 第二次 silently skip

### Integration test (backend, 需要 Postgres + Redis — 用 docker compose)

`tests/integration/test_purchase_flow.py`：
- 建 user + seed shop_items + 初始錢包 100 cT
- 1) 商品價 50 cT → 購買成功，餘額剩 50
- 2) 再次購買同商品 → 409 already_owned
- 3) 購買另一個 80 cT 商品 → 400 insufficient_funds

### E2E manual (本地多使用者)

```bash
# 先停服務、清資料 (因為要重跑 alembic with new tables)
docker compose down -v
docker compose up -d
docker compose exec -T backend alembic upgrade head
docker compose cp scripts/seed-dev-data.py backend:/tmp/seed.py
docker compose exec -T backend python /tmp/seed.py
```

1. **Chrome window 1** 登入 alice → `/town` → 看 navbar 💰 0.00 T
2. 開始 30 分鐘 focus session → 完成 → 預期 navbar 變 💰 1.00 T (WS 推播)
3. 進 `/shop` → 找 50 cT (0.50 T) 的商品 → 點購買 → 餘額剩 0.50 T、卡片顯示「已擁有」
4. 再點同商品 → toast「已擁有」、按鈕禁用
5. 點 0.80 T 商品 → toast「T 幣不足」
6. **另一個瀏覽器** 登入 bob，完成 session → 看到自己餘額增加；alice 那邊不受影響 (各自獨立)

### 既有測試 regression

- `tests/unit/test_presence_service.py` 仍需通過 (8/8)
- `pnpm typecheck + lint + build` 仍綠

## Decisions Made (in this plan)

| Decision | Choice | Why |
|----------|--------|-----|
| Earning rate | 30 min = 1 T, 公式 `secs*100//1800` cT | 用戶明確指定 15/30 min 對應 0.5/1 T |
| Currency model | 獨立 `shop_item_prices` 表 + `user_wallets` 表，多幣別 | 用戶明確要求未來支援 Visa + 加密幣 |
| Internal precision | centiT (1 T = 100 minor), BIGINT | 整數無浮點誤差；BIGINT for crypto headroom |
| Award trigger | 只在 `SessionCompleted` (非 abandoned/cancelled) | 不獎勵未完成的努力，避免 farming |
| Idempotency | partial unique index on wallet_transactions | DB-level 保證；不靠 app 邏輯 |
| Item uniqueness | UNIQUE (user_id, shop_item_id) — 不能重複買 | Phase 2 不做消耗品；未來加 `quantity` 欄位再說 |
| EventBus subscriber 位置 | lifespan 註冊一次 (CoinAwardService) | 避免 AchievementService 既有的 per-request 重複註冊 bug |
| AchievementService bug 修復 | 不修 (out of scope) | Phase 2 已夠複雜；標 TODO 給未來 phase |
| `shop_items.price_cents` 處理 | 保留欄位但忽略 (UI 改讀 prices 表) | 不破壞既有 seed，未來 phase 再 drop column |
| Wallet 餘額即時更新 | WS push (`wallet.updated` 事件至 user channel) | 賺幣立刻看到，UX 高回饋 |
| Visa / 加密幣 串接 | 不在 Phase 2 (Phase 10) | 範圍守紀律；資料模型已預埋擴充點 |

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Race condition: 同時兩個請求買同商品 | `UPDATE ... RETURNING` 原子扣款 + `UNIQUE(user_id, shop_item_id)` 雙保險 |
| SessionCompleted 觸發兩次 (網路重試) | partial unique index 在 wallet_transactions |
| Postgres autogen 不認得 partial index | Phase 2 migration **手寫** 完整 upgrade()/downgrade()，不依賴 autogen |
| WalletService 在 event handler 拿不到 db session | `session_factory` 注入；handler 開新 session、commit、close |
| 浮點精度 | 全程整數運算 (cT、minor)；前端只在 format() 才除以 100 |
| 既有 AchievementService 重複訂閱 | 已存在的 bug，與 Phase 2 隔離；標 TODO，不擴大影響 |
| Seed 重跑時資料衝突 | Seed 內所有 INSERT 用 `ON CONFLICT DO NOTHING` (achievements seed 已是這個 pattern) |

## Files to Touch

### 新增

**Backend**
- `app/domain/models/currency.py` — `CurrencyDef` + `CURRENCIES` constant
- `app/domain/repositories/wallet_repo.py` — `IWalletRepo` + `Wallet` dataclass
- `app/domain/repositories/wallet_transaction_repo.py`
- `app/domain/repositories/user_item_repo.py`
- `app/domain/repositories/shop_item_price_repo.py`
- `app/domain/services/wallet_service.py`
- `app/domain/services/purchase_service.py`
- `app/domain/services/coin_award_service.py`
- `app/infrastructure/db/models/{wallet,wallet_transaction,user_item,shop_item_price}.py`
- `app/infrastructure/db/repositories/{wallet,wallet_transaction,user_item,shop_item_price}_repo.py`
- `app/api/v1/wallet/router.py` + `schemas.py` (`GET /me/wallet`, `GET /me/wallet/transactions`)
- `app/api/v1/items/router.py` + `schemas.py` (`GET /me/items`)
- `app/api/v1/shop/purchase.py` (擴充 shop router 加 POST /items/{id}/purchase)
- `alembic/versions/000X_wallet_and_items.py` — 手寫
- `tests/unit/test_wallet_service.py`
- `tests/unit/test_purchase_service.py`
- `tests/unit/test_coin_award_service.py`
- `tests/integration/test_purchase_flow.py` (optional)

**Frontend**
- `lib/state/walletStore.ts`
- `lib/state/userItemsStore.ts`
- `components/town/CoinBadge.tsx` (extracted from navbar inline)
- `app/globals.css` — `@keyframes coinPop` (購買成功粒子)
- `tailwind.config.ts` — `animate-coinPop`

### 修改

**Backend**
- `app/api/v1/__init__.py` — 註冊 wallet + items router
- `app/api/v1/shop/router.py` — 加 POST /items/{id}/purchase；list 回傳含 prices
- `app/api/v1/shop/schemas.py` — `ShopItemResponse` 加 `prices` 欄位
- `app/domain/repositories/shop_repo.py` — 加 `get_by_id` Protocol method
- `app/infrastructure/db/repositories/shop_repo.py` — 加 `get_by_id` 實作
- `app/infrastructure/db/repositories/__init__.py` — 匯出新 repos
- `app/core/deps.py` — 加 `WalletServiceDep` (factory-style) + 確保 session_factory 可從 lifespan 拿到
- `app/main.py` — lifespan 內註冊 CoinAwardService
- `app/core/exceptions.py` — 加 `InsufficientFunds` (若無)
- `scripts/seed-dev-data.py` — 寫入 shop_item_prices + 初始化測試 user 錢包

**Frontend**
- `lib/api/endpoints.ts` — `walletApi`, `userItemsApi`, `purchaseApi`
- `lib/api/types.gen.ts` — 加 `Wallet`, `WalletTransaction`, `UserItem`, `PurchaseResponse`, `ShopItemPrice`；`ShopItem` 加 prices
- `lib/ws/client.ts` — 加 `wallet.updated` 訊息類型
- `app/town/page.tsx` — 掛載 walletApi hydrate + WS subscribe + 加 `<CoinBadge />`
- `app/shop/page.tsx` — 改用 T 幣顯示、串 purchase API、已擁有狀態
- `plan_docs/00-roadmap.md` — Phase 2 狀態欄

## Next After Phase 2

- 回 `plan_docs/00-roadmap.md` Phase 2 → DONE
- 直接接 Phase 3 (Avatar / 車輛裝備) — 因為 user_items 已建好，Phase 3 主要是「讀 user_items + 在街景渲染裝備」
