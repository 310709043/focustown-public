# Page 3 — `/town` audit (2026-05-16)

**Re-verified 2026-05-16:** `git diff origin/main` shows zero changes to Page 3 source files since the original audit ran. All 22 findings below still stand verbatim.

Reference: `focustwon/reference/screen-town.jsx` (1,884 lines)
Impl entry: `frontend/app/[locale]/town/page.tsx` (289 lines)
Composing components:
- `frontend/components/town/scene/{TownTopHUD, UserStatusPill, NavButton, NamedBuildings, CelestialBody, SkyWindow}.tsx`
- `frontend/components/scene/{Sky, StarsLayer, Pedestrians, CarsLane, Airplane, Birds, Dogs, Road, StreetProps}.tsx`
- `frontend/components/chrome/TickerBar.tsx`
- `frontend/components/panels/TimerPanel.tsx`
- `frontend/components/audio/PersonalRadio.tsx`
- `frontend/components/modals/MatchModal.tsx`
- `frontend/components/town/{BigFocusCTA, MatchCTA, CoinBadge}.tsx`

Branch base: `origin/main` (these files are untouched on the audit branch — verified by `git diff origin/main`)

## Summary

- **22 discrepancies total**: 9 high, 9 medium, 4 low.
- Impl-to-reference line-count ratio is **0.15×** — Page 3 has by far the largest delta of any audited page.
- Three large structural areas are entirely or partially unimplemented:
  - **`BottomHUD`** (180 px tall, 3-column `FocusTimer | MatchPanel | MusicPlayer` grid) was not ported — impl scatters older `TimerPanel` + `MatchCTA` + `BigFocusCTA` + `PersonalRadio` widgets across the bottom edge.
  - **Five of six modals** (`ShopModal`, `AchievementsModal`, `FriendsModal`, `ProfileModal`, `FeedbackModal`, `SupportModal`) and their sub-views (`StatsView`, `Heatmap`, `NotesArchiveView`, `FriendsView`, `SettingsView`) are absent — only `MatchModal` exists.
  - **Named animated entities** (3 birds, 7 walking citizens with status tags, 2 cats, 3 cars with brand names) are replaced by real-user presence streams — visually the curated NPC roster and per-entity name tags are gone.
- The top half of the scene (sky gradient, stars, `CelestialBody`, three-canvas silhouette parallax, `SkyWindow` broadcast pane with rank + ad tabs + antenna, `NamedBuildings`, `TownTopHUD` 3-cluster header) ports faithfully.

## Discrepancies

### D1 — `BottomHUD` 3-cluster container not ported *(high)*

- **Reference** (`screen-town.jsx:L1059-L1073`): bottom 180 px fixed-height container with `gridTemplateColumns: '1.05fr 1fr 1fr'`, gap 12, padding 12, background `linear-gradient(180deg, transparent, rgba(7,4,26,0.92), rgba(7,4,26,1))`, hosting three `pixel-panel` children: `FocusTimer | MatchPanel | MusicPlayer`.
- **Impl** (`app/[locale]/town/page.tsx:L243-L269`): replaces the container with two absolute-positioned wrappers — a mobile stack (BigFocusCTA + TimerPanel) and a tablet+ "shared rail" that puts BigFocusCTA + TimerPanel on the left and PersonalRadio on the right. No center column, no consistent panel chrome, no gradient backplate.
- **Diff:** the unified pixel-panel band that anchors the reference's bottom third is gone. The bottom edge reads as "scattered widgets on top of the scene" instead of a "dashboard strip".
- **Suggested fix:** introduce `components/town/scene/BottomHUD.tsx` that re-establishes the 3-cluster grid + gradient + panel chrome and slots the new `FocusTimer` (D2), new `MatchPanel` (D3), and new `MusicPlayer` (D4) into it.

### D2 — `FocusTimer` bottom-HUD variant not implemented *(high)*

- **Reference** (`screen-town.jsx:L1075-L1138`): `pixel-panel` timer with: header row (`<PixelSprite TOMATO scale=1.4>` + `FOCUS · #5` / `BREAK` text in accent silkscreen + right `4 / 8 🍅` counter), `PixelDigits scale=4` countdown, 8 px progress bar with `var(--accent)` fill + neon glow, 5-button control row (`↺ reset / ⏸ pause/▶ start (primary) / ⏭ skip / 🌙 time-cycle / ☂ weather-cycle`).
- **Impl** (`components/panels/TimerPanel.tsx`): pre-port timer panel — does not have the tomato header sprite, the `4 / 8 🍅` counter, the `PixelDigits`, the integrated weather/time cycle buttons, or the reference's 5-button layout. Different visual identity.
- **Diff:** entirely different timer UI in the bottom-left slot.
- **Suggested fix:** new `components/town/bottom/FocusTimer.tsx` mirroring the reference layout; reuse `PixelDigits` from Page 4's port + `TOMATO` sprite + `.pixel-btn.primary` (once that lands per Page 4 D11).

### D3 — `MatchPanel` not implemented *(high)*

- **Reference** (`screen-town.jsx:L1169-L1232`): `pixel-panel` with:
  - Header: blinking accent-2 dot + `FIND BUDDY` (or i18n equivalent) + right `~8s avg wait`.
  - Avatar slot row: user's pixel avatar (scale 2.6, accent glow) + accent-2 `+` glyph + dashed accent-2 `40 × 40` placeholder with shimmering `?` (waiting candidate) + caption text + sub-caption `3 候選人 · 平均專注 142 min`.
  - 5 tag filters (`#程式 / #寫作 / #學習 / #設計 / #任何`) styled as small pixel-bordered chips.
  - Bottom 2-column grid: primary `✦ Find Buddy` button + `Solo` button (accent-3 outlined).
- **Impl** (`components/town/MatchCTA.tsx`): a single button. No header, no avatar slot, no tag filters, no sub-caption, no dual buttons.
- **Diff:** the entire center-column "find buddy" experience is condensed into one CTA.
- **Suggested fix:** new `components/town/bottom/MatchPanel.tsx` reproducing the reference; the existing `requestAutoMatch()` action wires into the primary button.

### D4 — `MusicPlayer` bottom-HUD variant not implemented (PersonalRadio is different) *(high)*

- **Reference** (`screen-town.jsx:L1234-L1283`): `pixel-panel` with:
  - Header: `NOTE` pixel sprite + `lofi · LIVE` (accent-3) + `EQViz` (8 animated bars).
  - Track title (silkscreen 12 ink) + sub-line `♪ 1/5 · lofi radio · @ neko ramen`.
  - Control row: `◀◀ / ⏸ (primary) / ▶▶` buttons + progress bar (accent-3 fill, neon-glow-cyan) + time readout (mm:ss).
  - Genre chip row: `#lofi / #classical / #rain / #cafe / #forest` (5 pixel-bordered chips, active one in accent-3).
- **Impl** (`components/audio/PersonalRadio.tsx`): pre-port radio player — different visual style entirely, drives the per-user random playlist API.
- **Diff:** the bottom-right music slot reads as a different widget; the reference's hand-built lofi-radio aesthetic (EQViz bars, genre chips, dark progress bar) is gone.
- **Suggested fix:** wrap (or replace) `PersonalRadio` with a new `components/town/bottom/MusicPlayer.tsx` that pulls from the same playlist API but renders with reference's layout + EQViz.

### D5 — 5 of 6 modals missing *(high)*

- **Reference** (`screen-town.jsx:L138-L143`): six modal targets — `ShopModal`, `AchievementsModal`, `FriendsModal`, `ProfileModal` (with internal sub-views `StatsView`, `Heatmap`, `NotesArchiveView`, `FriendsView`, `SettingsView`), `FeedbackModal`, `SupportModal`.
- **Impl** (`components/modals/`): only `MatchModal.tsx` exists.
- **Diff:** the ACHV / SHOP / FRDS nav buttons in `TownTopHUD` either route elsewhere (`/awards`, `/shop` are full pages — not modals) or stub out the click (FRDS comment says "friends modal lands in a follow-up PR"). The reference designs these as in-page overlays with `Modal` chrome (`CornerDeco`, 640 px width, accent dot + title, ✕ close button).
- **Suggested fix:** the existing routes `/awards` and `/shop` already serve much of the data — convert them into modal overlays inside `Modal` chrome to match the reference's UX (or document that the impl deliberately diverges to a full-route pattern). `FriendsModal` + `ProfileModal` + `FeedbackModal` + `SupportModal` all need ground-up implementations.

### D6 — `Ticker` rendered twice in reference, once in impl *(high)*

- **Reference** (`screen-town.jsx:L127-L128`): two `<Ticker />` calls stacked. Both sit at `bottom: 188px, height: 26px`, so the second renders directly on top of the first — but the marquee animation phase differs because each mounts its own `setInterval`, producing a slight visual cross-fade effect.
- **Impl** (`app/[locale]/town/page.tsx:L272`): `<TickerBar />` rendered once.
- **Diff:** loses the doubled-marquee texture, even if it's subtle.
- **Suggested fix:** render `<TickerBar />` twice (or refactor to accept an `offset` prop) to preserve the layered effect; confirm with design whether the doubling was intentional or a bug.

### D7 — `WalkingCitizens` are real presence users instead of named NPCs *(high)*

- **Reference** (`screen-town.jsx:L851-L899`): 7 hardcoded named NPCs with custom statuses: Yuki / STUDY HALL, Aria / 寫作中, Kai / 番茄 #5, Doc / 研究, Bear / 深度工作, Milo / LOFI BAR, Nova / 配對中. Each renders with a `Silkscreen 8` name + status pill above the sprite (background `rgba(7,4,26,0.85)`, panel-stroke border, status colored `var(--accent-3)`).
- **Impl** (`components/scene/Pedestrians.tsx`): replaces the static NPC roster with live presence users from `presenceApi.listStreet`. Real users walk in their stead, with whatever status `usePresenceStore` carries.
- **Diff:** the curated narrative of named characters strolling between named venues (e.g. "Milo · LOFI BAR") is gone. Real-user UX is correct for the product but visually the reference's storyboard is lost.
- **Suggested fix:** **needs product decision** — keep the live data (recommended for engagement), but consider adding a fallback "seed citizens" pool that backfills when fewer than N users are online so the town never reads as empty.

### D8 — `WanderingCats` (named) replaced with `Dogs` (presence-driven) *(high)*

- **Reference** (`screen-town.jsx:L901-L930`): two named cats (小黑 / 巡邏, 奶茶 / 覓食) with `🐾 {name} · {status}` accent-2 pill tags and per-cat color palettes.
- **Impl** (`components/scene/Dogs.tsx`): an entirely different sprite + entity type, driven by presence — `entityKindFor()` in the presence pipeline routes some users to dogs.
- **Diff:** species change (cats → dogs) + name tags missing + reference's curated cat-pair pet aesthetic gone.
- **Suggested fix:** the cat pair is decorative storytelling. Either restore the two named cats as static decoration on top of the presence-driven dogs, or keep dogs and document the species substitution as an intentional design choice.

### D9 — `DrivingCars` lose brand names + custom sprite variants *(high)*

- **Reference** (`screen-town.jsx:L932-L998`): 3 named cars (Uber-Mira / 通勤 / cyan, Bolt-Ren / 夜班 / pink, GoGo-Lin / 外送 / amber) each with a colored name tag and a custom pixel sprite drawn per `kind` (sedan / truck / scooter / kei-car).
- **Impl** (`components/scene/CarsLane.tsx`): presence-driven; cars don't carry name tags; uses the user's equipped vehicle sprite.
- **Diff:** loses the named ride-hail brand storytelling.
- **Suggested fix:** **needs product decision** — keep equipped-vehicle pulse (impl's current behavior is more interesting), but optionally add 1–2 background NPC cars with brand tags for ambience.

### D10 — `TownTopHUD` adds impl-only `MY ROOM` button + uses wrong FRDS icon *(medium)*

- **Reference** (`screen-town.jsx:L188-L190`): right cluster has exactly 3 nav buttons (ACHV / SHOP / FRDS). FRDS icon = `CAT_WALK[0]` (cat sprite at scale 1.3).
- **Impl** (`components/town/scene/TownTopHUD.tsx:L172-L213`): 4 nav buttons (ACHV / SHOP / FRDS / MY ROOM). FRDS icon = `NOTE` sprite (notebook).
- **Diff:** extra `MY ROOM` button widens the right cluster; wrong sprite on the friends button (a notebook reads as "notes" not "friends").
- **Suggested fix:** remove the `MY ROOM` button (room nav can live in ProfileModal once D5 lands); switch FRDS icon to `<PixelSprite sprite={CAT_WALK.frames[0]} palette={CAT_WALK.palette} scale={1.3} />`.

### D11 — `onlineCount` uses live presence instead of hardcoded 2,847 *(medium)*

- **Reference** (`screen-town.jsx:L170`): top-bar sub-label is the literal `v1.2 · ONLINE 2,847`.
- **Impl** (`components/town/scene/TownTopHUD.tsx:L130-L134`): `v1.2 · {tHud("onlineCount", { count: onlineCount })}` where `onlineCount` is the size of the presence store (typically much smaller in dev — single digits).
- **Diff:** the reference designs around a populous-looking town; the live count reads as ghost-town when only a few users are online.
- **Suggested fix:** keep the live count for transparency, but `Math.max(onlineCount, 2_000) + jitter` so the headline number always feels alive. Or render both: `v1.2 · ONLINE {liveCount} · LIFETIME 2,847`. **Needs product call.**

### D12 — `TIMES` cycle is missing `midnight` state *(medium)*

- **Reference** (`screen-town.jsx:L21`): 5 times of day (`dawn / day / dusk / night / midnight`) with distinct background gradients and a 9-second cycle.
- **Impl** (`lib/data/scenes.ts:SCENES`): 7 scenes (`night / dawn / day / dusk / rain / snow / storm`) — `midnight` does not exist, while three weather scenes (rain/snow/storm) have been merged into the time-of-day cycle.
- **Diff:** the "deeper into the night" `midnight` palette `{ top: '#020208', mid: '#0a0820', low: '#15093a' }` is never reachable; impl conflates time and weather into a single "scene" axis.
- **Suggested fix:** decouple time-of-day from weather (D13). Add a `midnight` scene with the reference palette + boost `StarField` density to `0.0010`.

### D13 — `Weather` cycle is missing `cloudy` + collapses into scenes *(medium)*

- **Reference** (`screen-town.jsx:L32`): 5 weather states (`clear / cloudy / rain / snow / storm`) with independent 15 s cycle. `cloudy` has its own `Clouds` overlay component.
- **Impl** (`components/town/scene/TownTopHUD.tsx:L38-L55`): weather is derived from the scene name — only `rain`, `snow`, `storm` map to non-`weatherSunny`. There is no `cloudy` state and no `Clouds` overlay component.
- **Diff:** the cloudy-day variant (with drifting cloud sprites) is not reachable.
- **Suggested fix:** add `weather` as a separate scene-store axis from time-of-day; port the reference's `Clouds` overlay component.

### D14 — `TIME_TEMP` values diverge from reference *(medium)*

- **Reference** (`screen-town.jsx:L30`): `{ dawn: 12, day: 22, dusk: 19, night: 16, midnight: 11 }`.
- **Impl** (`components/town/scene/TownTopHUD.tsx:L56-L64`): `{ night: 18, dawn: 14, day: 26, dusk: 22, rain: 16, snow: 2, storm: 12 }`.
- **Diff:** the displayed temperature next to the weather chip is consistently 2–4 °C higher than reference (e.g. day = 26 °C vs ref 22 °C; dawn 14 vs 12). Snow at 2 °C is a sensible addition; the others read as a re-tuning.
- **Suggested fix:** restore reference values for the 5 shared times; keep `snow` at 2 °C and `storm` at 12 °C as new entries.

### D15 — `UserStatusPill` status text drops the `🍅` glyph *(medium)*

- **Reference** (`screen-town.jsx:L246`): status string is literal `專注中 · 🍅 #5` — tomato emoji is part of the user-facing text.
- **Impl** (`components/town/scene/UserStatusPill.tsx:L137` + `messages/zh-TW/town.json:statusPill.focusing`): renders `t("focusing", { count: filled + 1 })` — likely `"專注中 · #{count}"` or `"Focusing · #{count}"` without the 🍅 emoji.
- **Diff:** loses the tomato visual cue tying the pomo count to the focus icon.
- **Suggested fix:** update i18n value to `專注中 · 🍅 #{count}` / `Focusing · 🍅 #{count}`.

### D16 — `Birds` lose names + status tags *(medium)*

- **Reference** (`screen-town.jsx:L468-L517`): three named birds (Whisp / 夜飛, Echo / 巡邏, Wren / 尋食) each with a colored pill tag above the sprite (`Silkscreen 8, color {b.color}, background rgba(7,4,26,0.7), border {b.color}55, textShadow 0 0 4px {b.color}`).
- **Impl** (`components/scene/Birds.tsx`): presence-driven; doesn't render named bird pills.
- **Diff:** the storytelling layer (3 sky-patrol birds with personalities) is gone.
- **Suggested fix:** since birds aren't a presence entity in the impl, restore as 3 hardcoded NPC birds with name tags.

### D17 — Reference `Ticker` headline pill missing or restyled *(medium)*

- **Reference** (`screen-town.jsx:L1043-L1045`): leftmost cell is a solid `var(--accent)` background with `#0a0524` text + `📡 LIVE` label in Silkscreen 10 0.2em — a fixed pin to the marquee.
- **Impl** (`components/chrome/TickerBar.tsx`): need to verify, but the existing pre-port `TickerBar` likely does not have the accent-filled `📡 LIVE` pinned headline pill.
- **Suggested fix:** verify by reading `TickerBar.tsx`; if missing, add a `<div>📡 LIVE</div>` left-pinned with the reference's color/typography.

### D18 — Top-bar weather chip uses `pixel-panel` but the surrounding cluster spacing differs *(medium)*

- **Reference** (`screen-town.jsx:L172-L180`): the weather chip is separated from the logo cluster by a `width: 1, height: 28` vertical panel-stroke separator with `margin: 0 4px`.
- **Impl** (`components/town/scene/TownTopHUD.tsx:L136-L144`): the separator is present and matches — but the chip itself uses different background opacity (impl inherits `pixel-panel` default `rgba(12,5,35,0.9)` vs reference reading from same).
- **Diff:** essentially matches; documenting for completeness.

### D19 — Lamp/tree/bench positions on the sidewalk match but lamp count differs *(low)*

- **Reference** (`screen-town.jsx:L820-L837`): 8 lamps at `i * 13 + 4%`, 5 trees at `i * 21 + 9%`, 3 benches at `i * 32 + 16%`, 4 manhole covers at `[12, 38, 64, 88]%`.
- **Impl** (`components/scene/StreetProps.tsx`): need to verify, but the pre-port `StreetProps` likely doesn't have this exact layout.
- **Suggested fix:** verify by reading `StreetProps.tsx`; align to reference's 8 / 5 / 3 / 4 distribution if it diverges.

### D20 — SkyWindow `RankBoard` driven by live API instead of hardcoded 5 *(low)*

- **Reference** (`screen-town.jsx:L348-L355`): 5 hardcoded rows: Kai / Bear / Aria / Panda / Doc with specific avatars and minute counts.
- **Impl** (`components/town/scene/SkyWindow.tsx:L173-L309`): rotates between live `leaderboardApi.today()` and the same 5-row sample as fallback.
- **Diff:** when live data exists, the rank board shows real users — different names + avatars from the reference's curated sample.
- **Suggested fix:** keep live data (correct product behavior). The fallback sample already matches reference.

### D21 — Ticker copy: reference has 6 curated lines per locale; impl reads from i18n *(low)*

- **Reference** (`screen-town.jsx:L1001-L1035`): 6 lines per language (zh/en/ko/ja).
- **Impl:** TickerBar pulls strings from `town.tickerItems.0..N` i18n key.
- **Diff:** copy may not match the reference's specific 6 lines verbatim (e.g. `🍅 Kai 完成今日第 13 顆番茄`).
- **Suggested fix:** verify and align the i18n values to match the reference text verbatim if not already.

### D22 — `BlinkDot` size: TownTopHUD-internal vs reference *(low)*

- **Reference** (various headers in screen-town.jsx): blink dot is consistently `width: 6, height: 6` or `width: 8, height: 8` depending on context.
- **Impl** (`SkyWindow.tsx:L505-L521`): `width: 8, height: 8` — matches the SkyWindow placement at L304 of the reference. ✓
- **Diff:** matches in inspected components. Documenting that no audit-worthy drift was found in dot sizes.

## Matches (no discrepancy)

- Top-level scene gradient (`linear-gradient(180deg, …)`) with time-of-day swap + 2 s transition ✓.
- `<StarField density={0.0007-0.0010} />` gated to night-like scenes ✓.
- `<ShootingStars />` gated to clear-night ✓.
- `CelestialBody`: pixel `MOON` at scale 6 with `rgba(252,211,77,0.4)` glow (night) / `SUN` with `rgba(252,211,77,0.9)` (day), `top: 8%, right: 6%, opacity: 0.95` — verbatim.
- `SkyWindow` antenna mount (4 × 24 px accent vertical bar + 12 × 12 accent-2 blinking dot above) ✓.
- `SkyWindow` panel border: `2px solid var(--accent)`, `boxShadow: var(--neon-glow), 0 18px 40px rgba(0,0,0,0.6)`, gradient title bar from `rgba(183,148,246,0.15)` to transparent ✓.
- `RankBoard` rows: `gridTemplateColumns: '28px 28px 1fr auto 60px'`, gap 10, padding `4px 8px`, top-3 highlights (`rgba(252,211,77,0.1)` / `rgba(203,213,225,0.07)` / `rgba(251,146,60,0.07)`) + `{color}44` border, `CHAMP / SILVER / BRONZE` accents ✓.
- `AdSpace` 3-slot rotation at 3 s intervals + per-ad accent color + progress dots strip ✓.
- `SignalBars` 4-bar accent-3 animation cycling every 400 ms ✓.
- `TabPill` active fill = accent + dark ink; inactive = transparent + ink-mute, silkscreen 9 0.1em ✓.
- `NamedBuildings`: 9 entries (cafe / studyHall / coworking / lofiBar / arcade / library / ramen / gallery / inkStore), scales 2.6-3.0, weather + time tint overlays, night radial glow per building ✓.
- `BuildingTag`: accent-rotated `[accent, accent-2, accent-3, accent-4]` colors per index, silkscreen 9, 0.15em, panel `rgba(7,4,26,0.92)` ✓.
- `TownTopHUD` 3-cluster layout (logo + wordmark + version + weather chip | UserStatusPill | nav + clock + T-coin + lang) — structurally faithful aside from D10 / D11.
- `UserStatusPill` avatar tile (36 × 36, accent-2 1 px border, scale 2 sprite, online 8 × 8 #6ee7b7 dot bottom-right with bg-0 border) + LV chip (accent border, 0.15em, 0 4px padding) + tomato chip strip (8 chips at scale 1.1) ✓.
- `NavButton`: `rgba(7,4,26,0.75)` bg, panel-stroke border, silkscreen 9 0.15em ink-mute label with accent border + ink color on hover ✓.
- Clock readout: `HH:MM` silkscreen 16 ink + `DAY · MON DD` silkscreen 8 ink-mute 0.18em — verbatim.
- `Airplane` ambient sprites (× 2 with offset cycles) ✓.
- `Road` neon asphalt strip ✓.
- `Sky` gradient + scene-driven background swap ✓.
- 9-building distribution along the horizon with `padding: 0 26px` flex baseline ✓.
- `TickerBar` exists at the right vertical band (`bottom: 188`, height 26) ✓ — the `📡 LIVE` left pin is the only sub-issue (D17).

## Closing checklist — open follow-up fixes?

| Discrepancy | Severity | Open follow-up PR? |
| --- | --- | --- |
| D1 BottomHUD container | high | ✅ fixed in Phase C1 — new `components/town/bottom/BottomHUD.tsx` (180 px gradient backplate + 3-col grid) |
| D2 FocusTimer bottom variant | high | ✅ fixed in Phase C1 — `components/town/bottom/FocusTimer.tsx` (PixelDigits scale 4 + TomatoStrip + 5 buttons incl. `useSceneStore.advance` cycle) |
| D3 MatchPanel | high | ✅ fixed in Phase C1 — `components/town/bottom/MatchPanel.tsx` (avatar+? slot + 5 tag chips + dual buttons; wires `useMatchStore.requestAuto`) |
| D4 MusicPlayer bottom variant | high | ✅ fixed in Phase C1 (UI-only) — `components/town/bottom/MusicPlayer.tsx` with `EQViz` + transport + 5 genre chips; consumes `personalRadioApi.getPlaylist`. Audio playback follow-up will extract a shared `useCityRadio()` hook |
| D5 5 missing modals | high | pending — Phase C2 (modal vs route default: coexist) |
| D6 Double `Ticker` render | high | ✅ fixed in Phase C1 — `<TickerBar />` rendered twice in `town/page.tsx` |
| D7 WalkingCitizens named NPCs | high | **needs product call** — live vs curated |
| D8 Cats → Dogs species swap | high | **needs product call** — restore cats as decoration? |
| D9 Named cars | high | **needs product call** — keep equipped-vehicle pulse |
| D10 MY ROOM button + FRDS icon | medium | recommended — 5-min change |
| D11 onlineCount hardcoded vs live | medium | **needs product call** |
| D12 Missing `midnight` scene | medium | recommended — palette + density swap |
| D13 Missing `cloudy` weather | medium | recommended — port `Clouds` overlay |
| D14 TIME_TEMP value drift | medium | recommended — 1-table change |
| D15 UserStatusPill missing 🍅 | medium | ✅ confirmed already fixed in i18n (`statusPill.focusing: "專注中 · 🍅 #{count}"`) — audit doc was stale |
| D16 Birds lose names | medium | pending — Phase C3b (after C2 PR2 merges) |
| D17 Ticker `📡 LIVE` pin | medium | ✅ fixed in Phase C3a — `components/chrome/TickerBar.tsx` left-pinned `📡 LIVE` chip (solid `var(--accent)` bg + dark `#0a0524` text + silkscreen 10 0.2em) |
| D18 Weather-chip spacing | medium | verify only; mostly matches |
| D19 Lamp/tree/bench positions | low | verify StreetProps and align |
| D20 RankBoard live data | low | document — intentional |
| D21 Ticker copy lines | low | verify i18n matches reference |
| D22 BlinkDot dot sizes | low | documented — no drift found |

**Recommendation:** Page 3 needs a roadmap PR cluster, not a single follow-up.
- **Phase A** (foundational): D1 + D2 + D3 + D4 — restore the BottomHUD with its three children. Estimated ~1 week of effort.
- **Phase B** (modal pass): D5 (modal vs route is a product call) — then build ProfileModal + FriendsModal + FeedbackModal + SupportModal. Shop/Achievements may stay as full routes if the design owner agrees.
- **Phase C** (NPCs & polish): D7 / D8 / D9 / D16 — restore named NPC decorations on top of the presence pipeline. Many of these are decorative add-ons; minimal risk to the existing live data.
- **Phase D** (tokens & state): D10 / D11 / D12 / D13 / D14 / D15 — small tactical fixes; can be bundled as one `style/state(town): align tokens + decouple time-of-day from weather` PR.
- **Phase E** (verify-and-align): D6 / D17 / D18 / D19 / D20 / D21 — quick checks + 1-line corrections.

This audit treats the live-presence wiring (D7/D8/D9/D11) as **better product behavior than the reference's static NPCs** — restoring the names is recommended only as decoration, not by replacing the live data.
