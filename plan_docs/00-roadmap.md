# Roadmap: Virtual Town with Rooms, Shop, Avatars, Music

> 本檔為 Focus Town 整體開發 roadmap。所有 Phases 先標 PENDING，未來逐 Phase 開細部 plan (建議命名 `plan_docs/<NN>-<phase-name>.md`) → implement → 回填本檔狀態。

## Context

原始討論起點是「讓多人在房間裡一起聽 MP3」，但實際願景遠大於音樂同步：Focus Town 要成為「多間書房 / 咖啡廳」概念的虛擬世界 — 使用者打造自己的空間、邀請朋友來訪、聽自己挑的音樂、布置裝飾。本文件審查 codebase 現況、明確定義目標、並把工作拆成可逐步 plan→implement 的 Phases。

## Vision (使用者描述的終局)

1. 使用者進入伺服器 → 主畫面是一條街，街上有不同頭像的「人 / 車」流動，**每個人 / 車都對應一個真實使用者**
2. 商店：購買「房間裝飾道具」與「自身頭像 (人物 / 車輛)」
3. 房間音樂庫：使用者把喜歡的音樂存到「自己的房間」內，進入房間時挑一首播放
4. 房間訪客：一間房一次最多 5 人，**訪客只能被動聽音樂 + 看房間布置**；訪客在房間期間**不出現在街道上**
5. 因此需要：商店 + 創造房間 + 布置房間 (飾品 + 音樂)

進房機制由使用者在後續 Phase 細部 plan 時再定義 (邀請碼 / 公開列表 / 朋友才能進……皆未定)。

## Codebase Audit (2026-05-14)

### ✅ 已存在且可用

| 模組 | 位置 | 狀態 |
|------|------|------|
| 街景視覺 (CSS 動畫) | `frontend/components/scene/{Pedestrians,CarsLane,Sky,Buildings,...}.tsx` | 完整，但渲染**假 NPC** |
| 角色花名冊 (30 人) | `frontend/lib/data/characters.ts` | emoji + bodyColor + roofColor，已連 `character_key` |
| Shop 列表 API + UI | `backend/app/api/v1/shop/`, `frontend/app/shop/page.tsx` | GET 可用，購買鈕**無功能** |
| ShopItem ORM + table | `backend/app/infrastructure/db/models/shop_item.py` + migration `0001_initial_schema` | 分類 `car \| scene \| effect \| sub` |
| WebSocket + `room:{id}` channel | `backend/app/api/v1/ws/router.py:47-68`, `frontend/lib/ws/client.ts` | 已可訂閱多 channel、Redis pub/sub 已串好 |
| MusicPanel UI 原型 | `frontend/components/panels/MusicPanel.tsx` | 5 首寫死 lofi，無後端、無同步 |
| LocalFSStorage 適配器 | `backend/app/infrastructure/storage/local_fs.py` | 可直接收 MP3 |
| Scene 系統 (7 場景) | `frontend/lib/data/scenes.ts` | 場景切換 (與「房間布置」不同) |
| Leaderboard | `backend/app/domain/services/leaderboard_service.py`, `LeaderboardPanel.tsx` | 今日完成數 |

### ❌ 不存在 / 需新建

| 缺什麼 | 後果 |
|--------|------|
| `User.coins` / wallet 欄位 | 無法做購買 |
| `user_items` / inventory table | 買了東西無法保存 |
| 購買 API (POST /shop/purchase) | 商店只能看不能買 |
| `Room` model (owner_id, decoration_state, ...) | 沒有「我的房間」概念 |
| `room_items` (放在房間的裝飾) | 無法布置 |
| `Track` model + library API | 沒有真正的音樂資料層 |
| `room_tracks` (房間音樂庫) | 無法存「我的房間音樂」 |
| 線上使用者列表 API / Presence 持久化 | 街景無法渲染真實使用者 |
| `User.state` (在街上 / 在房間 / 離線) | 訪客進房後街景無法把他移除 |
| Music playback WS events (`music.play/pause/seek`) | 無多人同步機制 |
| S3 adapter 實作 | AWS 部署時無 MP3 storage |

### ⚠️ Stub / 部分

- `infrastructure/storage/s3.py` → `NotImplementedError`
- `infrastructure/auth/providers/cognito.py` → `NotImplementedError`
- `infrastructure/notifications/ses.py` / `sns.py` → `LogNotifier` 為 MVP impl

## Goal Definition

「Done」的具體判準：

- [ ] 街上看到的每個人/車 = 真實在線使用者 (而非假 NPC)
- [ ] 使用者完成 focus session 可賺取 coins，能用 coins 在商店買道具
- [ ] 使用者可在「我的房間」頁面放置買來的裝飾
- [ ] 使用者可在房間內保存最多 N 首音樂 (curated library 挑選)
- [ ] 訪客可進入別人房間 (最多 5 人)，被動聽屋主播放的音樂、看屋主的裝飾
- [ ] 訪客在房間期間從街景消失，離開時回到街景
- [ ] 音樂播放在房內多使用者間同步 (誤差 < 1 秒，allow drift correction)
- [ ] 本地 docker compose 可完整跑通；AWS swap path 對每個元件都有對應的 adapter 替換點

## Architecture Principles (重用既有的 seam)

- 後端業務邏輯一律進 `domain/` (純 Protocol)，AWS-specific 在 `infrastructure/`，**不要繞過**
- 新 port → 同時新增 `base.py` (Protocol) + MVP impl + 預埋 AWS impl stub
- 多人房間訊息一律走 `IRealtimePublisher` → Redis pub/sub，**不要**直接戳 WebSocket
- 房間相關 channel 命名沿用 `room:{id}` (已實作)
- DTO 流：domain dataclass ↔ ORM ↔ API schema，三者分離
- 前端 transport：所有 HTTP 走 `lib/api/client.ts`，所有 WS 走 `lib/ws/client.ts`，不要新建第二個 transport

## Phased Roadmap (all PENDING — plan each individually)

> 啟動每個 Phase 時：在 `plan_docs/` 建 `<NN>-<phase-name>.md` 做細部 plan，本檔對應行的 PENDING 改成 IN-PROGRESS，完成後改 DONE 並回填 commit / PR 連結。

### Phase 1 — 街景接上真實使用者　〔DONE 2026-05-14〕

**Deliverable**: 街上的人 / 車從假 NPC 換成真實在線使用者。

- 後端：在線使用者列表 API (`GET /users/online`)、WS presence 廣播持久化 (Redis SET 或 in-memory TTL)
- 後端：`User.state` 欄位或 derived field (`on_street | in_room | offline`)
- 前端：`Pedestrians.tsx` + `CarsLane.tsx` 改吃真實 list (每 N 秒輪詢 或 WS push)
- 不動：角色花名冊 (character_key 已綁定使用者)

**Key files**: `Pedestrians.tsx`, `CarsLane.tsx`, `ws/router.py`, 新 `users_online_service.py`
**AWS swap**: presence Redis 直接指向 ElastiCache，無變動

---

### Phase 2 — 虛擬貨幣 + 真實購買　〔DONE 2026-05-14〕

**Deliverable**: 完成 focus session 賺 coins → 商店購買 → 庫存記錄。

- 後端：`User.coins` 欄位 + Alembic migration
- 後端：`user_items` table (user_id, shop_item_id, acquired_at)
- 後端：`POST /api/v1/shop/purchase` + transactional 扣款 + 防重複購買
- 後端：focus session 完成事件 → 增加 coins (event subscriber)
- 前端：shop 頁面購買鈕真正運作、餘額顯示
- 不動：FOCUS+ 訂閱付費 (留 stub，未來再做)

**Key files**: `shop/router.py`, `shop/service.py` (新), `user.py` (model), `events.py`
**AWS swap**: 純資料層，無外部依賴

---

### Phase 3 — Avatar / 車輛裝備　〔DONE 2026-05-14〕

**Deliverable**: 買來的角色 / 車輛在街上實際渲染。

- 後端：`User.equipped_avatar_item_id` / `equipped_vehicle_item_id`
- 後端：`PUT /me/equip` API
- 前端：街景渲染時讀使用者裝備 (而非預設 character_key)
- 前端：個人頁面 / 房間入口可換裝

**Key files**: `Pedestrians.tsx`, `CarsLane.tsx`, `users/router.py`, `characters.ts` (擴充)
**Depends on**: Phase 1 (街景接真實使用者), Phase 2 (買得到道具)

---

### Phase 4 — Room model (空房間)　〔IN-PROGRESS〕

**Deliverable**: 每個使用者自動擁有一間空房，可以進去 (只有自己)。

- 後端：`rooms` table — id, owner_user_id, name, theme, max_visitors=5, created_at
- 後端：`GET /me/room`、`PUT /me/room` (改名 / 主題)
- 後端：lazy 建立 (第一次訪問時自動建)
- 前端：`/town/room/[id]` 路由，目前只渲染空房 + 屋主名牌

**Key files**: 新 `backend/app/domain/models/room.py`、`api/v1/rooms/`、`frontend/app/town/room/[id]/page.tsx`
**Open Q (plan 時定)**: 進房機制 (邀請碼 / 公開列表 / 朋友圈)

---

### Phase 5 — 房間布置 (decoration)　〔PENDING〕

**Deliverable**: 屋主可把買來的飾品擺進房間、儲存位置。

- 後端：`room_items` table (room_id, user_item_id, x, y, z_index, rotation)
- 後端：`PUT /me/room/decoration` 批次儲存
- 前端：拖拉式布置 UI (drag & drop 到房間 canvas)
- 前端：訪客模式渲染 (read-only，no drag)
- 商店分類擴充：`furniture | decoration` (sql migration)

**Key files**: 新 `room_items` model、`rooms/router.py` (擴充)、前端 decoration canvas component
**Depends on**: Phase 2 (有道具可買), Phase 4 (有房間)

---

### Phase 6 — Track library + LocalFSStorage 串接　〔DONE 2026-05-14, Tier-2〕

**Deliverable**: 後端真正能存 / 播放 MP3 (本地)。

- 後端：`tracks` table — id, title, artist, file_key, duration_ms, license
- 後端：`GET /tracks` (公開 library)、`GET /tracks/{id}/stream` (回 LocalFS 路徑或 presigned-like URL)
- 後端：seed script 放 3-5 首測試 MP3 (royalty-free lofi)
- 前端：library 列表 UI (預備供 Phase 7 房間音樂庫挑選)
- 不動：使用者上傳自有 MP3 (留待未來)

**Key files**: 新 `tracks` model、`tracks/router.py`、`scripts/seed-dev-data.py` (擴充)
**AWS swap**: `LocalFSStorage` → `S3Storage` (要實作 boto3 presigned)、`/tracks/{id}/stream` 改回 S3 URL
**Open Q**: 串流方式 — direct file response vs Range request vs HLS (MVP 用 direct + Accept-Ranges 即可)

---

### Phase 7 — 房間音樂庫 (per-room saved tracks)　〔PENDING〕

**Deliverable**: 屋主可把 library 裡的歌「加入我的房間」、儲存清單。

- 後端：`room_tracks` table (room_id, track_id, order)，每房上限 N (e.g. 20)
- 後端：`POST /me/room/tracks`、`DELETE /me/room/tracks/{id}`
- 前端：房間頁面內「我的音樂」分頁，可從 library 加入 / 移除

**Key files**: 新 `room_tracks` model、`rooms/router.py` (擴充)、前端 music tab
**Depends on**: Phase 4 (Room), Phase 6 (Track library)

---

### Phase 8 — 進房 / 離房　〔PENDING〕

**Deliverable**: 訪客真的能進入別人房間，從街景消失，回到街景時再出現。

- 後端：`POST /rooms/{id}/visit` → server-side enforce ≤ 5 visitors
- 後端：`POST /rooms/{id}/leave`
- 後端：`User.state` 切換 (`on_street ↔ in_room`)、影響 Phase 1 的 online list
- 後端：WS 自動 `add_channels(["room:{id}"])` on visit / `remove` on leave
- 前端：點別人街上的 avatar / 從某入口 → 嘗試進房、被拒/被准
- 前端：房間頁面右下角訪客列表 (≤ 5)

**Key files**: `rooms/router.py` (visit/leave)、`ws/router.py` (channel 管理)、`users_online_service.py` (state 改動)
**Depends on**: Phase 4 (Room exists), Phase 1 (street uses real users)
**Open Q (plan 時定)**: 進房機制具體 UX (點擊街上頭像？房間列表？邀請？)

---

### Phase 9 — 房間音樂多人同步播放　〔PENDING〕

**Deliverable**: 屋主播放音樂時，所有訪客 (≤ 5) 聽到同一首、同一時間點 (誤差可接受)。

- 後端：`Room.playback_state` (current_track_id, started_at_ms, paused_at_ms, is_playing)
- 後端：WS 事件 `music.play | music.pause | music.seek | music.change` 透過 `IRealtimePublisher`
- 後端：權限 — 只有屋主能控制 (visitor 收事件但不能發)
- 前端：HTMLAudioElement 配合 server-authoritative 時間軸；每 N 秒做 drift 校正 (大於 ±500ms 則 seek)
- 前端：訪客 UI 隱藏控制鈕、只顯示「正在播放」資訊

**Key files**: `rooms/router.py` (playback state)、`ws/router.py` (新訊息類型)、`MusicPanel.tsx` (改寫成 room-aware)
**Depends on**: Phase 6 (Track), Phase 7 (Room music library), Phase 8 (Visit)
**測試**: Playwright 開多 browser context 模擬 N 個 visitor，斷言四個 audio 元素的 currentTime 差距 < 1s
**Open Q (plan 時定)**: 是否做 fade in/out、跨歌單自動下一首

---

### Phase 10 — AWS 部署路徑　〔PENDING〕

**Deliverable**: 把 MVP 從 docker compose 搬到 AWS，所有 stub adapter 換成真實 AWS adapter。

- `S3Storage`：實作 boto3 presigned URL、CloudFront OAC 簽名 URL (MP3 透過 CDN 發)
- `CognitoProvider`：實作 JWKS 驗證 (User Pool)
- ElastiCache Redis：替換 docker compose 內 Redis (pub/sub 行為一致)
- ECS Fargate / App Runner：backend + worker 兩個 service
- RDS Postgres
- ALB：**不需要** sticky sessions (Redis pub/sub 已 handle 跨 process 廣播)
- CDK stack：見 `infra/README.md` 草稿 (尚未實作)
- 成本估算 (每月)

**Key files**: `infrastructure/storage/s3.py`、`infrastructure/auth/providers/cognito.py`、新 `infra/cdk/`
**Depends on**: 至少 Phase 6 (有 MP3 要放 S3) 與 Phase 9 (跨容器 WS sync 要驗證)

---

## Cross-Cutting Concerns (每個 Phase 都要顧)

- **資料庫遷移**：每 Phase 新增 ORM 都要 `alembic revision --autogenerate`，PR 前 review 生成檔
- **OpenAPI types**：後端 API 改動後跑 `./scripts/gen-api-types.sh` 更新 `frontend/lib/api/types.gen.ts`
- **不繞過 `IRealtimePublisher`**：任何房間訊息都走 Redis 通道，不直接戳 socket
- **Hexagonal 守則**：`domain/` 不能 import `sqlalchemy` / `fastapi`，否則 Phase 10 swap 會卡
- **CRT/grain/vignette overlay** 維持在 `app/layout.tsx`，房間頁面共用
- **Quality gates** (mirror CI)：`ruff + pytest` + `pnpm typecheck + lint + build`

## Verification Strategy (高層次，逐 Phase 細化)

- **每 Phase E2E**：本地 docker compose 起所有服務 → 至少 2 個瀏覽器 (incognito) 登入不同 seeded user → 跑 happy path
- **多人模擬**：Phase 8+ 用 Playwright 多 browser context (≥ 3) 自動化跑訪客流
- **同步精度** (Phase 9)：Playwright 注入 page script，每 500ms 抓所有 audio 元素的 `currentTime`，計算最大差距
- **不能本地測的**：跨地理 / 高延遲網路 — 留待 Phase 10 AWS 真機驗證；Phase 9 可用 Chrome DevTools throttle 模擬 3G/Slow-4G

## Open Questions (per phase 細部 plan 時收斂)

1. 進房機制 (Phase 4 / 8)：點街上頭像？公開房列表？朋友邀請？混合？
2. Coins 取得方式 (Phase 2)：只靠完成 focus session？登入獎勵？任務系統？
3. 商品定價策略 (Phase 2)：所有 shop_items 目前 `price_cents` (法幣) — coins 改寫還是新欄位 `price_coins`？
4. 訪客可否聊天 (Phase 8)：reference.html 原型 + 現有 ChatPanel 已支援，需確認權限模型
5. 音樂版權 (Phase 6)：curated 全部要 royalty-free，需要 license 欄位追蹤
6. 房間布置座標系 (Phase 5)：絕對 px / 百分比 / grid？響應式如何處理？
7. 街景容量上限 (Phase 1)：在線 1000 人時街上要全部渲染嗎？分頁 / 視覺取樣？

每個 Open Q 在啟動該 Phase 的細部 plan 時，先用 AskUserQuestion 確認再動工。

## Status Log

| Date | Phase | Action | Note |
|------|-------|--------|------|
| 2026-05-14 | — | Roadmap 建立 | 所有 Phase 1-10 標 PENDING |
| 2026-05-14 | 1 | 細部 plan 完成 + 程式碼實作 | 8/8 unit tests 通過、frontend typecheck+lint+build 全綠；docker compose smoke test pending |
| 2026-05-14 | 1 | Smoke test 通過 ➜ DONE | WS lifecycle 4 messages 全收到、`/presence/street` 上線下線正確切換；ready for Phase 2 |
| 2026-05-14 | 2 | T 幣經濟系統實作 ➜ DONE | 22 個新單元測試 (累積 30/30)、ruff 0 新錯、front quality gates 全綠；session→earn→buy→wallet WS push 整條 pipeline 通過、4 個錯誤路徑 (409/402/404) 正確；副帶修了 EventBus log 的 structlog kwarg 衝突 bug |
| 2026-05-14 | 3 | Avatar / 車輛裝備實作 ➜ DONE | 9 個新單元測試 (累積 39/39)、ruff 0 新錯 (基線 17→16)；裝備 API 4 個錯誤路徑 (403/400/404/200-unequip) 正確；多瀏覽器 WS equipment_changed 廣播驗證通過；CarsLane 渲染優先 vehicle.render_meta；副帶修了 UserORM.updated_at 在 async session 重新整理時的 MissingGreenlet bug |
| 2026-05-14 | 6 | Track library Tier-2 ➜ DONE (parallel to Phase 4 worktree) | 平行於另一 worktree 之 Phase 4 (Room) 開發。Tier-2 切片：tracks 表 + GET /tracks (mood filter) + GET /tracks/{id}/stream (Range 206 partial) + POST /tracks (multipart, MIME magic + 15 MB 限制 + 每人 10 首 quota) + DELETE /tracks/{id} (owner-only)。22 個新單元測試 (累積 97/97 全綠)、ruff 11 (基線 15→11，net -4)、frontend typecheck+lint+build 全綠。前端 /town/library 頁 + MusicPanel 改吃 backend。Tier-3 (S3 adapter) 留 Phase 6b plan。Alembic 雙 head (本 phase 0004 + Phase 4 也將 0004) 合並時須 `alembic merge`。詳見 plan_docs/04-phase6-track-library.md。
