# Reference internal consistency audit — `/home/docker_admin/develop/focustown/reference` (2026-05-20)

Audit scope: the **reference design directory itself** (4 HTML prototypes + 65 versioned screenshots + 13 JSX components), checking for internal contradictions between the HTML and the screenshots and across the HTML variants. Implementation-vs-reference alignment is **out of scope** here — that lives in `ui-sync-audit-page-1..6-side.md`.

Methodology:
1. Static read of each HTML's `:root` palette, `<title>`, and inline copy
2. Visual inspection of every screenshot at native 924×540
3. Headless render of each HTML via Playwright (Chromium, viewport 924×540, animations disabled, networkidle + 2.5 s settle) → `docs/qa/ref-renders/`
4. Pixel diff (PIL, threshold 15) between renders and paired screenshots, and between adjacent screenshot versions → `docs/qa/ref-diff/`

Renders and diff overlays committed alongside this report for future cross-checking.

---

## Summary

- **20 findings total**: 9 high, 6 medium, 5 low.
- The reference dir holds **two completely different design generations** of the same product (an **"FocusTown" Era A** with a 3-direction NEON / DUSK / RAIN palette, and a **"LowBatteryTown" Era B** with a single refined warm-peach palette) plus a **mid-flight rebrand transition (v5)** with no matching HTML. There is no manifest or marker telling a reader which is canonical.
- **One of the four HTML files is broken at runtime.** `FocusTown-standalone-src.html` throws `tFor is not a function` and renders an empty page. Anyone who treats it as a source of truth gets nothing.
- **The 8.4 MB `FocusTown - Standalone.html` bundle never advances past the "FOCUSTOWN — LOADING THE TOWN…" splash in headless contexts (≥ 15 s wait).** It still encodes the Era A branding `v1.0`, day stamp `THU · MAY 14`, and a Town UI with different button labels (`🔗 配對 / 大冒險 / 🛒 道具商店 / 楔報好友`) that match **none** of the 65 screenshots.
- **Screenshot counts in any prior reporting were off**: the directory holds **65 PNGs**, not 73. The earlier "73" count double-counted some animation-frame sequences.
- **The v5 era is an orphan**: `v5-town.png` and `v5-town2.png` show the "Low Battery Town" wordmark already, but the neon-purple palette is still in use. No HTML file represents this transitional state — Era A HTML still says "FOCUSTOWN" and Era B HTML is already the warm palette.
- **Login was rebuilt from scratch v2 → v6 (87.4 % pixel diff).** The form structure, SSO providers, citizen avatar strip, wordmark, and background composition all differ. Town only drifted by 55.0 % across the same span; login is the highest-churn surface.

---

## Inventory (corrected)

### HTML files (4)

| File | Bytes | Lines | Era | Branding in `<title>` | Renders to | Runtime status |
|---|---|---|---|---|---|---|
| `FocusTown.html` | 8 058 | 214 | **B / Refined** | `LowBatteryTown — 充電中的城市 · 找你的人 · 找你的專注` | Town (skips login) | OK |
| `FocusTown-standalone-src.html` | 14 892 | 384 | **A / Neon** | `FocusTown — 找你的人 · 找你的專注` | nothing (black screen) | **Broken**: `tFor is not a function` |
| `FocusTown - Standalone.html` | 8 447 162 | 298 | **A / Neon** | `FocusTown — 找你的人 · 找你的專注` | "FOCUSTOWN — Loading the town…" splash; UI dumped to `innerText` shows v1.0 Town with deprecated button labels | OK but does not advance past splash in 15 s |
| `cloud-preview.html` | 1 804 | 33 | utility | `Cloud Preview` | sky/city scene gallery | OK; web fonts (DotGothic16/VT323) not loaded headless → CJK labels render as `□□□□` |

### Screenshots (65 total)

| Version | Count | Files |
|---|---|---|
| Pre-versioned singletons | 9 | `login.png`, `town-initial.png`, `town-2..5.png`, `clouds-preview.png`, `01-character.png`, `02-character.png` |
| `v2-*` | 5 | `buddy / character / login / solo / town` |
| `v3-*` | 6 | `buddy / login / login-scrolled / profile / solo / town` |
| `v4-*` | 15 | `login / login2 / login3 / login4 / login-final / 01-v4-login5 / 02-v4-login5 / 01-v4-login-fix / 02-v4-login-fix / 03-v4-login-fix / 01-v4-login-fix2 / 02-v4-login-fix2 / 03-v4-login-fix2 / solo / town / wallet` |
| `v5-*` | 10 | `solo / town / town2 / 01-v5-solo2 / 02-v5-solo2 / 01-v5-solo3 / 02-v5-solo3 / 01-v5-cycle / 02-v5-cycle / 03-v5-cycle` |
| `v6-*` | 17 | `after-fixes / clouds / clouds-scroll(×4) / cycle(×3) / login / login-scroll / street / town / town2 / town-fix` |
| `*-clouds-preview2-*` | 4 | `01..04-clouds-preview2.png` |

All PNGs are **924×540**, all 8-bit RGB.

### JSX (13 files, behavioral source)

`app.jsx`, `i18n.jsx`, `pixel.jsx`, `pixel-environment.jsx`, `buildings.jsx`, `sprites.jsx`, `ui-shared.jsx`, `tweaks-panel.jsx`, `screen-login.jsx`, `screen-town.jsx`, `screen-buddy.jsx`, `screen-character.jsx`, `screen-focus.jsx`. The Era A HTML and Era B HTML both `<script src="...">` the same JSX, so the JSX itself is whichever generation was last edited — it is not eras-aware.

---

## Pairing Map

This is the map a future reader needs but the reference dir does not provide.

| Screenshot bucket | Era | Best-matching HTML | Confidence | Evidence |
|---|---|---|---|---|
| `v2-*`, `v3-*`, `v4-*` | A / NEON, branding "FOCUSTOWN" | `FocusTown - Standalone.html` (bundled) | medium | matches palette + wordmark, but button labels diverge (see F-04) |
| `v5-town*`, `v5-solo*`, `v5-cycle*` | **TRANSITION** — "Low Battery Town" wordmark + neon palette | **none** | — | no HTML represents this state; rebrand wordmark + old palette is unrecoverable from any HTML in the directory |
| `v6-*` | B / REFINED, branding "Low Battery Town" | `FocusTown.html` | high | render pixel diff vs `v6-after-fixes.png` = 37.9 % (best of all pairs tested); `FocusTown.html` innerText contains `LBT.TV`, `LV.4`, Whisp/Echo/Wren animal walkers, exactly matching v6 content |
| `clouds-preview.png`, `01..04-clouds-preview2.png` | utility | `cloud-preview.html` | high | render shows the `day` / `dawn` scene gallery; filename collision is the only signal |
| `login.png`, `town-initial.png`, `town-2..5.png`, `01-character.png`, `02-character.png` | pre-versioned, era unclear | none reliably | low | `town-initial.png` and `town-2..5.png` show progressive day-cycle states from one screen but with no version stamp it is impossible to say which HTML produced them |

**Unpaired screenshots: 9 pre-versioned singletons** (the row above) — not attributable to any specific HTML era without further metadata.

---

## 4-variant Token diff

Extracted from each HTML's `:root { … }` block(s). `cloud-preview.html` defines no design tokens (it lives off `pixel-environment.jsx` defaults), shown as N/A.

### Default palette per file

| Token | `FocusTown.html` (B) | `FocusTown-standalone-src.html` (A default) | `FocusTown - Standalone.html` (A bundle, default) | `cloud-preview.html` |
|---|---|---|---|---|
| `--bg-0` | `#0f1426` (deep indigo) | `#07041a` (near-black violet) | `#07041a` | N/A |
| `--bg-1` | `#16203c` | `#110826` | `#110826` | N/A |
| `--sky-top` | `#15203d` | `#07041a` | `#07041a` | N/A |
| `--sky-mid` | `#2a3a64` | `#1a0d3d` | `#1a0d3d` | N/A |
| `--ink` | `#f4ecd8` (warm cream) | `#f5f3ff` (cool white) | `#f5f3ff` | N/A |
| `--accent` | `#e9a76e` (warm peach) | `#b794f6` (purple) | `#b794f6` | N/A |
| `--accent-2` | `#c98aa3` (dusty rose) | `#ec4899` (magenta) | `#ec4899` | N/A |
| `--accent-3` | `#91a8c4` (slate blue) | `#22d3ee` (cyan) | `#22d3ee` | N/A |
| `--accent-4` | `#f4d289` (cream-yellow) | `#fbbf24` (amber) | `#fbbf24` | N/A |
| `--window-warm` | `#f4d289` | `#fcd34d` | `#fcd34d` | N/A |
| `--window-pink` | `#c98aa3` | `#f0abfc` | `#f0abfc` | N/A |
| `--panel-bg` | `rgba(15,20,38,0.55)` | `rgba(11,6,29,0.85)` | `rgba(11,6,29,0.85)` | N/A |
| `--neon-glow` | `0 0 6px rgba(233,167,110,0.4)` | `0 0 6px rgba(183,148,246,0.6), 0 0 14px rgba(183,148,246,0.35)` | identical to src | N/A |

**0 tokens match between Era A and Era B**. Every single custom property changed value across the rebrand. The naming kept (so JSX consumers don't rebreak), but the semantic meaning of each token shifted — a CSS variable called `--accent-3` is "soft slate" in Era B but "neon cyan" in Era A.

### Alternate palette directions (Era A only)

`FocusTown-standalone-src.html` (and its bundle) supports two further direction-swap palettes via `:root[data-direction="…"]`:

| Token | A · NEON NIGHT (default) | A · DUSK LOFI (`data-direction="dusk"`) | A · RAINY SYNTHWAVE (`data-direction="rain"`) |
|---|---|---|---|
| `--bg-0` | `#07041a` | `#2a0d1f` | `#03061a` |
| `--ink` | `#f5f3ff` | `#fff5e1` | `#e0f7ff` |
| `--accent` | `#b794f6` (purple) | `#ffb86b` (orange) | `#00f5d4` (cyan) |
| `--accent-2` | `#ec4899` (magenta) | `#ff6b9d` (pink) | `#ff006e` (hot pink) |
| `--accent-3` | `#22d3ee` (cyan) | `#ffd166` (yellow) | `#8338ec` (purple) |
| `--accent-4` | `#fbbf24` (amber) | `#fbbf24` (amber, same) | `#ffbe0b` (amber, slightly different) |

`FocusTown.html` (Era B) explicitly **disables** the direction switch with `:root[data-direction="dusk"] {}` and `:root[data-direction="rain"] {}` — both branches are no-ops. The comment `/* Keep data-direction overrides as no-ops so existing tweaks don't break */` reads as "we kept the selectors so JSX won't crash but you can't actually theme any more".

### Title strings

| File | `<title>` |
|---|---|
| `FocusTown.html` | `LowBatteryTown — 充電中的城市 · 找你的人 · 找你的專注` |
| `FocusTown-standalone-src.html` | `FocusTown — 找你的人 · 找你的專注` |
| `FocusTown - Standalone.html` | `FocusTown — 找你的人 · 找你的專注` |
| `cloud-preview.html` | `Cloud Preview` |

The rebrand to "LowBatteryTown" + the new tagline "充電中的城市" lives in exactly one HTML.

---

## HTML render vs screenshot findings

Each finding is severity-tagged and cites `file:line` for HTML or `screenshots/<name>.png` for screenshot evidence. Renders live at `docs/qa/ref-renders/<stem>__initial.png` and diff overlays at `docs/qa/ref-diff/<label>.png`.

### F-01 — `FocusTown-standalone-src.html` is broken at runtime *(high)*

- **Evidence**: rendering `http://localhost/FocusTown-standalone-src.html` throws `tFor is not a function` and the page stays black (`docs/qa/ref-renders/FocusTown-standalone-src__initial.png`).
- **Root cause**: the JSX it loads (`app.jsx` / `i18n.jsx`) expects an i18n helper named `tFor` that does not exist on the global scope at runtime. Either the script that defines it was renamed/removed, or this HTML was committed before that helper was wired up.
- **Impact**: anyone treating `-src.html` as the "human-readable source" of the bundled `Standalone.html` is reading dead code. The two files **diverge** — the bundle works, the source does not.
- **Fix**: either delete `FocusTown-standalone-src.html`, or restore the missing `tFor` definition. Until then, mark the file with a header comment: `<!-- BROKEN: do not load directly; see FocusTown - Standalone.html for the working bundle -->`.

### F-02 — `FocusTown - Standalone.html` stalls on splash in headless *(high)*

- **Evidence**: `docs/qa/ref-renders/FocusTown-Standalone-bundled__initial.png` shows only the purple `FOCUSTOWN — LOADING THE TOWN…` splash even after 15 s of `networkidle` + dwell. The inner text dump confirms the Town UI **is** present in the DOM, just hidden by the splash overlay (`#splash`, defined at `FocusTown - Standalone.html:201`).
- **Impact**: any automated visual-regression run against this file captures the splash, not the Town. Every diff vs every Town screenshot shows ≥ 52 % delta — useless.
- **Fix**: add an exit gate to `#splash` that does not depend on real-time animation (e.g. `localStorage` skip), or document the navigation step required (`page.evaluate(() => document.getElementById('splash').remove())`) in any audit tooling that loads this file.

### F-03 — `FocusTown.html` does not render a login screen at all *(high)*

- **Evidence**: rendering `FocusTown.html` lands directly on the Town screen (`docs/qa/ref-renders/FocusTown__1440.png`). The DOM has no login form, no SSO buttons, no email/password inputs in any state.
- **Root cause**: the HTML mounts `<App>` (`FocusTown.html:` script tags around L195) which goes straight to `<TownScreen>` and never instantiates `<LoginScreen>`.
- **Impact**: the **9 v6 login screenshots** (`v6-login.png`, `v6-login-scroll.png`, plus the v4-login-fix family captured under the older neon palette) have **no Era B HTML counterpart**. The login design lives only in `screen-login.jsx` and in the screenshots. Anyone porting the v6 login must rely on JSX + PNG, not on a working HTML render.
- **Fix**: either add a `?screen=login` URL parameter handler to `FocusTown.html`, or commit a second Era B HTML (`FocusTown-login.html`) whose initial state is `<LoginScreen>`. Same pattern as `cloud-preview.html`.

### F-04 — Era A bundled HTML uses Town button labels that match **no** screenshot *(high)*

- **Evidence**: inner-text dump of the bundled HTML (`/tmp` render harness output) shows the top-right Town actions are `🔗 配對 / Yuki 大冒險 / 🛒 道具商店 / 楔報好友`. The Era A screenshots (`v2-town.png`, `v3-town.png`, `v4-town.png`) all show **`ACHV / SHOP / FRDS`** in the same position. The Era B screenshots (`v6-town.png`, `v6-town2.png`) also show `ACHV / SHOP / FRDS`.
- **Impact**: the **bundle** is older than even v2 in the screenshot timeline — it is essentially a "v0/v1" prototype with the original Chinese-label affordances that was later replaced by English ACHV/SHOP/FRDS chips. Treating it as the canonical Era A reference for Town will copy in a deprecated layout.
- **Fix**: re-bundle from the v2/v3-era JSX (after the ACHV/SHOP/FRDS rename), or annotate the file with `<!-- ARCHIVE: pre-v2 prototype; superseded by v2-town.png onwards -->`.

### F-05 — Era A bundled HTML clock shows different day stamp from every screenshot *(medium)*

- **Evidence**: bundled HTML `innerText` shows `19:52 THU · MAY 14`. v2/v3/v4 town screenshots all show `22:10 SAT · MAY 16`. v6-after-fixes shows `21:51 SAT · MAY 16`.
- **Root cause**: each generation pinned a different "demo time" constant; the bundled HTML's constant pre-dates the SAT MAY 16 demo.
- **Impact**: minor — but if you use the HTML's wall-clock for layout calibration (e.g. measuring how wide the time chip needs to be) you copy a `19:52` width that is narrower than any screenshot.
- **Fix**: standardize the demo timestamp across all references, or treat the time chip as variable-width and document min/max chars.

### F-06 — `FocusTown.html` "FOCUS · #5" tag in renders does not appear in any v6 screenshot *(medium)*

- **Evidence**: `FocusTown.html` innerText shows `FOCUS · #5` next to the bottom-left timer (timer reading `24:59`). v6-town.png and v6-after-fixes.png show only `FOCUS` with no `#5` decoration; the `#5` count only appears as `🍅 #5` inside the Yuki player chip top-right.
- **Impact**: the Era B HTML decorates the timer panel with a redundant pomodoro count that the v6 design has already moved to the player chip. Whoever ports this from HTML inherits the duplication.
- **Fix**: remove the inline `#5` from the timer label in `screen-focus.jsx` (probably the source); the player chip is now the single source for current pomodoro count.

### F-07 — v6-town.png shows "1,247 T 幣 +2" but `FocusTown.html` Town render shows none *(medium)*

- **Evidence**: v6-town.png has a top-bar T-coin balance chip `1,247 T 幣 +2` between the weather chip and the player chip. The `FocusTown.html` Town render and innerText dump do not include any T-coin chip — that span is occupied by `🌙 夜晚 · ☀ 晴朗 · 16°C · ONLINE 2,847` and then jumps to the player chip.
- **Root cause**: v6 town screenshots are taken from a build that has wallet integration enabled; `FocusTown.html` was bundled either before that build or with the wallet stub disabled.
- **Impact**: implementation following `FocusTown.html` will not render the T-coin chip; following the screenshot will. Choose one.
- **Fix**: rebundle `FocusTown.html` from the current JSX with the wallet stub on, or add a `v6-town-no-wallet.png` reference variant to make the absence intentional.

### F-08 — Login layout completely rebuilt v2 → v6 (87.4 % pixel diff) *(high)*

- **Evidence**: `docs/qa/ref-diff/v6-login__vs_v2-login.png` (red-overlay diff = 87.4 %).
  - v2: white "GOOGLE" CTA + GITHUB/APPLE row + email/password form + "進入小鎮" big purple CTA, "FOCUSTOWN" pixel wordmark center
  - v6: "Low Battery Town" wordmark center, character avatar strip (6 pixel faces), GOOGLE / GITHUB / APPLE buttons, smaller form, no big CTA at fold
- **Impact**: there is **no migration path documented** between v2 and v6 login. The intermediate `v3-login*`, `v4-login*` and the `01..03-v4-login-fix*` frames suggest someone iterated on form spacing inside the **neon era**, then a fresh rebuild for v6 wiped that work.
- **Fix**: in any future audit, treat v2 / v3 / v4 logins as "deprecated reference only — do not port pieces of them into a v6 layout". Add a note to that effect at the top of `screen-login.jsx`.

### F-09 — v5 transition has no HTML, no documentation *(high)*

- **Evidence**: `v5-town.png` and `v5-town2.png` show the **"Low Battery Town" wordmark already in place** (top-left chip), but every visible panel (focus broadcast, player chip, leaderboard, bottom dock) is still in the Era A neon-purple palette. `v5-solo.png` and the `01/02-v5-solo*.png` / `01..03-v5-cycle.png` frames continue the same hybrid.
- **Impact**: v5 is a **branding-first, palette-later** rebrand step. Whoever was deciding between Era A and Era B had v5 as a checkpoint, and that checkpoint has no HTML embodiment. If implementation is told to "follow v5", there is nothing in the HTML to follow — only the screenshots.
- **Fix**: either (a) discard v5 screenshots from the canonical set and pretend the rebrand happened atomically v4 → v6, or (b) commit a `FocusTown-v5.html` that holds the hybrid state for posterity. Option (a) is cheaper unless you actually shipped v5.

### F-10 — `FocusTown.html` adds animal walkers (Whisp / Echo / Wren) not in any v2-v4 screenshot *(medium)*

- **Evidence**: `FocusTown.html` innerText starts with `Whisp · 夜飛\nEcho · 巡邏\nWren · 尋食` — three new animal walkers. v6-town.png and v6-after-fixes.png show the same bird+deer pixels (visible at street level). v2/v3/v4 town screenshots have NO such walkers — only the human citizens.
- **Impact**: a new Era B feature (animals as ambient walkers) was introduced. Anyone porting v2-v4 town will not have these; anyone porting v6 town will. Mark the boundary explicitly.
- **Fix**: document the v5 / v6 boundary as "introduces animal walkers + LBT.TV channel chip". Already partially present in `sprites.jsx` but not flagged in audit docs.

### F-11 — `LBT.TV` channel chip is Era B exclusive *(low)*

- **Evidence**: `FocusTown.html` and v6-town2.png both show `CH 04 · LBT.TV` next to the LIVE viewer count. v2-v4 town screenshots show `LIVE · 2,847 ONLINE` only — no channel chip.
- **Impact**: minor. Confirms F-10's era boundary.
- **Fix**: include in the v5→v6 boundary doc note.

### F-12 — `cloud-preview.html` web fonts fail in headless contexts *(low)*

- **Evidence**: `docs/qa/ref-renders/cloud-preview__initial.png` (and `__1440.png`) shows CJK labels as `□□□□`. The HTML loads `DotGothic16` from Google Fonts via the JSX `pixel-environment.jsx`, and Playwright Chromium does not have DotGothic16 installed locally.
- **Impact**: irrelevant for production (real Chrome loads fonts) but means automated visual-regression tooling needs `document.fonts.ready` + an explicit timeout, or font preloading via `--font-render-hinting`.
- **Fix**: in any audit script, await `document.fonts.ready` before the `waitForTimeout`. The render-ref2.cjs harness already does this for `cloud-preview` only — generalize to all 4.

### F-13 — `FocusTown.html` defines glow tokens but uses warm-peach values, not neon *(low)*

- **Evidence**: `FocusTown.html:39-41` defines `--neon-glow / --neon-glow-pink / --neon-glow-cyan` whose RGB values are `233,167,110` (warm peach) / `201,138,163` (rose) / `145,168,196` (slate). The token *name* still says "neon" but the *value* is decidedly not neon.
- **Impact**: a future editor opening this HTML will assume `--neon-glow-cyan` is cyan. It is not.
- **Fix**: rename to `--accent-glow / --rose-glow / --slate-glow` in the Era B HTML, or leave the names and add an explicit comment block above them stating "names are legacy; values are calm".

### F-14 — 9 pre-versioned singleton screenshots cannot be paired *(medium)*

- **Evidence**: `login.png`, `town-initial.png`, `town-2.png`, `town-3.png`, `town-4.png`, `town-5.png`, `01-character.png`, `02-character.png`, `clouds-preview.png` have no `vN-` prefix. Visually they share Era A palette (neon purples) but the wordmark in `login.png` is more polished than v2-login.png — closer to v3 or v4.
- **Impact**: these screenshots may be **older than v2 or interleaved between named versions** — there is no way to tell from the filenames alone.
- **Fix**: rename or move to `screenshots/_legacy/` with a `MANIFEST.md` mapping each to its closest `vN`. Best-guess mapping:
  - `login.png` ↦ between v3 and v4
  - `town-initial.png` … `town-5.png` ↦ day-cycle frame set, Era A (post-v2 pre-v4)
  - `01-character.png`, `02-character.png` ↦ Era A (matches `v2-character.png` palette)
  - `clouds-preview.png` ↦ Era A cloud-preview.html output

### F-15 — Era A and Era B share JSX modules, breaking expected "era ⇒ JSX state" mapping *(medium)*

- **Evidence**: both `FocusTown.html` and `FocusTown-standalone-src.html` load the *same* `screen-town.jsx`, `screen-login.jsx`, etc. via `<script src="…">`. Whichever HTML is opened later renders the *current* JSX content — but the JSX is whichever generation was last touched (currently appears Era B per inner text dumps).
- **Impact**: re-rendering `FocusTown-standalone-src.html` will not give you an Era A Town — it will give you the **current** JSX in an Era A palette (or fail, see F-01). The "Era A" referent really only exists in the **bundled** `FocusTown - Standalone.html` (where the JSX is inlined and frozen) and in the v2-v4 screenshots.
- **Fix**: treat the bundle as the only frozen Era A reference; treat the JSX + Era B HTML as Era B; delete the broken `-src.html`. Document this in any new `MANIFEST.md`.

### F-16 — Bundled HTML's hardcoded online count is `12 人同你一起`; v2 screenshots show `2,847 ONLINE` *(low)*

- **Evidence**: bundled `innerText` shows `12 人同你一起`; `v2-town.png` and all v3/v4/v5/v6 town screenshots show `ONLINE 2,847`.
- **Impact**: implementation following the bundle hardcodes "12 friends online"; following any screenshot shows "2,847 online".
- **Fix**: standardize on the screenshot copy (`ONLINE 2,847`), since five generations of screenshot agree.

### F-17 — `FocusTown.html` button uppercase pattern matches v6 only *(low)*

- **Evidence**: `FocusTown.html` `.pixel-btn { text-transform: uppercase }` (`FocusTown.html:` button block ~L113). v2-v4 buttons in screenshots are uppercase too (so this matches). v5/v6 buttons remain uppercase in screenshots. Consistent.
- **Impact**: none — included for completeness as an audit-passes check.

### F-18 — Cross-version drift in screenshots quantified *(medium)*

- **Evidence** (from `docs/qa/ref-diff/v6-town__vs_*.png`):

| Pair | % pixel diff (thr=15) | Reading |
|---|---|---|
| `v6-town` vs `v5-town` | 29.5 % | minor refinement (palette + chip changes) — within an era |
| `v6-town` vs `v4-town` | 42.1 % | era boundary (Era A → Era B) |
| `v6-town` vs `v2-town` | 55.0 % | era + 4 versions, ~half the pixels changed |
| `v6-login` vs `v4-login-final` | 78.1 % | login was rebuilt, not refined |
| `v6-login` vs `v2-login` | 87.4 % | ~total redesign |

- **Reading**: town design **evolved**, login design **was replaced**. Different lifecycles.

### F-19 — Era B HTML lacks the alternative `dusk`/`rain` palettes, so they cannot be re-tested *(low)*

- **Evidence**: `FocusTown.html:42-46` keeps the `data-direction="dusk"` and `data-direction="rain"` selectors as empty rules. Era A had three full palettes (neon / dusk / rain). Era B has one. There is no way to preview "what would the refined era look like in a dusk variant".
- **Impact**: minor — if the team ever wants to revive the multi-direction palette swap, the values must be re-authored from scratch.
- **Fix**: optional. Either keep as-is and remove the dead selectors, or re-author dusk/rain variants of the warm palette.

### F-20 — Screenshot count claims in any prior documentation were off *(low)*

- **Evidence**: Phase 1 inventory in this audit's plan claimed 73 PNGs; actual `ls | wc -l` = **65**.
- **Impact**: any spreadsheet or jira ticket that cited "73 reference screenshots" needs correction.
- **Fix**: this report is the corrected source. If a count is needed elsewhere, cite `65 PNGs as of 2026-05-20`.

---

## Cross-version Screenshot drift

Narrative summary per screen, using diff percentages from F-18 plus visual reads.

### Town

- **v2 → v3 → v4**: minor iteration inside the neon era. Same FOCUSTOWN wordmark, same ACHV/SHOP/FRDS top-right, same focus-broadcast panel (`Notion · 一個地方寫下你所有想法` sponsor changes copy slightly between v3 and v4). Day stamp constant `22:10 SAT · MAY 16` is shared across all three.
- **v4 → v5**: branding swap to "Low Battery Town" wordmark in top-left chip. Palette **unchanged** (still neon-purple panels). Pomodoro counter format unchanged. T-coin chip added (`1,251 T 幣 +2` in `v5-town.png` vs `1,247 T 幣 +2` in v6).
- **v5 → v6**: 29.5 % pixel diff — full palette swap to warm peach + dusty rose + slate, plus addition of animal walkers (Whisp / Echo / Wren), `CH 04 · LBT.TV` chip next to LIVE counter, and corner watermark moved (`LBT v1.4.0` upper-left instead of `FOCUSTOWN v1.2`).
- **Canonical recommendation**: **`v6-after-fixes.png`** — the last v6 frame, where post-launch fixes have settled. Use it as the single source for Town moving forward.

### Login

- **v2 → v3 → v4**: large iteration history with no consolidating "final". `v3-login-scrolled.png` introduces scroll behavior. v4 alone has **9 screenshots** (`v4-login`, `v4-login2..4`, `v4-login-final`, plus 5 `01..03-v4-login-fix*` frames) — the team clearly iterated heavily on the form here.
- **v4 → v6**: 78.1 % pixel diff to v4-login-final. Complete rebuild. No v5-login.png exists at all (the v5 set has no login).
- **v6**: includes login + login-scroll (scrolled state) — a 2-frame canonical set.
- **Canonical recommendation**: **`v6-login.png` + `v6-login-scroll.png`** as the pair. All v2-v4 login screenshots can be archived.

### Solo / Buddy / Character

- These are not present at every version. v2 has all three; v3 has buddy + profile + solo; v4 has only solo; v5 has solo + 4 frame variants (`v5-solo2`, `v5-solo3`); v6 has nothing for buddy/character/profile (subsumed into a different structure).
- **Canonical recommendation**: there is no v6 buddy / character / profile screenshot at all. Either (a) capture v6 frames before declaring the audit closed, or (b) keep `v5-*` as Era B-adjacent reference and document the palette swap as a known known.

### Cycle / Clouds-scroll

- `01..03-v5-cycle.png` and `01..03-v6-cycle.png` are 3-frame day-cycle animations of identical compositional content; v5 vs v6 differs in palette only. `01..04-v6-clouds-scroll.png` is a 4-frame animation of the cloud parallax — no v2-v4 equivalent.
- **Canonical recommendation**: v6 cycle (3 frames) + v6 clouds-scroll (4 frames). Era A cycle/clouds-scroll did not exist.

### Wallet / Profile / Street

- `v4-wallet.png` is a one-off Era A wallet popover; `v3-profile.png` is a one-off profile sheet. `v6-street.png` is a wide street-level shot (Era B). Neither generation has both.
- **Canonical recommendation**: these are reference fragments. They should live in `screenshots/_fragments/` with a one-line note in `MANIFEST.md` describing what they show.

---

## Recommendations

These are the **structural** moves implied by the findings, ordered by ROI.

1. **Add `MANIFEST.md` at the reference root** (`/home/docker_admin/develop/focustown/reference/MANIFEST.md`) — a short document declaring:
   - Era B (refined, "Low Battery Town") is canonical; v6 screenshots are the authoritative reference.
   - Era A (neon, "FocusTown") and v2-v4 screenshots are archived for design history only.
   - `FocusTown.html` is the working Era B reference; `FocusTown - Standalone.html` is a frozen Era A archive; `FocusTown-standalone-src.html` is broken and slated for deletion; `cloud-preview.html` is a utility.
   - Address F-01, F-02, F-03 by listing each HTML's known quirks.
2. **Delete or quarantine `FocusTown-standalone-src.html`** (F-01). It cannot render and the bundled version supersedes it. If preserved, prepend a `<!-- BROKEN -->` HTML comment so a future reader does not waste time.
3. **Capture a v6 login + town render directly from `FocusTown.html`** with the splash bypassed and the wallet stub enabled, and commit it as `v6-canonical-{login,town}.png`. This becomes the single image a downstream auditor diffs against — pinning the Era B HTML and the Era B screenshots together. Resolves F-07 and the F-03 "no login HTML" gap.
4. **Archive v2-v4 login screenshots and v2-v4 buddy/character/profile under `screenshots/_archive_era_a/`** (F-08, plus the buddy/character/solo orphans noted under Cross-version drift). Keep them for design history but stop them from being treated as current reference.
5. **Decide on v5**: either archive (cheaper) or commit a `FocusTown-v5.html` to capture the rebrand-with-old-palette state (F-09). Default to archive unless the team actually shipped a v5.
6. **In implementation-side audit docs** (`docs/qa/ui-sync-audit-page-*.md`), add a one-line header citing this report and reaffirming "v6 + `FocusTown.html` is the canonical pair; everything else is history". This stops future audits from comparing implementation against an Era A artifact by accident.

---

## Verification

How to re-run this audit:

```bash
# 1. Start a local http server on the reference dir
cd /home/docker_admin/develop/focustown/reference && python3 -m http.server 8765 &

# 2. Render all 4 HTML files (uses /tmp/node_modules/playwright from this audit; see scripts/ref-audit/render-reference.mjs)
PORT=8765 OUT=docs/qa/ref-renders node scripts/ref-audit/render-reference.mjs

# 3. Run pixel diffs (PIL-based, no extra deps)
python3 scripts/ref-audit/pixdiff.py   # adapted from /tmp/pixdiff.py used in this audit

# 4. Spot-check counts
ls /home/docker_admin/develop/focustown/reference/screenshots | wc -l   # expect 65
ls /home/docker_admin/develop/focustown/reference/*.html | wc -l         # expect 4
```

Findings should reproduce within ±1 % on the pixel diff percentages (jitter from font subpixel + animation seed). If diffs jump > 5 %, the JSX moved underneath one of the HTML files — re-do the era assignment.
