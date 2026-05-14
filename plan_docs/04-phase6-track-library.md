# Phase 6 (Tier-2) — Track Library + User Upload

> 與另一 worktree 之 Phase 4 (Room model) 平行開發。本檔為 detail plan，配套於 `00-roadmap.md` 的 Phase 6 條目。

## Status

- **Started**: 2026-05-14
- **Branch**: `feat/phase-ind-4`
- **Parallel to**: Phase 4 (rooms) on another worktree
- **Roadmap deviation**: 原 Phase 6 是 curated seed library；本 Tier-2 切片加入 **user upload + per-user quota**，但**不**做真 S3 (留 Phase 6b) 與**不**做房間整合 (Phase 7/9)。

## Context

Phase 1-3 已合並進 `main`。Roadmap 中除 Phase 6 外，所有其他 phase 都直接或遞移依賴 Phase 4，因此本 worktree 取 Phase 6 作為平行工作。

使用者最終願景是「user upload → S3 → 房間 realtime 同步」，但「尚未設計」。本 plan 採 Tier-2 切片，在不踩 Phase 4 / Phase 10 任何檔案的前提下，把 user-upload 流程能做的部分先落地，S3 swap 留 `core/deps.py` dispatch seam 開放。

## Scope (Tier-2)

完成判準：

- [ ] 後端 `tracks` 表：metadata + mood + uploaded_by_user_id + LocalFS file_key
- [ ] `GET /api/v1/tracks?mood=...` — 公開列表
- [ ] `GET /api/v1/tracks/{id}` — 單筆 metadata
- [ ] `GET /api/v1/tracks/{id}/stream` — **Range-request StreamingResponse** (HTTP 206)，支援 HTML5 audio 拖拉
- [ ] `POST /api/v1/tracks` — multipart upload (auth 必需，每人上限 10 首，MIME 與檔案大小驗證)
- [ ] `DELETE /api/v1/tracks/{id}` — 僅上傳者本人
- [ ] LocalFSStorage 寫 `storage_root/tracks/{id}.mp3`；S3 adapter 留 stub
- [ ] Seed 3 首 placeholder 靜音 MP3
- [ ] 前端 `/town/library` 頁：列表 + mood filter + 上傳表單 + 播放 + 刪除
- [ ] 前端 `MusicPanel` 改吃 backend，mood tabs 變真 filter
- [ ] `pytest -q` + `ruff check .` 全綠；新增 ≥ 10 個測試
- [ ] `pnpm typecheck && pnpm lint && pnpm build` 全綠
- [ ] docker compose E2E：登入 → 上傳 → 播放 → 跨帳號可見 → 配額/MIME 守住

## Non-goals (本 phase 不做)

- 真 S3 adapter (`infrastructure/storage/s3.py`) → Phase 6b
- 房間音樂庫 (`room_tracks`) → Phase 7 (依賴 Phase 4)
- 多人同步播放 (`music.*` WS 事件) → Phase 9
- 多部分上傳 / >15 MB / 病毒掃描 / 版權聲明 → Phase 6b
- 每人 MB 配額 (本 phase 僅做首數上限)

## 與 Phase 4 的協調點

| 檔案 | Phase 4 | 本 phase | 衝突類型 |
|---|---|---|---|
| `backend/alembic/versions/0004_*.py` | `0004_rooms_table.py` | `0004_tracks_table.py` | **語意**：兩個 head，merge 時須 `alembic merge -m "..."` 產生 `0005_merge_*.py` |
| `backend/app/core/deps.py` | `get_room_repo` + `RoomRepoDep` | `get_track_repo` + `TrackRepoDep` + `get_storage` + `StorageDep` | 機械 (independent appends) |
| `backend/app/api/v1/__init__.py` | `include_router(rooms_router, ...)` | `include_router(tracks_router, ...)` | 機械 |
| `frontend/lib/api/endpoints.ts` | `roomApi = {...}` | `tracksApi = {...}` | 機械 |
| `frontend/lib/api/types.gen.ts` | regen | regen | **語意**：後合並者重跑 `./scripts/gen-api-types.sh` |

**Merge protocol：**

1. Phase 4 PR 與 Phase 6 PR 各自只 rebase main 一次後 push。
2. 後合並者：
   ```bash
   cd backend && alembic merge -m "merge rooms+tracks heads"
   docker compose up -d backend && ./scripts/gen-api-types.sh
   git add backend/alembic/versions/0005_*.py frontend/lib/api/types.gen.ts
   git commit
   ```

## 檔案清單

### Backend — 新增

- `backend/app/infrastructure/db/models/track.py` — `TrackORM`
  欄位：id (str PK)、title、artist (nullable)、mood (text)、duration_ms (int nullable)、file_key (text unique)、content_type (text)、file_size_bytes (int)、license (text nullable)、uploaded_by_user_id (FK users.id)、created_at (UTC timestamptz)。
- `backend/app/domain/repositories/track_repo.py` — `ITrackRepo` Protocol + `TrackRecord` dataclass。
- `backend/app/infrastructure/db/repositories/track_repo.py` — `SqlTrackRepo`。
- `backend/app/api/v1/tracks/{__init__.py,router.py,schemas.py}`。
- `backend/alembic/versions/0004_tracks_table.py` — autogenerate 後校對 down_revision。
- `backend/tests/unit/test_track_repo.py` + `backend/tests/api/test_tracks_router.py`。
- `backend/assets/seed-tracks/silent-5s.mp3` — `ffmpeg -f lavfi -i anullsrc=r=44100:cl=stereo -t 5 -q:a 9 -y backend/assets/seed-tracks/silent-5s.mp3`。

### Backend — 修改

- `backend/app/infrastructure/storage/base.py` — 加 `def path_for(key: str) -> str | None`。
- `backend/app/infrastructure/storage/local.py` — 實作 `path_for`。
- `backend/app/infrastructure/storage/s3.py` — `path_for` 回 `None`。
- `backend/app/core/settings.py` — `storage_root: str = "/app/data/storage"`、`storage_backend: Literal["local","s3"] = "local"`、`tracks_max_per_user: int = 10`、`tracks_max_file_size_mb: int = 15`。
- `backend/app/core/deps.py` — `get_storage` + `StorageDep`、`get_track_repo` + `TrackRepoDep`。
- `backend/app/api/v1/__init__.py` — register tracks_router。

### Frontend — 新增

- `frontend/app/town/library/page.tsx`
- `frontend/components/library/{TrackList,UploadForm,MoodTabs}.tsx`

### Frontend — 修改

- `frontend/lib/api/endpoints.ts` — `tracksApi`：`list(mood?)`、`get(id)`、`upload(file,meta)` (FormData)、`remove(id)`、`streamUrl(id)`。
- `frontend/lib/api/client.ts` — `apiFetch` 加 FormData 分支 (Body 為 FormData 時不要設 Content-Type)。
- `frontend/components/panels/MusicPanel.tsx` — 移 hardcoded TRACKS、接 backend、加 `<audio>`、mood tabs 變真 filter。
- `frontend/lib/api/types.gen.ts` — regen。

### Scripts — 修改

- `scripts/seed-dev-data.py` — `TRACKS` 列表 + 拷貝 placeholder MP3 + 插 DB row。

### Docs — 修改

- `plan_docs/00-roadmap.md` — Phase 6 行標 IN-PROGRESS → DONE，註 commit hash，註 Tier-2 切片 + 留 Phase 6b。

## 重用既有 utilities

- DI: `backend/app/core/deps.py` 既有 `DbDep`、`IdGenDep`、`CurrentUserId`。
- ORM-only repo 樣板：`app/domain/repositories/note_repo.py:NoteRecord` + `infrastructure/db/repositories/note_repo.py:SqlNoteRepo`。
- Router 樣板：`api/v1/notes/router.py`。
- Error envelope：`app/core/errors.py:FocusTownError`。
- 前端 API client：`frontend/lib/api/client.ts:apiFetch` (擴 FormData 分支)。

## 風險與緩解

| 風險 | 緩解 |
|---|---|
| Alembic 雙 head 合並失誤 | PR description 寫明指令 |
| `types.gen.ts` 手動 merge 出錯 | 後合並者強制執行 `gen-api-types.sh` |
| Range-request off-by-one | 覆蓋 `bytes=0-`, `bytes=0-1023`, `bytes=1024-`, malformed → 416 |
| MIME 偽造 | 讀前 3 bytes 檢查 MP3 magic (`ID3` 或 `0xFFFB/0xFFFA`)；深度檢查留 Phase 6b |
| FastAPI UploadFile 記憶體 | 限 15 MB；超過 1 MB FastAPI 自動 spool 落硬碟 |

## 實作順序 (建議 commit 切割)

1. Settings + TrackORM + alembic revision (`alembic upgrade head` 通)
2. `ITrackRepo` + `SqlTrackRepo` + repo unit tests
3. `IFileStorage.path_for` + Local/S3 impl
4. DI (`get_storage` + `get_track_repo`)
5. Router (read-only) — list / get / stream + tests (含 Range)
6. Seed (placeholder MP3 + script 擴充)
7. Router (write) — upload + delete + tests
8. `gen-api-types.sh` regen → commit types
9. `tracksApi` + FormData 支援
10. `/town/library` page (列表 + filter + upload + delete + play)
11. `MusicPanel` 重寫
12. Roadmap 狀態更新

## Verification

```bash
# Quality gates
cd backend && ruff check . && pytest -q
cd frontend && pnpm typecheck && pnpm lint && pnpm build

# Docker E2E
docker compose up --build -d
docker compose exec backend alembic upgrade head
docker compose exec backend python /app/../scripts/seed-dev-data.py

# Smoke
curl -s http://localhost:8000/api/v1/tracks | jq
curl -sI -H "Range: bytes=0-1023" http://localhost:8000/api/v1/tracks/<id>/stream
  # 預期 206 Partial Content + Content-Range
```

瀏覽器 E2E：兩個 incognito 用兩個 seed 帳號 → A 看見 3 首 → 播放 + 拖拉 → A 上傳 → B 也看見 → A 可刪、B 不可刪 → 上傳第 11 首被拒 → 上傳改名 png 被拒。

## 後續

- **Phase 6b**：S3 adapter (`boto3` presigned)、AWS bucket/IAM、real upload flow validation。
- **Phase 9**：依賴本 phase + Phase 4/7/8，做房間音樂多人同步播放。
