# Page 5 — `/focus/[id]` buddy (pre-port spec) (2026-05-16)

Reference: `focustwon/reference/screen-buddy.jsx` (496 lines)
Impl entry: `frontend/app/[locale]/focus/[id]/page.tsx` paired branch (L143–L228, `paired === true`)
Impl composing components: `frontend/components/focus-room/{FocusTimer, SharedNotesPanel, PartnerPairingHeader, NotesPanel}.tsx`

Branch base: `feat/sync-eric-page-4-focus-solo` (paired branch impl is unchanged from `origin/main`)

## Summary

**This is a pre-port build spec, not a "what's wrong" audit.** The paired branch of `/focus/[id]` predates the reference UI port — it was built before any of Pages 1–4 landed. None of `screen-buddy.jsx`'s top-level components have been ported. The audit framework lists each reference component → impl status → build action.

- **22 reference components / sub-systems** identified in `screen-buddy.jsx`.
- **17 missing** (high — never built).
- **3 partial** (medium — impl has a stand-in but visual mismatch is total).
- **2 reused** (PixelDigits, ambient layers — already shipped for Page 4).
- **0 visually matching** in the paired-branch impl today.

The natural sibling PR is `feat/sync-eric-page-5-focus-buddy` off `origin/main` (per the per-page-PR rule). Expected effort: comparable to Page 4 (which took ~1 day fully implemented + audited + fixed), with the added complexity of `ChatStream` real-time wiring and `SharedAgenda` persistence — likely **1.5–2 days** end-to-end.

## Component-by-component build spec

### B1 — `BuddyRoomScreen` outer wrapper *(missing — high)*

- **Reference** (`screen-buddy.jsx:L9-L150`): full-bleed gradient bg `linear-gradient(180deg, #07041a 0%, #1a0d3d 60%, #2a1854 100%)`, `<StarField density={0.0008} />` overlay, `<RainOverlay color="rgba(167,139,250,0.4)" density={0.5} />` overlay (the buddy room is always raining), top bar, 2-column body grid.
- **Impl:** paired branch in `app/[locale]/focus/[id]/page.tsx:L143-L228` uses a radial-gradient bg + custom `<Stars>`, `<PixelMoon>`, `<Airplane>` × 2, `<CitySilhouette>`. No StarField, no rain.
- **Build:** new `components/focus-buddy/BuddyFocusScene.tsx` mirroring `SoloFocusScene` shape from Page 4. Reuse `<StarField density={0.0008} />` from `components/pixel/StarField.tsx` and `<RainOverlay color="rgba(167,139,250,0.4)" density={0.5} />` from `components/pixel/RainOverlay.tsx`.

### B2 — Top bar *(missing — high)*

- **Reference** (`screen-buddy.jsx:L45-L67`): 56 px-ish bar with three clusters:
  - LEFT: `◀ leaveRoom` + Logo (28 px) + PixelWord "FOCUSTOWN" (scale 1.6 accent) + subtitle `· BUDDY ROOM` in **accent-2** (pink, not cyan like solo).
  - CENTER: blinking accent-2 dot + `SAME FOCUS` (uppercase, accent, letterSpacing 0.25em) + `·` ink-dim + `ROOM #2847-A · 22 min` ink-mute.
  - RIGHT: `<TCoinBadge amount={1247} label="TCOIN" />` + `<LangSwitcher compact />`.
- **Impl:** paired branch renders a thin 52 px header with `✦ {t("paired")}` text + `exit fullscreen` button. No room number, no SAME FOCUS indicator, no T-coin.
- **Build:** new `components/focus-buddy/BuddyTopBar.tsx`. Reuse `<Logo>`, `<PixelWord>`, `<CoinBadge>` from existing infra. i18n keys needed: `focus.buddy.topBar.{leaveRoom, subtitle, sameFocusLabel, roomCode, statusLine}`.

### B3 — 2-column body grid *(missing — high)*

- **Reference** (`screen-buddy.jsx:L69-L147`): `gridTemplateColumns: '1fr 1.3fr', gap: 14, padding: 14, height: 'calc(100% - 56px)'`. Left = stack of panels (buddy header + shared timer + status mini + agenda + music). Right = `<SharedPanel>` (chat/notes tabs).
- **Impl:** paired branch uses a different 2-column grid `1fr 380px` where left = `FocusTimer`, right = `SharedNotesPanel`. No stacked panels on the left.
- **Build:** in `BuddyFocusScene.tsx`, replace `1fr 380px` with `1fr 1.3fr` and stack 5 panels in the left column.

### B4 — Two-user buddy header card *(missing — high)*

- **Reference** (`screen-buddy.jsx:L74-L88`): `pixel-panel` with `<CornerDeco />`, `<BuddyCard side="me">` on left, center connector (`×` glyph + tiny `YBY` sprite + `SAME TAG` label + `#WRITING` accent), `<BuddyCard side="buddy">` on right.
- **Impl:** paired branch has `<PartnerPairingHeader>` — a 40 px-tall strip with two `<Seat>` components + a small `<Table>` between them. Completely different visual idiom (cafe-table metaphor vs side-by-side card metaphor).
- **Build:** new `components/focus-buddy/BuddyHeaderCard.tsx`.

### B5 — `BuddyCard` *(missing — high)*

- **Reference** (`screen-buddy.jsx:L230-L252`): per-user card with sprite at scale 3 + accent-colored glow (me = accent, buddy = accent-2) + 10 × 10 green online dot (#06d6a0 bg + 2 px bg-0 border) + name in silkscreen 13 with neon textShadow + role+level subtitle + 2 `<Pill>` chips (`#寫作 #lofi`) + tomato count + minute stat row.
- **Impl:** none. PartnerPairingHeader's `<Seat>` is a different design entirely.
- **Build:** new `components/focus-buddy/BuddyCard.tsx` + `Pill` sub-component (cyan-bordered accent-3 chip). Reuse `<PixelSprite>` + `findCharacter()` / `characterKeyToAvatar()`.

### B6 — Shared Timer panel *(missing — high; reuses Page 4 PixelDigits ✅)*

- **Reference** (`screen-buddy.jsx:L91-L118`): `pixel-panel` with:
  - Header: `● SHARED FOCUS · #3` (accent, 0.25em) + 8-tomato strip (first 3 lit).
  - `<PixelDigits text="22:14" scale={7} color="var(--ink)" glow="var(--accent-2)" />` (note: pink glow, not solo's purple).
  - 10 px progress bar with `linear-gradient(90deg, var(--accent), var(--accent-2))` fill + `var(--neon-glow-pink)`.
  - 3 control buttons: `↺ reset / ⏯ pause-play primary / ⏭ skip`.
  - Cooperation hint: `兩人都按下開始才會計時 · 中途離開 -10 T 幣` in silkscreen 9 ink-dim center.
- **Impl:** paired branch uses `<FocusTimer>` from `components/focus-room/` — generic large `font-pixel` numbers, no PixelDigits, no 8-tomato strip, no gradient progress, no cooperation hint.
- **Build:** new `components/focus-buddy/SharedTimer.tsx`. **Reuse `PixelDigits` from `components/pixel/PixelDigits.tsx` (already shipped for Page 4).** Reuse `TOMATO` sprite from `lib/pixel/sprites/props.ts`. The `.pixel-btn.primary` modifier already exists (shipped with Page 4).

### B7 — Status mini panel *(missing — high)*

- **Reference** (`screen-buddy.jsx:L121-L136`): `pixel-panel` with `● 即時狀態` accent-3 header + 2 user rows: avatar scale 1.8 + name + `♪ {current task}` colored by user (accent for me, accent-2 for buddy) + `<TypingDots>` indicator on the right.
- **Impl:** none.
- **Build:** new `components/focus-buddy/StatusMini.tsx` + `TypingDots` sub-component (3 small 4×4 squares, animated 350 ms cycle).

### B8 — SharedAgenda panel *(missing — high)*

- **Reference** (`screen-buddy.jsx:L152-L190`): `pixel-panel` with `● 共同行程` accent header + right-aligned `N / M` counter + 5 checklist rows. The "current" row is highlighted with pink `rgba(236,72,153,0.1)` bg + accent-2 border + neon-glow-pink + `NOW` chip on the right (silkscreen 8, accent-2, neon-glow-pink textShadow).
- **Impl:** none.
- **Build:** new `components/focus-buddy/SharedAgenda.tsx`. The "current item" + "NOW" affordance is novel — not in Page 4.

### B9 — RoomMusic sync panel *(missing — high)*

- **Reference** (`screen-buddy.jsx:L192-L228`): `pixel-panel` with:
  - Header: `● ROOM SYNC` cyan blink-dot + `2/2 同步中` right-aligned status.
  - Album-art tile: 36 × 36 div with `linear-gradient(135deg, var(--accent), var(--accent-2))` bg + 4 px neon-glow + 7-line pixel sprite inside (a stylized note glyph).
  - Track title + sub-line `♪ 1 / 5 · lofi radio`.
  - Play/pause `pixel-btn primary` on the right.
  - EQ bar: 20 micro bars `width: 3px, height: 4 + ((i * 7) % 9)`, accent-3 + cyan neon glow.
- **Impl:** paired branch renders `<PersonalRadio context="focus" contextId={id}>` in the bottom-right. Different visual identity entirely — not the album-art tile pattern.
- **Build:** new `components/focus-buddy/RoomMusic.tsx`. Wire to the existing per-room playlist API (`roomTracksApi` / `roomPlaybackApi`) for the synchronized music behavior. This is harder than the other panels because it needs real-time sync — likely defer wiring and ship a presentational version first.

### B10 — SharedPanel right column (tab container) *(partial — medium)*

- **Reference** (`screen-buddy.jsx:L281-L301`): `pixel-panel` with internal tabs (`💬 sharedNotes` / `✎ myNotes`) + right-side status (`● LIVE · 2 ONLINE`), wraps `<ChatStream>` or `<NotesStream>` depending on tab.
- **Impl:** paired branch renders `<SharedNotesPanel matchId={id} myUserId={user.id}>` — has a tab toggle too, but the tabs are `共享 / 私人` (different labels) and the content is the existing notes panel (not chat).
- **Build:** new `components/focus-buddy/SharedPanel.tsx` with reference's chat/notes tabs. The chat stream is the bigger new addition.

### B11 — ChatStream *(missing — high)*

- **Reference** (`screen-buddy.jsx:L316-L370`): scrollable message list (`flex: 1, overflowY: 'auto', padding: 14`), composer footer with 5 chips (`💬 訊息 / ✎ 筆記 / 📎 附件 / 🎵 分享音樂 / 🍅 暫停`) + input + send button.
  - Message types: `sys` (centered dashed-border banner), `chat` (avatar + name + time + bubble), `note` (avatar + name + time + cyan card with VT323 font).
  - Bubble background: own messages = `rgba(183,148,246,0.12)` purple wash; buddy messages = `rgba(236,72,153,0.1)` pink wash; notes = `rgba(34,211,238,0.08)` cyan wash.
  - Bubble border: `{color}55` (semi-transparent).
- **Impl:** none. There's a `chat` namespace in `messages/{en,zh-TW}/focus.json` (`header`, `placeholder`, `sendCta`, `systemJoined`, `systemLeft`) that was never wired to UI in the paired branch.
- **Build:** new `components/focus-buddy/ChatStream.tsx` + `Message` sub-component + `mode()` button-style helper. Wire to backend (assume `ws_manager` already supports a `chat.send` event; if not, add it). Persisting chat history is a separate decision.

### B12 — Message sub-component (`sys` / `chat` / `note` variants) *(missing — high; covered under B11)*

- See B11 — the `<Message>` component is the core renderer.

### B13 — NotesStream (shared collaborative notes) *(missing — high)*

- **Reference** (`screen-buddy.jsx:L421-L465`): single full-height VT323 textarea + footer with blinking cyan dot + `Aria 正在編輯第 8 行` + `自動儲存 · 已同步`.
- **Impl:** the existing `SharedNotesPanel` is a different design (private/shared list of notes, each with title + body). The reference's design is a single shared textarea — closer to Notion-doc real-time editing.
- **Build:** new `components/focus-buddy/NotesStream.tsx`. The "real-time edit" indicator is decorative for the initial port; OT / CRDT wiring is a separate phase.

### B14 — Pill *(missing — low)*

- **Reference** (`screen-buddy.jsx:L254-L262`): tiny cyan-bordered chip (silkscreen 8, padding 1×5, `rgba(34,211,238,0.1)` bg, accent-3 border + color).
- **Build:** colocate inside `BuddyCard.tsx` or create `components/focus-buddy/Pill.tsx` if reused elsewhere.

### B15 — TypingDots *(missing — low)*

- **Reference** (`screen-buddy.jsx:L265-L278`): 3 dots cycling 350 ms with accent-3 active + cyan neon-glow.
- **Build:** colocate inside `StatusMini.tsx` or create as standalone.

### B16 — TabBtn (SharedPanel tab) *(missing — low)*

- **Reference** (`screen-buddy.jsx:L303-L314`): standard tab button with accent fill + dark text active state, panel-stroke border, silkscreen 11 0.1em — same pattern as Page 2's `TabBar` `TabButton`.
- **Build:** reuse `TabButton` from `components/select-character/TabBar.tsx` if possible (its visual matches), or copy-paste the pattern.

### B17 — Chat composer mode buttons *(missing — low)*

- **Reference** (`screen-buddy.jsx:L353-L360`): row of 5 chips (chat/note/attach/share-music/pause-pomodoro). Helper `mode(active)` style applies accent fill on active.
- **Build:** colocate inside `ChatStream.tsx`. Attach + share-music + pause-pomodoro can be stubbed (no handler) for the first port.

### B18 — i18n catalogue additions *(missing — medium)*

- **Reference labels:** `leaveRoom`, `buddyRoom`, `sameFocus`, `tcoin`, `reset`, `pause`, `start`, `skip`, `sharedNotes`, `myNotes`, `typeMsg`. Plus the Chinese-only hardcoded strings (`SAME TAG`, `#WRITING`, `兩人都按下開始才會計時 · 中途離開 -10 T 幣`, `● 即時狀態`, `● 共同行程`, `NOW`, `● ROOM SYNC`, `2/2 同步中`, `ROOM #2847-A`).
- **Impl:** the `focus.chat.*` namespace exists in i18n but is not used. The Page 5 port needs to add a `focus.buddy.*` namespace.
- **Build:** add the new namespace to `messages/{en,zh-TW}/focus.json`. Chinese-only literals get an en translation.

### B19 — Background rain (always-on) *(missing — medium)*

- **Reference** (`screen-buddy.jsx:L43`): the buddy room is **always** raining — `<RainOverlay color="rgba(167,139,250,0.4)" density={0.5} />` runs full-bleed unconditionally.
- **Impl:** paired branch shows no rain. (The solo branch's AmbientBackdrop has rain only when `bg === "rain"`.)
- **Build:** in `BuddyFocusScene.tsx`, mount `<RainOverlay>` unconditionally.

### B20 — Wiring up Page 5 in `/focus/[id]/page.tsx` *(missing — medium)*

- The page already branches on `paired = id !== "solo"`. Currently the paired branch returns the pre-port JSX. Page 5 swaps that branch for `<BuddyFocusScene matchId={id} partnerKey={partnerKey} />`.
- Routing remains unchanged. The match-resolution logic at L109–L142 stays as-is.

### B21 — PixelDigits *(reused — ✅)*

- Already shipped in Page 4 PR #41 at `components/pixel/PixelDigits.tsx`. Page 5's `<SharedTimer>` consumes it at `scale=7`.

### B22 — `.pixel-btn.primary` *(reused — ✅)*

- Already shipped in Page 4 PR #41 in `globals.css`. Page 5's SharedTimer play button, ChatStream send button, RoomMusic play button, and SharedAgenda interactions all consume it.

## Build order (recommended)

1. **Phase A — Wrapper + ambient** (B1, B19, B20): get `BuddyFocusScene` shell mounted on the paired branch. Verify the gradient + StarField + RainOverlay layer correctly. ~1 hour.
2. **Phase B — Top bar + buddy header** (B2, B4, B5, B14): get the top half rendering. ~3 hours.
3. **Phase C — Left-column panels** (B6 SharedTimer first, then B7 StatusMini, B8 SharedAgenda, B9 RoomMusic): ship visually first, defer real-time sync. ~5 hours.
4. **Phase D — Right column** (B10, B11, B12, B13, B16, B17): chat stream + notes stream. Largest single phase. ~5 hours.
5. **Phase E — i18n + polish** (B18): add catalogue keys, normalize copy. ~1 hour.
6. **Phase F — Audit + fix** (separate plan): run the same audit framework Page 4 used, fix high+medium discrepancies before opening PR.

Total estimated: **1.5–2 days** end-to-end.

## Verification

After build, the verification ritual is the same as Page 4:

```bash
cd frontend
pnpm typecheck && pnpm lint
npx next dev --port 3210
# Probe a non-solo focus URL (real match id from /matches/auto):
curl -sS -o /tmp/buddy.html "http://localhost:3210/zh-TW/focus/<match-id>"
grep -oE 'data-testid="[^"]+"' /tmp/buddy.html | sort -u
# Expected testids: focus-buddy-scene, buddy-top-bar, buddy-header-card,
#                    buddy-card-me, buddy-card-buddy, shared-timer,
#                    status-mini, shared-agenda, room-music,
#                    shared-panel, chat-stream, notes-stream, ...
```

Manual visual QA per the per-component reference citations above.

## Closing checklist — build status

| Component | Status | Build notes |
| --- | --- | --- |
| B1 BuddyFocusScene wrapper | ✅ built in Phase E | `components/focus-buddy/BuddyFocusScene.tsx` — full-bleed gradient + StarField + always-on RainOverlay + 2-col body grid |
| B2 BuddyTopBar | ✅ built in Phase E | `components/focus-buddy/BuddyTopBar.tsx` — back + Logo + FOCUSTOWN + accent-2 BUDDY ROOM + SAME FOCUS center + CoinBadge |
| B3 2-column body grid | ✅ built in Phase E | inside BuddyFocusScene — `gridTemplateColumns: '1fr 1.3fr'`, gap 14, padding 14 |
| B4 Two-user buddy header card | ✅ built in Phase E | `components/focus-buddy/BuddyHeaderCard.tsx` — CornerDeco + BuddyCard×2 + center × connector + SAME TAG + `#WRITING` |
| B5 BuddyCard | ✅ built in Phase E | `components/focus-buddy/BuddyCard.tsx` — sprite scale 3 with side-colored glow + green online dot + 2 Pills + tomato/minutes stats |
| B6 SharedTimer | ✅ built in Phase E | `components/focus-buddy/SharedTimer.tsx` — reuses `PixelDigits` (scale 7, accent-2 glow) + `TomatoStrip` (scale 1.3) + gradient progress + 3 buttons (.pixel-btn.primary on play) + cooperation hint |
| B7 StatusMini | ✅ built in Phase E | `components/focus-buddy/StatusMini.tsx` |
| B8 SharedAgenda | ✅ built in Phase E | `components/focus-buddy/SharedAgenda.tsx` — uses new `PixelCheckbox` primitive + NOW highlight |
| B9 RoomMusic | ✅ built in Phase E | `components/focus-buddy/RoomMusic.tsx` — reuses `<EQViz>` from Phase C1 |
| B10 SharedPanel container | ✅ built in Phase E | `components/focus-buddy/SharedPanel.tsx` — tabs + LIVE status |
| B11 ChatStream | ✅ built in Phase E (UI-only) | `components/focus-buddy/ChatStream.tsx` — seed messages match reference; real backend chat is a follow-up |
| B12 Message variants | ✅ built in Phase E | `components/focus-buddy/Message.tsx` — discriminated union `sys / chat / note` (LSP) |
| B13 NotesStream | ✅ built in Phase E | `components/focus-buddy/NotesStream.tsx` — wires `notesApi` with `shared_in_match_id` for real persistence |
| B14 Pill | ✅ built in Phase E | `components/focus-buddy/Pill.tsx` |
| B15 TypingDots | ✅ built in Phase E | `components/focus-buddy/TypingDots.tsx` |
| B16 TabBtn | ✅ built in Phase E | `components/focus-buddy/TabBtn.tsx` |
| B17 Chat composer mode buttons | ✅ built in Phase E | inside `ChatStream.tsx` via local `modeBtnStyle()` helper |
| B18 i18n catalogue | ✅ added in Phase E | `focus.buddy.*` namespace added to both en + zh-TW. **Note**: `sharedTimer.cooperationHint` softened from reference's punitive "-10 T 幣" to "可能影響本次連續紀錄" / "may interrupt your streak" per [bilingual-seo-copywriting-guidelines.md](../i18n/bilingual-seo-copywriting-guidelines.md) "avoid pressure / punishment" rule |
| B19 Always-on rain | ✅ built in Phase E | inside BuddyFocusScene — RainOverlay color `rgba(167,139,250,0.4)` density 0.5 unconditional |
| B20 Wire `/focus/[id]/page.tsx` paired branch | ✅ built in Phase E | paired branch returns `<BuddyFocusScene matchId partnerKey partnerName>`; old `FocusTimer + SharedNotesPanel + PartnerPairingHeader + PersonalRadio` block removed |
| B21 PixelDigits | ✅ reused | no work |
| B22 `.pixel-btn.primary` | ✅ reused | no work |
| (bonus) `PixelCheckbox` | ✅ extracted in Phase E | `components/focus-buddy/PixelCheckbox.tsx` — extracted from inline pattern; SharedAgenda consumes |

**Status:** Phase E ships all 22 build items. Follow-up work:
- Real-time WebSocket chat persistence for ChatStream (currently UI-only with seed)
- OT/CRDT for NotesStream's "Aria 正在編輯第 8 行" indicator (currently decorative)
- Existing `components/focus-room/{FocusTimer, SharedNotesPanel, PartnerPairingHeader, NotesPanel}.tsx` are now ORPHANED — no callers. Recommend deletion in a small follow-up PR (or rolled into Phase C3 cleanup).
