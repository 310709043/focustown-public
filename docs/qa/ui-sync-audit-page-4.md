# Page 4 — `/focus/[id]` solo audit (2026-05-16)

**Re-verified 2026-05-16:** Each of D1–D20 grepped against the current code post-fix. All 20 fixes verified present in `components/focus/*` + `globals.css` + `messages/{en,zh-TW}/focus.json`. No regressions introduced; no new drift found in the components touched by the fix pass. D21–D27 remain deferred (low-severity polish).

Reference: `focustwon/reference/screen-focus.jsx` (562 lines)
Impl entry: `frontend/app/[locale]/focus/[id]/page.tsx` (solo branch → `SoloFocusScene`)
Branch: `feat/sync-eric-page-4-focus-solo` @ uncommitted (head `fda549d` + working tree)

## Summary

- **27 discrepancies total**: 7 high, 13 medium, 7 low.
- **Status (post-Phase D):** all 27 discrepancies ✅ resolved. D1–D20 + D23 shipped in PR #41; D21–D27 shipped in Phase D polish PR.
- All 6 ambient backdrops (`cafe / rain / forest / space / lofi / fire`), the `getBgGradient` palette, `PixelDigits` font, BG_OPTIONS schema, 3-column grid template, and the 8-tomato strip in `BigTimer` ported faithfully.
- The major theme: impl is **systematically slightly larger and uses different decorative glyphs** (`✦ ✎ ◉ ✓ ♪` instead of the reference's uniform `●` blink-dot header pattern), and several panels lost reference-specific affordances (Notes' flat 22 × 22 `Mini` toolbar buttons, TasksPanel's custom checkbox, the QuickActions row-without-panel layout).

## Discrepancies

### D1 — SessionInsight progress strip rebuilt as tomato-sprite cells *(high)*

- **Reference** (`screen-focus.jsx:L238-L251`): single-row strip of 4 thin cells, `height: 12`, `flex: 1`, completed cells filled `background: var(--accent)` + `boxShadow: 0 0 6px var(--accent)`, glyph `✓` (`#0a0524` ink) or `在這` for the current cell. Header line shows `● 今日目標 4 🍅` on the left and `3 / 4 完成` (accent-colored) on the right.
- **Impl** (`components/focus/SessionInsight.tsx:L44-L82`): cells are `height: 32`, filled cells get translucent `rgba(167,139,250,0.18)` + render a `TOMATO` `PixelSprite` (not a `✓` glyph), current cell uses `boxShadow: var(--neon-glow-cyan)` + accent-3 border + the text `t("hereLabel")` ("在這"/"HERE"). Header is `✦ {t("goalLabel", { goal })}` with no right-side `N / M 完成` counter.
- **Diff:** completely different visual — slim filled bar with checkmarks → tall cells with tomato icons; lost the right-aligned completion counter; lost the `boxShadow: 0 0 6px var(--accent)` glow on completed cells.
- **Suggested fix:** match reference — cells `height: 12`, fill completed with `var(--accent)` solid + boxShadow, ✓ glyph; add the `N / M 完成` right-aligned counter; switch header dot back to `●`.

### D2 — QuickActions wrapped in extra panel and stacked vertically *(high)*

- **Reference** (`screen-focus.jsx:L321-L329`): three pixel buttons sit directly in the right column as a flat `display: flex, gap: 4` row (NO `pixel-panel` wrapper). Each button is `flex: 1, padding: '6px 4px', fontSize: 10`. The 3rd button (`← 回小鎮`) has `borderColor: var(--accent-2)` + `color: var(--accent-2)`.
- **Impl** (`components/focus/QuickActions.tsx:L19-L67`): wraps the 3 buttons in a `pixel-panel` with `padding: 10`, `gap: 6`, `flexDirection: column`. Buttons are full-width stacked. Back-to-town button uses `color: var(--ink-mute)` and no accent border.
- **Diff:** vertical column inside an extra panel vs reference's bare horizontal trio; missing accent-2 emphasis on the last button.
- **Suggested fix:** remove `pixel-panel` wrapper, switch to horizontal flex with `gap: 4`, restore `accent-2` color + borderColor on the back-to-town button.

### D3 — SoloNotesPanel toolbar uses neon `pixel-btn` instead of flat `Mini` *(high)*

- **Reference** (`screen-focus.jsx:L451-L453, L475-L484`): toolbar buttons are 22 × 22 px squares with `background: rgba(0,0,0,0.4)`, `color: var(--ink-mute)`, `1px solid var(--panel-stroke)`, `Silkscreen 10`. No shadow, no neon. Inline-defined `Mini` component.
- **Impl** (`components/focus/SoloNotesPanel.tsx:L116-L128`): buttons use the global `pixel-btn` class — which carries `box-shadow: inset 0 -3px 0 …, 0 3px 0 var(--a4), 0 0 14px rgba(167,139,250,0.25)` and a hover glow. `fontSize: 11, padding: '4px 10px', minWidth: 28`.
- **Diff:** Five chunky neon-shadowed pixel buttons vs five small flat Mini squares — visually loud where the reference is quiet.
- **Suggested fix:** introduce a local `Mini` button (or a CSS modifier on `pixel-btn`) matching the reference's 22 × 22 flat style.

### D4 — Top-bar status pill missing `專注中 ·` prefix + wrong accent *(high)*

- **Reference** (`screen-focus.jsx:L57-L60`): status line is `專注中 · 連續 22 min` with `color: var(--accent)` (purple), `fontSize: 9`, `letterSpacing: 0.2em`. User-name line above is `fontSize: 12`.
- **Impl** (`components/focus/FocusTopBar.tsx:L80-L86, L73-L78`): status uses `t("statusLine", { minutes: 22 })` → `連續 22 分鐘` / `22 min streak` — no `專注中 · ` lead-in. Color is `var(--accent-3)` (cyan), `fontSize: 8`, `letterSpacing: 0.18em`. Name above is `fontSize: 10`.
- **Diff:** lost the `專注中 ·` prefix, swapped purple-accent → cyan-accent-3, downscaled both lines.
- **Suggested fix:** add `topBar.focusingLine` i18n key with `專注中 · 連續 {minutes} min` / `Focusing · {minutes} min streak`; change color to `var(--accent)`; bump font sizes to 12 (name) and 9 (status).

### D5 — AmbientPanel active state uses translucent fill, missing solid-accent dark-text affordance *(high)*

- **Reference** (`screen-focus.jsx:L543-L555`): active button is `background: var(--accent)` (solid purple), `color: '#0a0524'` (dark ink — inverted), `border: 1px solid var(--accent)`. Inactive: `background: rgba(0,0,0,0.3)`, `color: var(--ink-mute)`.
- **Impl** (`components/focus/AmbientPanel.tsx:L42-L65`): active state is `background: rgba(167,139,250,0.18)` (translucent purple), label `color: var(--accent)` (purple-on-translucent-purple — low contrast), `boxShadow: var(--neon-glow)`. Inactive: `background: rgba(20,10,50,0.5)`.
- **Diff:** the reference makes the selected option pop with a saturated purple chip + dark text; impl's translucent fill reads as a much softer highlight and loses the dark-on-light inversion that signals "selected".
- **Suggested fix:** active = `background: var(--accent), color: '#0a0524', border: 1px solid var(--accent)`; drop the `box-shadow: var(--neon-glow)`.

### D6 — SoundMixer track labels missing emoji + Chinese hybrid *(high)*

- **Reference** (`screen-focus.jsx:L300-L305`): label strings are literal `🎵 lofi`, `☂ 雨聲`, `☕ 咖啡館`, `🔥 火爐` rendered inline with the slider. `width: 64`, `fontSize: 10`, `color: var(--ink)`.
- **Impl** (`components/focus/SoundMixer.tsx:L36-L60` + `messages/{en,zh-TW}/focus.json:soundMixer.tracks`): labels are plain words — `MUSIC / RAIN / CAFE / FIRE` (en) or `音樂 / 雨聲 / 咖啡館 / 火爐` (zh-TW). No emoji. Label width 48, `fontSize: 9`, color tinted to match track accent.
- **Diff:** missing emoji prefix entirely; smaller font + narrower label slot; ink color replaced by per-track accent (separate issue D14).
- **Suggested fix:** keep i18n key but prefix each label string with the emoji from the reference (`🎵 / ☂ / ☕ / 🔥`); bump label `width` to 64, `fontSize` to 10, color to `var(--ink)`.

### D7 — FriendsNow rows lost the green presence dot + inline status format *(high)*

- **Reference** (`screen-focus.jsx:L279-L291`): each row renders `PixelSprite` avatar with a `6×6` green presence dot overlay (`background: #6ee7b7, border: 1px solid var(--bg-0)`) at bottom-right of the avatar; below name, a single-line status `{task} · 🍅 {pomos}` (accent-3, Silkscreen 8, 0.1em).
- **Impl** (`components/focus/FriendsNow.tsx:L46-L96`): no presence dot. Status split into a separate `#{task}` chip (accent-2 pink) **above** the row's right side, and tomato count `🍅 {N}` as a separate right-aligned span (accent-4 amber). Different visual rhythm — three cells (avatar | name+task | tomato | +1) vs reference's two (avatar+dot | name+status | +1).
- **Diff:** missing green presence dot; status not inline; chip color accent-2 vs accent-3.
- **Suggested fix:** overlay a 6 × 6 green dot on each avatar; merge task + tomato into a single `{#task} · 🍅 {pomos}` line under the name using `var(--accent-3)`.

### D8 — Top-bar `PixelWord` color flipped to accent-2 + larger scale *(medium)*

- **Reference** (`screen-focus.jsx:L50`): `<PixelWord text="FOCUSTOWN" scale={1.6} color="var(--accent)" glow="var(--accent)" />`.
- **Impl** (`components/focus/FocusTopBar.tsx:L44`): `<PixelWord text="FOCUSTOWN" color="var(--accent-2)" glow="var(--accent)" scale={2} />`.
- **Diff:** color swapped purple → pink; scale 1.6 → 2 (≈ 25% larger).
- **Suggested fix:** revert `color` to `var(--accent)`, `scale` to `1.6`.

### D9 — Top-bar subtitle uses ink-mute + wider tracking *(medium)*

- **Reference** (`screen-focus.jsx:L51`): `· SOLO ROOM` in `color: var(--accent-3)`, `letterSpacing: 0.2em`, `fontSize: 9`.
- **Impl** (`components/focus/FocusTopBar.tsx:L45-L54`): subtitle is `· {t("subtitle")}` (SOLO ROOM) in `color: var(--ink-mute)`, `letterSpacing: 0.3em`, `fontSize: 9`, `marginTop: 4`.
- **Diff:** color (cyan accent-3 → muted ink); tracking (0.2em → 0.3em).
- **Suggested fix:** color `var(--accent-3)`, tracking `0.2em`, drop `marginTop`.

### D10 — Top-bar avatar shrunk from scale 1.8 to 1.4 *(medium)*

- **Reference** (`screen-focus.jsx:L56`): `<PixelSprite … scale={1.8} />`.
- **Impl** (`components/focus/FocusTopBar.tsx:L69`): `scale={1.4}`.
- **Diff:** ~22% smaller avatar in the pill.
- **Suggested fix:** restore `scale={1.8}`.

### D11 — BigTimer play/pause button missing `pixel-btn primary` variant *(medium)*

- **Reference** (`screen-focus.jsx:L386`): primary CTA is `<button className="pixel-btn primary" …>` — `primary` is a CSS modifier (defined in reference's `ui-shared.jsx`) that flips background/border to the accent-2 pink. Reset/skip buttons stay plain `pixel-btn`.
- **Impl** (`components/focus/BigTimer.tsx:L124-L131`): play/pause button uses plain `pixel-btn` with no modifier. No primary accent.
- **Diff:** lost the pink-accent "primary" emphasis on the most important action.
- **Suggested fix:** add a `.pixel-btn.primary` CSS modifier in `globals.css` (or use inline `style.borderColor: 'var(--accent-2)', color: 'var(--accent-2)'`) and apply it to `timer-toggle`.

### D12 — BigTimer stat labels trimmed (lost the `專注/天數/本週` suffixes) *(medium)*

- **Reference** (`screen-focus.jsx:L396-L398`): `今日專注 / 連續天數 / 本週排名`.
- **Impl** (`components/focus/BigTimer.tsx:L160-L162` + `messages/zh-TW/focus.json:solo.bigTimer.statTodayLabel / statStreakLabel / statRankLabel`): `今日 / 連續 / 排名`.
- **Diff:** Chinese labels are shorter; en is `TODAY / STREAK / RANK` (reasonable but loses the "weekly" qualifier on rank).
- **Suggested fix:** update i18n: `statTodayLabel`= `今日專注 / TODAY'S FOCUS`, `statStreakLabel`= `連續天數 / STREAK DAYS`, `statRankLabel`= `本週排名 / WEEKLY RANK`.

### D13 — SessionInsight tip box: pink left-border instead of cyan card *(medium)*

- **Reference** (`screen-focus.jsx:L253-L258`): tip block uses `background: rgba(34,211,238,0.08)` + `border: 1px solid var(--accent-3)` (cyan card), with a per-tip emoji (`💡 🌿 ☕ 🌙`) at `fontSize: 16` next to the tip body in `VT323 / Noto Sans TC`, `fontSize: 14`, `color: var(--ink)`, `lineHeight: 1.4`.
- **Impl** (`components/focus/SessionInsight.tsx:L84-L97`): block is `borderLeft: 2px solid var(--accent-2)` + `background: rgba(236,72,153,0.05)` (pink hairline). No leading emoji. Text `fontSize: 11`, `lineHeight: 1.6`, `color: var(--ink-mute)`.
- **Diff:** wrong accent direction (pink instead of cyan), wrong border treatment (left-bar instead of full card), smaller / muted text, no per-tip emoji.
- **Suggested fix:** restore the cyan card; render `💡 🌿 ☕ 🌙` glyphs per tip; bump font to VT323 14 ink.

### D14 — SoundMixer value-readout colored ink-mute instead of per-track accent *(medium)*

- **Reference** (`screen-focus.jsx:L314`): readout span uses `color: tr.color, width: 22, textAlign: 'right'`.
- **Impl** (`components/focus/SoundMixer.tsx:L62-L76`): `color: 'var(--ink-mute)', width: 28, textAlign: 'right'`.
- **Diff:** value digits should tint to the slider's accent (pink/cyan/amber/purple) for at-a-glance feedback; impl flattens them to muted ink.
- **Suggested fix:** `color: track.color`, `width: 22`.

### D15 — SoundMixer track-color assignments wrong for music + fire *(medium)*

- **Reference** (`screen-focus.jsx:L300-L305`):
  - music → `var(--accent-2)` (pink)
  - rain → `var(--accent-3)` (cyan)
  - cafe → `var(--accent-4)` (amber)
  - fire → `var(--accent)` (purple)
- **Impl** (`components/focus/SoundMixer.tsx:L19-L24`):
  - music → `var(--accent)` (purple)
  - rain → `var(--accent-3)` (cyan) ✓
  - cafe → `var(--accent-4)` (amber) ✓
  - fire → `var(--coral)` (red-orange)
- **Diff:** music and fire mapped to the wrong accent tokens.
- **Suggested fix:** swap to reference mapping: `music → accent-2`, `fire → accent`.

### D16 — TasksPanel checkbox is native input, not custom 14 × 14 div *(medium)*

- **Reference** (`screen-focus.jsx:L512-L519`): checkbox is a `14 × 14 div` with `border: 1px solid var(--accent-3)`, filled `background: var(--accent-3)` when done, ✓ glyph in dark `#0a0524` inside, click handler on the span.
- **Impl** (`components/focus/TasksPanel.tsx:L81-L86`): native `<input type="checkbox" style={{ accentColor: 'var(--accent)' }} />`.
- **Diff:** native checkbox renders differently across browsers + uses accent (purple) instead of accent-3 (cyan).
- **Suggested fix:** replace with the reference's 14 × 14 div + `var(--accent-3)` border/fill + dark `✓` glyph.

### D17 — TasksPanel header glyph + color drift *(medium)*

- **Reference** (`screen-focus.jsx:L503-L507`): `● TASKS` with a 6 × 6 blink dot in `var(--accent-3)` + `boxShadow: var(--neon-glow-cyan)`, label color `var(--accent-3)`, letterSpacing `0.2em`.
- **Impl** (`components/focus/TasksPanel.tsx:L57-L66`): `✓ {t("header")}` ("TODAY'S TASKS" / "今日待辦"), color `var(--accent)` (purple), letterSpacing `0.25em`, no blink dot.
- **Diff:** wrong color (purple vs cyan); ✓ glyph replaces the canonical ● blink dot pattern; tracking widened.
- **Suggested fix:** restore blink dot + accent-3; revert glyph; tracking 0.2em.

### D18 — TasksPanel row background uses tinted purple instead of dark *(medium)*

- **Reference** (`screen-focus.jsx:L511`): every row `background: rgba(0,0,0,0.3)`, regardless of done state.
- **Impl** (`components/focus/TasksPanel.tsx:L73-L86`): `background: task.done ? 'rgba(167,139,250,0.06)' : 'transparent'`.
- **Diff:** done rows look subtly purple-tinted, undone rows look fully transparent — neither matches reference's flat dark fill.
- **Suggested fix:** `background: 'rgba(0,0,0,0.3)'` always.

### D19 — TasksPanel missing `+` add button (Enter-only flow) *(medium)*

- **Reference** (`screen-focus.jsx:L526-L529`): row at the bottom = input + a square `+` button (`pixel-btn primary`, `padding: '0 12px'`).
- **Impl** (`components/focus/TasksPanel.tsx:L101-L111`): only the input; tasks added via `Enter` keypress.
- **Diff:** lost the visual affordance to click-add.
- **Suggested fix:** wrap input + button in a row, use `pixel-btn` with accent-2 styling.

### D20 — AmbientPanel header: ✦/pink vs ●/purple *(medium)*

- **Reference** (`screen-focus.jsx:L538-L541`): `● BACKGROUND` with 6 × 6 blink dot in `var(--accent)` + `var(--neon-glow)`, label `var(--accent)`, letterSpacing `0.2em`.
- **Impl** (`components/focus/AmbientPanel.tsx:L26-L32`): `✦ {t("header")}` ("AMBIENT"), color `var(--accent-2)` (pink), letterSpacing `0.25em`.
- **Diff:** glyph swap, color swap, no blink dot.
- **Suggested fix:** restore ● blink dot + `var(--accent)`.

### D21 — Body-grid gap + padding bigger than reference *(low)*

- **Reference** (`screen-focus.jsx:L68`): `gap: 12, padding: 12, height: 'calc(100% - 56px)', overflow: 'hidden'`.
- **Impl** (`components/focus/SoloFocusScene.tsx:L52-L67`): `gap: 16, padding: 16, overflowY: 'auto'`.
- **Diff:** 33% more spacing; scrollable instead of clipped.
- **Suggested fix:** drop gap/padding to 12; keep `overflow: hidden` on the grid (let inner panels scroll if needed).

### D22 — FriendsNow header: ◉/accent-3 vs blink-dot/accent-2 *(low)*

- **Reference** (`screen-focus.jsx:L274-L276`): blink dot (6 × 6, `var(--accent-2)`, `var(--neon-glow-pink)`) + `FRIENDS NOW` text in `var(--accent-2)`, `letterSpacing: 0.2em`. Right span "{N} 在線" in `var(--ink-dim)`.
- **Impl** (`components/focus/FriendsNow.tsx:L33-L43`): `◉ {t("header")}` in `var(--accent-3)` (cyan), `letterSpacing: 0.25em`. Right span uses i18n "{count} focusing" / "{count} 位專注中" in `var(--ink-mute)`.
- **Diff:** glyph (`◉` instead of blink-dot), color (cyan instead of pink), copy reworded.
- **Suggested fix:** restore blink dot, accent-2 color, change i18n value to `{count} 在線` / `{count} online`.

### D23 — SessionInsight progress header glyph `●` → `✦` *(low)*

- **Reference** (`screen-focus.jsx:L240`): `● 今日目標 4 🍅` with `color: var(--ink-mute)`.
- **Impl** (`components/focus/SessionInsight.tsx:L37-L46`): `✦ {t("goalLabel", { goal })}` with `color: var(--accent-2)`.
- **Diff:** decorative glyph + color drift.
- **Suggested fix:** ● ink-mute (and reserve ✦ for the buddy-room companion in Page 5).

### D24 — SessionInsight tip copy doesn't match reference *(low)*

- **Reference** (`screen-focus.jsx:L223-L228`): four specific lifestyle tips — research on "next action" (`💡`), 20-second far-look during breaks (`🌿`), caffeine half-life (`☕`), late-night 90-min cycle (`🌙`).
- **Impl** (`messages/zh-TW/focus.json:solo.sessionInsight.tips`): four generic motivational tips (`把手機放到視線外…`, `每完成一顆番茄…`, etc.).
- **Diff:** copy is entirely different — both are 4 items × 8 s rotation, but the reference's tips have lifestyle / research framing the impl's lacks.
- **Suggested fix:** port the four reference tips verbatim (+ EN translation) under `solo.sessionInsight.tips.0..3`.

### D25 — SoloNotesPanel textarea typography drift *(low)*

- **Reference** (`screen-focus.jsx:L455-L466`): textarea `fontFamily: '"VT323", "Noto Sans TC", monospace'`, `fontSize: 17`, `lineHeight: 1.45`, `padding: 12`, `background: rgba(0,0,0,0.5)`, `border: 1px solid var(--panel-stroke)`. Loads with a long Markdown sample.
- **Impl** (`components/focus/SoloNotesPanel.tsx:L155-L171`): uses `pixel-input` class + `fontFamily: 'var(--font-noto-sans-tc), monospace'`, `lineHeight: 1.6, minHeight: 160`. Empty until `notesApi.list()` returns.
- **Diff:** missing VT323 font, smaller font size, looser line-height. (The "no initial sample text" is intentional — out-of-scope data wiring.)
- **Suggested fix:** add `fontFamily: 'var(--font-vt323), "Noto Sans TC", monospace'`, `fontSize: 17`, `lineHeight: 1.45` on the textarea inline.

### D26 — SoloNotesPanel header glyph + color drift *(low)*

- **Reference** (`screen-focus.jsx:L447-L450`): blink dot (6 × 6, `var(--accent-2)`, `var(--neon-glow-pink)`) + `MY NOTES` text in `var(--accent-2)`, `letterSpacing: 0.2em`.
- **Impl** (`components/focus/SoloNotesPanel.tsx:L102-L111`): `✎ {t("header")}` (MY NOTES) in `var(--accent)`, `letterSpacing: 0.25em`, no blink dot.
- **Diff:** glyph, color, no dot.
- **Suggested fix:** restore blink dot + accent-2.

### D27 — Top-bar wrapper padding + background slightly off *(low)*

- **Reference** (`screen-focus.jsx:L41-L45`): `padding: '12px 18px'`, `background: 'rgba(7,4,26,0.75)'`, `borderBottom: 1px solid var(--panel-stroke)`, no fixed height (flex sizing).
- **Impl** (`components/focus/FocusTopBar.tsx:L17-L29`): fixed `height: 56`, `padding: '0 16px'`, `background: 'rgba(3,1,17,0.92)'`.
- **Diff:** taller-looking fixed-height bar with darker, more opaque background; slightly different horizontal padding.
- **Suggested fix:** drop fixed `height`, pad `12px 18px`, background `rgba(7,4,26,0.75)`.

## Matches (no discrepancy)

- 6 background gradients (`cafe / rain / forest / space / lofi / fire`) in `lib/data/focusBackgrounds.ts` — verbatim from `screen-focus.jsx:L91-L100`.
- `AmbientBackdrop` switch shape + delegation to `StarField` (`density 0.0015`) and `RainOverlay` (`color #67e8f9, density 1.2`).
- `CafeAmbient`: 6 steam columns at `i*17 + 5%`, width 24, height 200, 6 keyframes with `-40 → -55px` translations and `i*0.7s` delays.
- `ForestAmbient` (Fireflies): 30 instances, 2 × 2 px, color `#fef9c3`, dx/dy `(rand-0.5)*0.4`, sin-phase twinkle.
- `FireAmbient` (Embers): 80 instances, 2 × 2 px, `COLORS = ['#fbbf24', '#fb923c', '#dc2626']`, velocity 0.4–1.6, horizontal jitter, recycle at `y < -10`.
- `LofiAmbient`: 5 clouds at `top: 20 + i*80, left: -100`, opacity 0.3, `lofiDrift 30s linear infinite` → 120vw, sprite `C` palette `#a78bfa`, scale 3.
- `PixelDigits`: 5 × 7 cell font for `0-9` + `:`, scale 8 for the BigTimer, plus the 1-pixel inter-glyph gap.
- 3-column grid template `1.05fr 1.3fr 0.95fr` (column ratios match exactly).
- BigTimer 8-tomato strip with dim palette `{ R: '#3a2820', G: '#1a0f3d', W: '#5a4a7a' }` for past-count cells.
- BigTimer 3-stat footer structure (label + value + textShadow glow per cell) — values `142 min`, `22 天 / 22 d`, `#7` carried through.
- BigTimer ↺ / play-pause / ⏭ button row.
- Notes char + line counter formula.
- TasksPanel `Enter`-to-add behavior on the input.
- SoundMixer 4 sliders, 0–100 range.
- QuickActions 3 button identities (DND / lock phone / back to town).
- AmbientPanel 6-option grid (3 × 2).

## Closing checklist — open follow-up fixes?

| Discrepancy | Severity | Status |
| --- | --- | --- |
| D1 SessionInsight strip rebuild | high | ✅ fixed in this PR |
| D2 QuickActions wrapper + layout | high | ✅ fixed in this PR |
| D3 Notes toolbar Mini | high | ✅ fixed in this PR |
| D4 Top-bar status `專注中 ·` | high | ✅ fixed in this PR |
| D5 AmbientPanel active state | high | ✅ fixed in this PR |
| D6 SoundMixer track labels emoji | high | ✅ fixed in this PR |
| D7 FriendsNow presence dot + status format | high | ✅ fixed in this PR |
| D8 PixelWord color + scale | medium | ✅ fixed in this PR |
| D9 Subtitle color + tracking | medium | ✅ fixed in this PR |
| D10 Avatar scale 1.4→1.8 | medium | ✅ fixed in this PR |
| D11 BigTimer primary button | medium | ✅ fixed in this PR (added shared `.pixel-btn.primary` modifier in `globals.css`) |
| D12 BigTimer stat labels | medium | ✅ fixed in this PR |
| D13 SessionInsight tip box style | medium | ✅ fixed in this PR |
| D14 SoundMixer readout color | medium | ✅ fixed in this PR |
| D15 SoundMixer track color map | medium | ✅ fixed in this PR |
| D16 TasksPanel custom checkbox | medium | ✅ fixed in this PR |
| D17 TasksPanel header glyph + color | medium | ✅ fixed in this PR |
| D18 TasksPanel row background | medium | ✅ fixed in this PR |
| D19 TasksPanel `+` button | medium | ✅ fixed in this PR |
| D20 AmbientPanel header glyph + color | medium | ✅ fixed in this PR |
| D21 Body-grid spacing | low | ✅ fixed in Phase D — gap/padding 16→12 in SoloFocusScene; right-column gap 12→10 to match reference's tighter spacing |
| D22 FriendsNow header drift | low | ✅ fixed in Phase D — `◉` accent-3 → `●` blink-dot accent-2 with `neon-glow-pink` shadow |
| D23 SessionInsight glyph | low | ✅ resolved alongside D1 in PR #41 |
| D24 SessionInsight tip copy | low | ✅ fixed in Phase D — replaced generic tips with reference's 4 lifestyle tips (research / break / caffeine / late-night) in both locales |
| D25 Notes textarea VT323 | low | ✅ fixed in Phase D — textarea adds inline `fontFamily: var(--font-vt323)`, `fontSize: 17`, `lineHeight: 1.45`, `padding: 12` |
| D26 Notes header glyph | low | ✅ fixed in Phase D — `✎` accent → `●` blink-dot accent-2 with `neon-glow-pink` |
| D27 Top-bar wrapper padding/bg | low | ✅ fixed in Phase D — dropped fixed 56 px height; padding `12px 18px`; background `rgba(7,4,26,0.75)` per reference |

**Status:** all 27 discrepancies resolved. D1–D20 + D23 shipped in PR #41 (Page 4 merge). D21–D27 shipped in Phase D polish PR.

Bonus: the new `.pixel-btn.primary` modifier in `frontend/app/globals.css` is the shared CSS infrastructure for Page 1 D1 + Page 2 D1 + Page 2 D2 + Page 4 D11 + Page 4 D19. Page 4 D11 + D19 consume it now; the Page 1 / Page 2 application is a one-line `className` add per consumer and can ship in those pages' separate follow-up PRs.
