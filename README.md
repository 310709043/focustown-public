# Focus Town

社交番茄鐘 App — 像素城市場景、即時排行榜、夥伴配對、共同專注室（含 WebSocket 聊天）。

- **前端**：Next.js 15 + Tailwind + Zustand
- **後端**：FastAPI + SQLAlchemy 2 async + Alembic + Redis Pub/Sub + APScheduler
- **架構**：SOLID ports & adapters；MVP-but-extensible（細節見 [CLAUDE.md](./CLAUDE.md)）

---

## 30 秒啟動（給 QA / 新開發者）

需求：Docker Desktop + 8000 / 3000 / 5432 / 6379 port 未被佔用。

```bash
cp .env.example .env
docker compose up -d --build              # 第一次約 5-8 分鐘
docker compose exec backend alembic upgrade head
docker compose cp scripts/seed-dev-data.py backend:/tmp/seed.py
docker compose exec backend python /tmp/seed.py
```

完成後開啟：

| URL | 用途 |
|---|---|
| http://localhost:3000 | App（splash + 登錄表單） |
| http://localhost:8000/docs | SwaggerUI（後端 API） |
| http://localhost:8000/healthz | 健康檢查（回 `{"status":"ok"}`） |

**現成測試帳號**（seed 不會建立，需自己註冊或用這組）：

- email: `smoke@example.com`　密碼: `Smoketest123`
- ⚠ 註冊 email 不可用 `.local` / `.test` 等保留 TLD；用 `.com` / `.dev` / `.io`

---

## 音樂庫設定（V1 官方歌庫）

V1 為策展型歌庫，**不開放使用者上傳**。歌曲由 seed 從本機 MP3 灌入（檔案 gitignored，每位開發者自備）。

1. 把 5 首 royalty-free MP3 放進 `backend/assets/seed-tracks/`，檔名須對齊下表（其他檔名也會被 seed，但 mood 預設 `lofi`、title 由檔名推導）：

   | 檔名 | Title | Mood |
   |---|---|---|
   | `cold-ceramics.mp3` | Cold Ceramics | ambient |
   | `sunlight-on-the-floor.mp3` | Sunlight on the Floor | lofi |
   | `cold-windowpane.mp3` | Cold Windowpane | ambient |
   | `midnight-at-the-overpass.mp3` | Midnight at the Overpass | jazz |
   | `sunday-window.mp3` | Sunday Window | lofi |

2. 跑 seed（與「30 秒啟動」第 4 步相同指令，會把檔案複製到 `LocalFSStorage` 或 PUT 到 MinIO bucket）。seed 為 idempotent，重跑會跳過已存在的 title。

3. 想驗證 S3 串接行為（presigned URL + 302 redirect + Range），加上 `docker-compose.s3.yml` override：

   ```bash
   docker compose -f docker-compose.yml -f docker-compose.s3.yml up -d --build
   docker compose exec backend alembic upgrade head
   docker compose cp scripts/seed-dev-data.py backend:/tmp/seed.py
   docker compose exec backend python /tmp/seed.py
   ```

   | URL | 用途 |
   |---|---|
   | http://localhost:9001 | MinIO console（帳密 `minioadmin` / `minioadmin`） |
   | http://localhost:9000 | MinIO S3 API（瀏覽器走 presigned URL 進這裡） |

   驗收：MinIO console 內 `focustown-dev` bucket 應有 `tracks/<uuid>.mp3` × 5；前端 `/town` 的 PersonalRadio 播放時 DevTools Network 看到 `/api/v1/tracks/<id>/stream` 回 302 → `localhost:9000/...?X-Amz-Signature=...`。

   ⚠ 切到 S3 mode 後 `<audio>` 若仍被 CSP 擋，把 `.env` 的 `NEXT_PUBLIC_MEDIA_ALLOWED_ORIGINS` 加上 MinIO host（例：`http://localhost:8000,http://localhost:9000`）再 `docker compose restart frontend`。

切回預設 local-fs：`docker compose down && docker compose up -d`（不帶 override）。

---

## QA 測試清單

按順序跑、每步預期結果都列出來：

| # | 動作 | 預期結果 |
|---|---|---|
| 1 | `docker compose ps` | 5 個 container 全部 Up，postgres / redis healthy |
| 2 | 開 http://localhost:3000 | 看到 splash：像素 FT logo（3 倍大）、登錄表單、夜空有飛機飛過、星閃 |
| 3 | 表單登入或註冊新帳號 | 成功跳 `/select-character`（首註冊）或 `/town`（已選角色） |
| 4 | `/select-character`：填表單、選一個角色、點「進入小鎮」 | 跳 `/town` |
| 5 | `/town` 看到的元素：thick navbar / 中央 billboard（top-3 + AD SLOT）/ 19 棟建築物 / 10 個 NPC 在走 / 飛機 / 巨大「✦ 進入專注模式 ✦」按鈕 | 全部可見、有動畫 |
| 6 | 底部 Timer 點 ▶（44×44 大按鈕）→ 等 25 分（或先把 mode 改短休息 5 分） | 倒數開始；按鈕變 ⏸ 且 bigPulse 動畫；完成後 toast 通知 + 番茄圖示亮一格 |
| 7 | 點 leaderboard 的「✦ 找今晚的專注夥伴」 | MatchModal 開啟：64px 頭像旋轉光暈、10-segment 相容度條依序點亮 |
| 8 | 點 BigFocusCTA | 跳 `/focus/solo`：超大像素 timer（角落 bracket）、城市剪影背景、星空 |
| 9 | `/awards`：看排行榜 + 6 個成就 | 排行榜顯示你剛完成的番茄；6 個徽章圖示 |
| 10 | `/shop`：看 12 個商品 + FOCUS+ 訂閱卡 | 3 區（車車/場景/特效）每區 4 個；featured 商品有粉色框 |
| 11 | 兩個瀏覽器分頁登不同帳號 → A 接受配對 → 兩端進 `/focus/<id>`，A 送訊息 | B 即時收到（WebSocket） |

---

## 失敗處理

| 症狀 | 看哪、做什麼 |
|---|---|
| Container 起不來 | `docker compose logs <服務>` 看 stderr |
| 前端 500 + `Cannot find module './321.js'` | dev 快取壞了：`docker compose stop frontend && docker compose run --rm --no-deps frontend sh -c 'rm -rf /app/.next/*' && docker compose up -d frontend` |
| 後端 hash password 報 72-byte 錯 | bcrypt 版本，已在 `backend/pyproject.toml` pin `<4.1`；重 build：`docker compose build backend && docker compose up -d backend` |
| Email 註冊被拒 | 不能用 `.local` / `.test` TLD（pydantic 擋）。改 `.com` |
| WebSocket 收不到訊息 | F12 開 Network → WS frame；常見是 token 沒附；重新登入 |
| Migration 紅燈 | `docker compose exec backend alembic current` 看現在版本；空 DB 直接 `alembic upgrade head` |

---

## 開發者常用指令

```bash
# 看任一服務即時 log
docker compose logs -f backend|frontend|worker

# 進容器跑指令
docker compose exec backend bash
docker compose exec frontend sh

# 跑前端 type-check / production build / lint
docker compose exec frontend pnpm typecheck
docker compose exec frontend pnpm build
docker compose exec frontend pnpm lint

# 跑後端 ruff / pytest
docker compose exec backend ruff check .
docker compose exec backend pytest -q          # tests/ 目錄目前還空

# 重新產生前端 OpenAPI 型別（backend 要起著）
./scripts/gen-api-types.sh

# 進 Postgres
docker compose exec postgres psql -U focustown -d focustown
```

---

## Repo 結構

```
focustwon/
├── backend/           # FastAPI + SQLAlchemy 2 + Alembic
│   ├── app/
│   │   ├── core/      # config, deps (DI), security, events bus, clock, ids
│   │   ├── domain/    # 純業務：models、repository Protocols、services、strategies
│   │   ├── infrastructure/  # 具體實作（DB、Redis、JWT、APScheduler、S3 stub…）
│   │   ├── api/v1/    # FastAPI routers（每個 feature 一個 subpackage）
│   │   ├── main.py    # app factory
│   │   └── worker.py  # APScheduler entry（獨立 process）
│   └── alembic/       # migrations
├── frontend/          # Next.js 15 App Router + Tailwind + Zustand
│   ├── app/           # routes: /, /signin, /signup, /select-character,
│   │                  #         /town, /focus/[id], /awards, /shop
│   ├── components/    # scene / panels / focus-room / modals / ui / town
│   └── lib/           # api, ws, state stores, hooks, data (CHARACTERS, NPCS, ...)
├── scripts/           # gen-api-types.sh, seed-dev-data.py
├── infra/             # AWS CDK placeholder（V2 才寫）
├── docker-compose.yml
├── .env.example
└── CLAUDE.md          # 給 Claude session 的工程指引（DI flow、SOLID ports）
```

---

## 下一步擴充（指向關鍵檔）

- 配對演算法：新增 `ICompatibilityStrategy` impl → `backend/app/domain/services/strategies/`
- 真實 Auth：填 `backend/app/infrastructure/auth/providers/cognito.py`，env 設 `AUTH_PROVIDER=cognito`
- 真實 AWS S3：`S3Storage`（`backend/app/infrastructure/storage/s3.py`）已實作，本機透過 MinIO 驗證；正式環境留空 `S3_ENDPOINT_URL` / `S3_PUBLIC_ENDPOINT_URL` 走 IAM role + AWS 預設 endpoint，並把 `STORAGE_BACKEND=s3` 與 `S3_BUCKET` 帶入
- 重啟使用者上傳：恢復 `ITrackRepo.delete` / `count_by_uploader` + 後端 `POST/DELETE /api/v1/tracks` + 前端 `UploadForm`；需先補版權聲明與檢舉流程（見 PR #29 描述）
- 新背景任務：在 `backend/app/worker.py` 加 coroutine + `scheduler.schedule_interval(...)`
- AWS 部署：見 [`infra/README.md`](./infra/README.md)（CDK stack 規劃 + 成本估算）
