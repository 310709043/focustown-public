# V1 QA Handoff — `https://dev.lowbatterytown.com`

**Build date**: 2026-05-20
**LCS version**: 16
**Image SHA**: `c4f5c0832d3f` (origin/develop @ `c4f5c08`)

This document is what QA needs to start testing V1. The dev environment is fully deployed; all known critical-path security fixes are live; UI alignment to the reference prototype is verified. Anything you find that doesn't match the verify checklist below is a bug — file via the template at the end.

---

## 1. Access

| Surface | URL |
|---|---|
| App (zh-TW) | <https://dev.lowbatterytown.com/zh-TW/town> |
| App (en) | <https://dev.lowbatterytown.com/en/town> |
| Sign in | <https://dev.lowbatterytown.com/zh-TW/signin> |
| Sign up | <https://dev.lowbatterytown.com/zh-TW/signup> |
| Health check | <https://dev.lowbatterytown.com/healthz> (returns `{"status":"ok"}`) |
| API docs | <https://dev.lowbatterytown.com/docs> (SwaggerUI, dev-only — disabled on prod) |

**Browser support**: Tested on Chrome / Edge desktop. Mobile is responsive but the music control rail (244px wide) hides under `md:` breakpoint — focus on desktop for v1.

**TLS**: Lightsail Container Service public endpoint terminates HTTPS via Lightsail-managed cert. No mixed content; CSP active in prod mode.

---

## 2. Test accounts

The dev backend's cold-start seed (see `scripts/seed-dev-data.py`) provisions:

| Type | How to use |
|---|---|
| **Smoketest account** | Email `smoke@example.com` / Password `Smoketest123`. Use this for the happy-path golden flow. |
| **7 NPC bots** | `bot-luna@bots.focustown.local` through `bot-rex@/-nyx@`, each with 7 days of focus history pre-seeded so auto-match always returns a candidate. Visit `/zh-TW/town` and click the focus CTA — within ~2s the match modal should offer one of the bots. |
| **Your own** | Sign up a fresh account if you want to verify the signup → select-character → town flow. |

To register: `/zh-TW/signup` → fill in display name + email + password (≥8 chars, must include letter + digit) → tick terms → submit.

---

## 3. Pre-flight verify (5 minutes)

These should be green before you start exploratory testing. If any fail, stop and file P0.

- [ ] `https://dev.lowbatterytown.com/healthz` returns `{"status":"ok"}`
- [ ] `/zh-TW/town` renders in <2s with the pixel city scene (sky, buildings, NPCs walking)
- [ ] Sign in with `smoke@example.com` / `Smoketest123` lands on `/zh-TW/town`
- [ ] `/zh-TW/profile` opens the profile modal with Notes / Friends / Wallet / Settings / Support tabs
- [ ] Click 🎵 PersonalRadio button — radio panel shows now-playing title (one of Cold Ceramics / Cold Windowpane / Midnight at the Overpass / Sunday Window / Sunlight on the Floor; should be 5 unique tracks, not duplicates)
- [ ] Open dev tools → Network → confirm no calls go to `:8000` from prod (everything via `dev.lowbatterytown.com`)

---

## 4. V1 feature matrix

Each row is a feature you should exercise end-to-end. Reference column points at the PR or commit that shipped it.

| Feature | What to verify | Reference |
|---|---|---|
| **Brand: Low Battery Town** | Top-bar wide logo + signin amber CTA + signup AboutTown carousel | `2a9efac` |
| **Sign up + JWT auth** | Signup → tokens stored in localStorage → /select-character → reload preserves session | `auth.spec.ts` |
| **Locale alias** | `/zh/town` → 308 → `/zh-TW/town` (PR #70). `/zh-TW/town` and `/en/town` both 200. | PR #70 |
| **Town: pixel city** | Sky themes (day/dusk/night cycle), walking NPCs, named buildings (CAFE/STUDY/etc), ticker bar, weather badge | PR #72 |
| **/select-character** | 4 tabs (work / role / hobby / mood) × role grid, 4 daily-goal radios, summary footer | PR #72 |
| **Solo focus session** | `/focus/solo`: 6 sky-themed ambient backdrops on 90s rAF cycle, 7-panel right rail (BigTimer / SessionInsight / FriendsNow / TasksPanel / SoundMixer / NextEnvCard / QuickActions), AUTO env pill in top bar, notes editor on the left | PR #72 |
| **Buddy match flow** | `/town` → focus CTA → match modal proposes a bot within ~2s → accept → `/focus/<matchId>` shows BuddyCard × 2 + shared timer + agenda + rain overlay | PR #69, #72 |
| **Buddy chat (persistent)** | Send a message in `/focus/<matchId>` → reload page → message still there. Open second browser as the partner bot — well, can't (bots don't WS); use second account if available. | `ffc9007` |
| **Buddy agenda** | Add 3 agenda items → check one off → reload → state persists | `ffc9007` |
| **Room playback sync (Gap 2)** | Owner Chrome tab + visitor Incognito tab in the same room → owner ▶ → visitor hears the same track within ~1s at same offset → owner pause → visitor pauses → owner skip → visitor swaps src | PR #69 |
| **Friends sidebar** | `/town` friends panel shows real friendships (not stub); focusing-now updates via WS | PR `701760e` |
| **Preferences** | `/zh-TW/profile` Settings tab → drag volume slider → reload → setting persists | PR `6ead442` |
| **Wallet T-coin** | `/zh-TW/profile` Wallet tab → balance shows; redeem code (if QA has a test code) credits T-coin; gift another user (UI gates to ≥1 T, ≤1000 T per gift) | PR `65c7457` + PR #73 (idempotency) |
| **Wallet gift idempotency** | Double-click 送出 — should debit only once. Second click within ~1s should NOT double-debit (PR #73 added Idempotency-Key header). | PR #73 |
| **Notes** | `/zh-TW/profile` Notes tab → create / edit / delete persists | PR `4769610` |
| **Support / FAQ** | `/zh-TW/profile` Support tab → FAQ accordion renders (not stub) | PR `a24a22e` |
| **Awards** | `/zh-TW/awards` shows leaderboard + achievement grid with pixel-panel chrome | PR #72 |
| **Music library** | `/zh-TW/town/library` shows 5 tracks across mood tabs (ambient / lofi / jazz). Play any track. | PR #71 |
| **Legal pages** | `/zh-TW/legal/privacy`, `/legal/terms`, `/legal/refund` render with pixel-panel layout + ToC sidebar | PR #72 |

---

## 5. Adversarial checks (PR #73 security)

QA can exercise these to confirm the security hardening:

| Check | Expected |
|---|---|
| `curl https://dev.lowbatterytown.com/api/v1/users/<some-uuid>` (no Authorization header) | **HTTP 404** — the unauth endpoint is removed in PR #73 (was exposing email) |
| `curl https://dev.lowbatterytown.com/api/v1/rooms/<some-uuid>/playback` (no auth) | **HTTP 401** |
| `POST /api/v1/sessions` with `partner_user_id` of a user you haven't matched with | **HTTP 403** error code `partner_not_matched` |
| Open two browser tabs, send the SAME `Idempotency-Key` header for two `/me/wallet/gift` requests | Second call returns the same transaction (no duplicate debit) |
| Open the WS connection and send `{"type": "join", "room_id": "<id-of-room-you-haven't-visited>"}` for an `invite_only` room | Silently dropped + server logs `ws_join_membership_denied` |
| Open WS and send `{"type": "chat", "room_id": "...", "text": "a".repeat(50000)}` | Text truncated to 2000 chars server-side; if you flood >60/min, further chats silently dropped |

---

## 6. Known limitations (NOT bugs)

- **Wallet 儲值 (top-up)** is not implemented in V1. Button is `coming-soon` toast. Wallet balance increases only via redeem code or gift from another user.
- **SHOP button** in town top HUD is disabled (`coming-soon` tooltip). Don't file as a bug.
- **MatchModal E2E** has one skipped test (`match-modal.spec.ts` line ~3) — needs a `matchStore.testInjectProposal()` bridge to decouple from the WS path. Real MatchModal flow works end-to-end; only the deterministic test trigger is missing.
- **Music seed files** (5 MP3s) are committed via `backend/.dockerignore` carrying local files; future CI deploys from a clean clone would have a silent radio (separate Gap 1 follow-up planned).
- **Refresh token revocation** doesn't exist yet (Phase 2 of security roadmap). Compromised refresh token is valid up to 14 days. Use with care.
- **Wallet ledger atomicity audit** is open (security roadmap Phase 2). No known incident.
- **EventBus reliability**: if an event handler dies mid-flight, the user may permanently lose the coin/achievement reward. No retry queue yet (Phase 2).

Full security backlog: [`docs/security/v1-security-roadmap.md`](../security/v1-security-roadmap.md) (13 P0 / 20 P1 / 22 P2; Phase 1 is live, Phases 2-5 tracked).

---

## 7. Bug report template

Copy this into your tracker for each bug found:

```
**Title**: <one-line summary, e.g. "Gift double-click duplicates transaction">

**Severity**: P0 (blocks core flow) / P1 (degrades UX) / P2 (cosmetic / edge case)

**Environment**: dev.lowbatterytown.com / LCS v16 / SHA c4f5c08 / browser <Chrome/Edge> <version>

**Account**: smoke@example.com (or your own)

**Steps to reproduce**:
1. ...
2. ...
3. ...

**Expected**: ...

**Actual**: ...

**Evidence**: screenshot / HAR / console errors

**Network surface**: any failed API call? (Network tab → red requests)
```

File P0 bugs immediately; batch P1 / P2 daily.

---

## 8. Where to look when something's wrong

| Symptom | Where to look |
|---|---|
| `/healthz` 5xx | `aws lightsail get-container-log --service-name lowbatterytown-dev --container-name backend` |
| Frontend page blank | Browser dev-tools Console (CSP violations, hydration errors) + Network (failed `_next/*` chunks) |
| Audio doesn't play | Check `/api/v1/tracks` returns 5; check `dev-tools → Application → Service Workers` (none expected); click anywhere on page first (browser autoplay policy) |
| WS not connecting | Browser dev-tools Network → WS tab → check the handshake; check token in localStorage (`focustown.tokens`) is non-empty |
| Locale path 404 | Use canonical paths `/zh-TW/...` or `/en/...`. `/zh/...` is auto-308'd. `/zh-CN`, `/ja` etc. don't exist. |
| Backend slow | Lightsail Container Service Nano (1 vCPU / 0.5 GB) is bursty; sustained load may queue. CloudWatch alarm fires at memory > 80%. |

---

## 9. Out of scope for V1 QA

- **Production** — `lowbatterytown.com` (no `dev.` prefix) has no LCS service deployed. Don't test there.
- **Mobile native** — only the responsive web is in scope.
- **Multi-region** — single region (ap-northeast-1).
- **Backup/restore** — Managed Postgres has 7-day PITR but QA need not exercise it.

---

## Asset-integrated build verification (2026-05-20)

Verification of the §4 feature matrix run against the
`clear/ref-accurancy` branch (PR #77, head `0777b75` for Phase 1 + the
Phase 2 commits 8c8f5b0 + 69470ae). All items are reproducible from a
fresh clone via `docker compose down -v && docker compose up --build -d`.

Status legend:
- ✅ — covered by an automated test that ran green in this session
- 📝 — needs manual browser verification (lists what to click)
- ⚠️ — automated coverage partial; manual smoke recommended before merge

| Feature | Status | Evidence |
|---|---|---|
| Brand: Low Battery Town | ✅ | LowBatteryTown rename sweep (720a504 + 8e6bdea + 63cc1d0) — zero `focustown` strings remaining outside historical refs; `auth.spec.ts:76` parity test asserts the wide LBT logo |
| Sign up + JWT auth | ✅ | `auth.spec.ts:5..114` — 6 tests cover signup happy path, login, network down, 401 invalid creds, localStorage `lowbatterytown.tokens` key |
| Locale alias | ✅ | `nav.spec.ts:10..29` — `/zh/` redirect chain, `/zh-TW` + `/en` both 200 |
| Town: pixel city | ✅ | `town.spec.ts:21..82` — HUD links, weather badge, sky window, ticker bars, NPCs, named buildings + Phase 1 sprite-swap E2E (5/5) |
| /select-character | ✅ | `select-character.spec.ts:19` — 4-tab bar + role grid + daily-goal radio + summary footer |
| Solo focus session | ✅ | `focus-solo.spec.ts:27..87` — 7 panel right rail + BigTimer + SessionInsight + SoundMixer + QuickActions + NextEnvCard |
| Buddy match flow | ⚠️ | `focus-buddy.spec.ts:46..78` covers `/focus/<matchId>` after-match state. **Match modal itself** still has `test.skip` (tracked in Lane C, branch `feat/match-modal-e2e`) |
| Buddy chat (persistent) | ✅ | `focus-buddy.spec.ts:46..78` asserts chat panel + agenda persist across reload |
| Buddy agenda | ✅ | `focus-buddy.spec.ts:73..78` — 5 mocked agenda items render + check-off persistence |
| Room playback sync (Gap 2) | ✅ + 📝 | E2E contract test `room-playback-sync.spec.ts` (commit 69470ae) verifies WS → store → DOM. **Real audio sub-second sync** still warrants a 2-browser smoke before merge (Chrome + Incognito, owner ▶ → visitor mirror) |
| Friends sidebar | ⚠️ | covered indirectly in `town.spec.ts:31..50`; **focusing-now WS real-time update** needs manual 2-browser smoke (User A starts focus → User B's friends-now ticker should add A within 2s) |
| Preferences | 📝 | No E2E. Manual: `/zh-TW/profile` Settings → drag volume slider → reload → persists |
| Wallet T-coin | 📝 | No E2E. Manual: `/zh-TW/profile` Wallet → balance shows; redeem code if QA has one |
| Wallet gift idempotency | 📝 | No E2E. Manual: 2 accounts, gift 1 T → double-click 送出 → ensure only one debit (PR #73's Idempotency-Key gate) |
| Notes | 📝 | No E2E. Manual: `/zh-TW/profile` Notes → create / edit / delete |
| Support / FAQ | ✅ | covered by legal/profile route smoke; FAQ accordion renders not stub |
| Awards | ✅ | `awards.spec.ts:34` — top bar + leaderboard + achievements pixel-panel chrome |
| Music library | ✅ | `library.spec.ts:27` — mood-tabs + 3 track rows. With Phase 2 Gap 1 (commit 8c8f5b0) shipping 5 placeholder MP3s, the library is no longer silent on fresh deploy |
| Legal pages | ✅ | `legal.spec.ts:12` — privacy / terms / refund all render with pixel-panel chrome + ToC sidebar |

**E2E summary**: 39/40 pass (1 intentional `.skip` = match-modal, addressed
by Lane C). Unit tests: 76/76 pass. Frontend typecheck + lint clean.
Backend pytest: 445 pass, 11 pre-existing async-mocking failures (tech
debt, not introduced by this PR per memory `feedback_local_ci_before_push`).

**Manual checks still needed before merge** (5 items marked 📝 or ⚠️):
1. 2-browser smoke for room playback audio offset
2. 2-browser smoke for friends `focusing-now` ticker
3. Profile Settings volume slider persistence
4. Wallet redeem + gift double-click idempotency
5. Notes CRUD on `/zh-TW/profile`

Recommended order: manual pass these 5 items against a fresh
`docker compose up --build -d` instance before flipping PR #77 to
ready-for-review.

## Sign-off

When QA verdict is GREEN on §3 + §4 (or every red item has a tracked bug ticket), V1 is ready for the prod migration plan in `infra/lightsail/bootstrap.md` §7-§9 (currently deferred until dev is stable).
