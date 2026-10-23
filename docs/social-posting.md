# 社群發文：Instagram Reels／Threads

小鎮的貼文可以由 Claude 準備好、放進 repo，再由 GitHub Actions 透過 Meta 官方 API 發到 Instagram 和 Threads。**每一次發文都要你在 GitHub 按「Approve」才會送出**；不按、或按 Reject，就什麼都不會發。

- 程式：`scripts/social/`（`post.mjs` 發文、`plan.mjs` 找出待發的貼文、`requireReview.mjs` 確認有核准關卡、`meta.mjs` 是 API、`postSpec.mjs` 讀檔和檢查）
- 流程：`.github/workflows/social-post.yml`
- 貼文：`social/posts/<日期-主題>/`
- 測試：`node --test scripts/social/social.test.mjs`

Token 只放在 GitHub 的 environment secrets，不寫進 repo、不貼在對話裡；程式也不會把 token 印進 log。

## 一次性設定（約 15–20 分鐘）

Meta 後台的按鈕名稱常改版，下面的名稱可能略有不同。

### 1. Instagram

1. IG 帳號要是**專業帳號**：IG App → 設定 → 帳號類型與工具 → 切換為專業帳號（商家或創作者都可以）。
2. 到 <https://developers.facebook.com/apps> 建立應用程式，用途選 **Instagram API**（使用 Instagram 登入）。
3. 在「使用 Instagram 登入設定 API」產生存取權杖：加入小鎮的 IG 帳號並授權 `instagram_business_basic`、`instagram_business_content_publish`。
4. 複製產生的權杖（長期權杖，60 天有效）。

應用程式維持「開發模式」就可以發自己的帳號，不需要送審。

### 2. Threads

1. 同一個應用程式新增用途 **Threads API**，權限勾 `threads_basic`、`threads_content_publish`。
2. 在 Threads 測試人員加入小鎮的 Threads 帳號，然後到 Threads App → 設定 → 帳號 → 網站權限 → 邀請，按接受。
3. 用「使用者權杖產生器」產生權杖並複製（長期權杖，60 天有效）。

### 3. GitHub

1. repo → Settings → Environments → **New environment**，名稱填 `social`。
2. 勾 **Required reviewers**，加入你自己。沒有這一步，流程會拒絕發文（`requireReview.mjs`）。
3. 在這個 environment 的 **Environment secrets** 新增：
   - `IG_ACCESS_TOKEN`：步驟 1 的權杖
   - `THREADS_ACCESS_TOKEN`：步驟 2 的權杖
4. 試跑（不會發文）：Actions → **Social post** → Run workflow，`post` 填 `social/posts/2026-10-23-typhoon-cat`，`dry_run` 保持勾選 → 核准。看到兩個帳號名稱後面寫 `ok`，就代表權杖和素材網址都沒問題。

## 每次發文

1. Claude 在 `social/posts/<日期-主題>/` 放好素材、文案和 `post.json`，`status` 設成 `"ready"` 後 push。
2. GitHub 會通知你有一個待核准的部署（Review pending deployments）。打開看 **Posts to send** 和檔案內容，沒問題按 **Approve and deploy**。
3. 發出後，貼文連結會寫在那次執行的摘要裡，也會存成同資料夾的 `published.json`；同一篇不會被發第二次。

`"status": "draft"` 的貼文不會被發出去，可以先放著改。

### `post.json` 格式

```json
{
  "status": "ready",
  "instagram": {
    "type": "reel",
    "video": "reel.mp4",
    "cover": "reel-cover.jpg",
    "caption_file": "instagram.txt",
    "share_to_feed": true
  },
  "threads": {
    "video": "reel.mp4",
    "text_file": "threads.txt",
    "topic_tag": "颱風假",
    "reply_file": "threads-reply.txt"
  }
}
```

- Instagram 的 `type`：`reel`（`video`，可加 `cover`）、`image`（`image`）、`carousel`（`images`，2–10 張）。IG 圖片要用 JPEG。
- Threads：`text`／`text_file` 必填，可加 `video` 或 `image` 其中一個；`reply`／`reply_file` 會在貼文底下留第一則留言（適合放連結）。
- 文字可以直接寫在 `caption`、`text`、`reply`，或寫成同資料夾的 `*_file` 檔案。
- 素材網址是 `raw.githubusercontent.com/<repo>/<commit>/...`，所以這個 repo 要維持公開。

### 發文前會自動檢查

- IG：說明文字 2200 字以內、hashtag 最多 5 個（IG 自 2025 年 12 月起的上限，留言裡的也算）。
- Threads：本文和留言各 500 字以內；主題標籤只能 1 個（`topic_tag`，1–50 字，不能有 `.` 或 `&`）。
- 檔案存在、格式對（影片 mp4/mov）。

## 權杖到期

長期權杖 60 天到期。到期前回 Meta 後台重新產生一次，貼到 GitHub 的 `social` environment secrets 覆蓋舊的即可。過期時 Actions 會失敗並顯示 `Invalid OAuth access token`，貼文不會發出。

## 還沒支援

- Facebook 粉專（需要粉專權杖和 `pages_manage_posts`，之後可以加）。
- 排程在指定時間發：目前是你按核准的當下發出。
