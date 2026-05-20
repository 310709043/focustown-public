# Canonical reference index — LowBatteryTown v6 (2026-05-20)

**One document. The implementation reads this and only this.** Resolves all ambiguities surfaced in `reference-internal-consistency.md` by pinning a single source-of-truth for each visual + behavioural decision.

Use ranking when files conflict:
1. **Visuals** → the v6 screenshot listed below
2. **Behaviour / props / i18n** → the JSX file listed below
3. **HTML** → only valid as a renderable harness for QA; never as a spec

If a v6 screenshot disagrees with a JSX file, the screenshot wins (designer's last sign-off). Open a discrepancy ticket and update JSX, not the other way around.

---

## 0 · Locked decisions (this session)

| Decision | Locked value | Why it matters |
|---|---|---|
| Canonical product name | **LowBatteryTown** (LBT) | Era B; supersedes the legacy "FocusTown" name |
| Canonical tagline | `充電中的城市 · 找你的人 · 找你的專注` | From `FocusTown.html:6` title |
| Canonical palette | Era B refined (warm peach `#e9a76e` + dusty rose `#c98aa3` + slate `#91a8c4` + cream-yellow `#f4d289`) | Drops all neon tokens |
| Canonical wordmark | `LBT v1.4.0 · 鎮民 N,NNN` top-left chip | Matches v6 screenshots |
| Canonical version stamp | `v1.4.0` | v5/v1.0 are archived |
| MVP scene set | **Login / Town / Cycle / Clouds** only | Solo / Buddy / Character / Profile / Wallet deferred to post-MVP design |
| Source of truth (visual) | v6 screenshots | Era A (v2-v4) and v5 are archived |
| Source of truth (behaviour) | JSX in `focustown/reference/screen-*.jsx` | HTML are renderers, not specs |
| v5 transition assets | **Archive** to `_archive_v5/` | No HTML representation; treat v4 → v6 as atomic |
| Multi-direction palette (dusk/rain) | **Removed** | Era B keeps only one direction; strip dead `:root[data-direction]` selectors |
| Canonical city base | **832833 / city 1** (Day + Night pair, 5 layers each) | "Industrial high-rise + power lines" — fits LowBattery (electricity) framing |
| Cloud strategy | Sprite-based (multi-asset) | Procedural canvas-drawn clouds in `pixel-environment.jsx` are deprecated |
| Cloud asset pack | **801184** for individual drifting clouds; **558275** + **995711** as alternative full-sky overlays | Picked by scene mood, see Town spec below |
| Pedestrians | **516149** City_men_1/2/3 — replace inline pixel walkers | Frame 128×128 → render @ 0.45× (≈58px on screen) |
| 1-bit sky (281031) | **Design reference only**, not wired | Aesthetic too far from refined palette |
| Farm animals (291971) | **Only Chick + Rooster** as NamedBirds | Sheep/Lamb/Piglet/Bull/Calf/Turkey stored unused |
| Hunt animals (789196) | **Not in MVP**; gallery / future forest scene reserved | Saved for post-MVP "focus break ambient" scene |
| Cars (876810) | Jeep_1 + Passenger car for `CarsLane` ambient driving | Jeep_2 archived (different scale 256×256); Ride/Ride_back loops only |

---

## 1 · MVP scenes — per-scene asset bundle + layer stack

Each scene has:
- **Visual ref** — the v6 screenshot the implementation must match
- **Behaviour ref** — the JSX that owns props, i18n, events
- **Layer stack** — back-to-front composition with assets pinned
- **Animation params** — fps, spawn rules, parallax speeds

### 1.1 Town (canonical hero scene)

| | Pin |
|---|---|
| **Visual ref** | `screenshots/v6-after-fixes.png` (canonical) + `v6-town.png` `v6-town2.png` `v6-town-fix.png` (variants) `v6-street.png` (wide camera) |
| **Behaviour ref** | `screen-town.jsx` (116 KB — the largest screen, owns broadcast / leaderboard / buddy widget / lofi player / day-cycle) |
| **Viewport** | 924 × 540 logical |
| **Day-cycle states** | Day / Dawn / Dusk / Night / Midnight — drive via `scenes.ts` palette swap **AND** background asset swap (city1/Day stack vs city1/Night stack) |

**Layer stack (back to front):**

| z | Asset | Animation / behaviour |
|---|---|---|
| 10 | Sky gradient (per palette in `scenes.ts`) | Static, palette-driven |
| 20 | `832833/1 Backgrounds/1/{Day,Night}/1.png` | Static, full-bleed sky band |
| 25 | `801184/Clouds_{gray|black}/Shape{1..8}/cloud_shape{N}_{2..3}.png` × 2-3 instances | Drift, parallax_x: 0.10, spawn every ~12 s, recycle on viewport exit |
| 30 | `832833/1 Backgrounds/1/{Day,Night}/2.png` (far buildings) | parallax_x: 0.25 |
| 35 | `801184/Clouds_*/cloud_shape{N}_{3..4}.png` × 1-2 instances | Drift, parallax_x: 0.40, recycle |
| 40 | `832833/1 Backgrounds/1/{Day,Night}/3.png` (mid buildings) | parallax_x: 0.45 |
| 50 | `832833/1 Backgrounds/1/{Day,Night}/4.png` (near buildings) | parallax_x: 0.70 |
| 60 | `832833/1 Backgrounds/1/{Day,Night}/5.png` (street / foreground) | parallax_x: 1.00 |
| 70 | Walkers `516149/City_men_{1,2,3}/Walk.png` (10 frames @128×128, scale 0.45×) | Walk loop @ 10 fps, spawn 2-4 concurrent, lane y = `[street_top - 58, street_top]`, direction = mix |
| 71 | Cars `876810/{Jeep_1,Passenger car}/Ride.png` (8 frames, scale 0.30×) | Ride loop @ 10 fps, spawn every ~20 s, lane y = street center |
| 72 | NamedBirds `291971/PNG/Without_shadow/{Chick,Rooster}_animation_without_shadow.png` (6×8 cells @16×16) | Idle / Walk loop @ 8 fps; spawn 2-3, fixed positions or slow drift |
| 80 | LBT.TV channel chip + weather chip + player chip + leaderboard panel + Notion sponsor | Owned by `screen-town.jsx` |
| 90 | FOCUS timer panel (bottom-left) + Buddy finder (bottom-center) + LOFI player (bottom-right) | Owned by `screen-town.jsx` |

**Day-cycle palette swap** — read 5 cloudHi/cloudMid/cloudLow/cloudShadow palettes from existing `pixel-environment.jsx` SCENES, but apply via CSS filter (`hue-rotate / brightness`) on the layer 25/35 cloud sprites, since they're sprite-based now, not procedural.

### 1.2 Login

| | Pin |
|---|---|
| **Visual ref** | `screenshots/v6-login.png` (canonical) + `v6-login-scroll.png` (scrolled state) |
| **Behaviour ref** | `screen-login.jsx` |
| **Viewport** | 924 × 540 logical |
| **Open gap** | No HTML renderer for v6 login. **Action item**: create `FocusTown-login.html` in reference dir, mirroring `cloud-preview.html` single-screen harness pattern |

**Layer stack:**

| z | Asset | Animation |
|---|---|---|
| 10 | Sky gradient (night palette per scenes.ts) | Static |
| 20 | Stars + Moon (existing `LoginScene` components in `frontend/components/login/`) | Twinkle anim, parallax_x: 0.05 |
| 25 | `801184/Clouds_black/Shape{1,3}/cloud_shape{N}_{3,4}.png` × 1-2 | Drift, parallax_x: 0.15 |
| 30 | `832833/1 Backgrounds/1/Night/2-3.png` (far + mid buildings, Night only) | Static or very slow parallax |
| 40 | Avatar strip (6 pixel citizens) — existing `LoginCitizens` component | Float anim |
| 50 | Login form panel + SSO buttons | Owned by `screen-login.jsx` |

### 1.3 Cycle (day-cycle animation showcase)

| | Pin |
|---|---|
| **Visual ref** | `01..03-v6-cycle.png` (3 frames) |
| **Behaviour ref** | `screen-town.jsx` (cycle is a Town state transition, not a separate screen) |
| **Frame count** | 3 keyframes (Day → Dusk → Night, or similar) |

**Note**: 3-frame discrete switch, **not interpolated**. Each frame = a different palette + asset swap (city1/Day → city1/Night), held for ~10s before transitioning. Cross-fade between frames (~600 ms) acceptable but not animated parallax during transition.

### 1.4 Clouds-scroll (4-frame animation)

| | Pin |
|---|---|
| **Visual ref** | `01..04-v6-clouds-scroll.png` (4 frames) |
| **Behaviour ref** | `pixel-environment.jsx` (sky+cloud rendering, currently procedural — to be refactored to sprite-based per locked decision) |
| **Frame count** | 4 — represents the parallax cycle of clouds across the viewport |

**Note**: this is the **Town hero scene viewed without UI overlay**, showing the cloud parallax in action. Same asset stack as 1.1 Town layers 10-25, just no UI on top.

---

## 2 · Asset file locations (absolute paths)

All paths rooted at `/home/docker_admin/develop/focustown/reference/`.

| Asset | Source path | Frame info |
|---|---|---|
| **Town base (city1 Day)** | `assets-latest/craftpix-net-832833-...../1 Backgrounds/1/Day/{1..5}.png` | 5 layers, 576×324 each, mode P |
| **Town base (city1 Night)** | `assets-latest/craftpix-net-832833-...../1 Backgrounds/1/Night/{1..5}.png` | 5 layers, 576×324 each |
| **Drifting clouds (primary)** | `assets-latest/craftpix-net-801184-...../PNG/Clouds_gray/Shape{1..8}/cloud_shape{N}_{1..5}.png` | Single sprites, 5 sizes per shape (33×35 .. 288×73), RGBA |
| **Drifting clouds (night/storm)** | `assets-latest/craftpix-net-801184-...../PNG/Clouds_black/Shape{1..8}/...` | Same structure, darker palette |
| **Cloud full-sky overlay (alt)** | `assets-latest/craftpix-net-558275-...../Clouds/Clouds {1..8}/...` | 4-6 layers per set, 576×324 |
| **Cloud full-sky overlay (alt 2)** | `assets-latest/craftpix-net-995711-...../{1..4}. NEW CLOUDS/...` | 2-6 layers per set |
| **Pedestrians (3 variants)** | `assets-latest/craftpix-net-516149-...../City_men_{1,2,3}/{Idle,Walk,Run,Attack,Hurt,Dead}.png` | 128×128 frames; Walk=10, Run=10, Idle=6, Attack=4-5, Hurt=3, Dead=4-5 |
| **NamedBirds (Chick)** | `assets-latest/craftpix-net-291971-...../PNG/Without_shadow/Chick_animation_without_shadow.png` | 96×128 sheet, 6×8 = 48 cells @16×16 |
| **NamedBirds (Rooster)** | `assets-latest/craftpix-net-291971-...../PNG/Without_shadow/Rooster_animation_without_shadow.png` | 192×256 sheet, 6×8 = 48 cells @32×32 |
| **Cars (Jeep_1)** | `assets-latest/craftpix-net-876810-...../Jeep_1/{Idle,Ride,Ride_back}.png` | 192×192 cells; Idle=4, Ride=8, Ride_back=8 |
| **Cars (Passenger car)** | `assets-latest/craftpix-net-876810-...../Passenger car/{Ride,Ride_Back}.png` | 192×192 cells; Ride=8, Ride_Back=8; no Idle.png shipped |
| **v6 screenshots (canonical visual ref)** | `screenshots/v6-*.png` | All 924×540 |
| **JSX (canonical behaviour ref)** | `app.jsx`, `screen-{login,town,buddy,character,focus}.jsx`, `pixel.jsx`, `ui-shared.jsx`, `i18n.jsx` | React via Babel-standalone |

**Not wired but kept**: `281031` 1-bit sky, `291971` non-bird animals (Sheep/Lamb/Piglet/Bull/Calf/Turkey), `789196` hunt animals, `876810/Jeep_2`, `322807` city pack alternative.

---

## 3 · Animation params (defaults)

Apply per-asset unless its category-specific row says otherwise.

| Category | fps | Loop | Anchor | Notes |
|---|---|---|---|---|
| Idle (any sprite) | 8 | yes | bottom-center [0.5, 1.0] | |
| Walk | 10 | yes | bottom-center | |
| Run | 10 | yes | bottom-center | |
| Flight (birds in air) | 10 | yes | center [0.5, 0.5] | |
| Ride (car driving) | 10 | yes | bottom-center | |
| Attack / Hurt | 8 | no (one-shot) | bottom-center | |
| Death / Destroyed | 8 | no, last-frame hold | bottom-center | |
| Cloud drift (per-instance) | n/a (static sprite) | per-layer wrap | center | Translate X via CSS keyframe over 30-60s |
| Twinkle (stars) | 2 (slow) | yes | center | Existing `StarsLayer` |

**Spawn cadence (Town scene)**:
- Walkers: 2-4 concurrent on street, new spawn every ~15 s, lifespan = viewport crossing
- Cars: 1-2 concurrent, new spawn every ~20 s
- NamedBirds: 2-3 fixed/wandering near foreground
- Clouds (per layer): 2-3 visible, recycle on exit

---

## 4 · What to delete / archive (cleanup)

Once implementation lands on this index, the reference dir should be reorganised:

```
focustown/reference/
├── MANIFEST.md                    NEW — copy of "0 · Locked decisions" above
├── FocusTown.html                 KEEP (canonical Era B renderer)
├── FocusTown-login.html           NEW — create per § 1.2 open gap
├── cloud-preview.html             KEEP (utility)
├── FocusTown - Standalone.html    MOVE → _archive_era_a/
├── FocusTown-standalone-src.html  DELETE (broken at runtime per F-01)
├── *.jsx                          KEEP (behaviour source-of-truth)
├── screenshots/
│   ├── v6-*.png                   KEEP (canonical)
│   ├── 01..04-v6-clouds-scroll-*  KEEP
│   ├── 01..03-v6-cycle-*          KEEP
│   ├── clouds-preview.png         KEEP (paired with cloud-preview.html)
│   ├── 01..04-clouds-preview2-*   KEEP
│   ├── v2-*, v3-*, v4-*           MOVE → _archive_era_a/screenshots/
│   ├── v5-*                       MOVE → _archive_v5/screenshots/
│   ├── login.png, town-*, character-*  MOVE → _archive_pre_v2/
├── assets/ (legacy 3 sprites)     DEPRECATE — replaced by assets-latest/
├── assets-latest/                 KEEP (10 Craftpix packs)
└── uploads/                       MOVE non-asset files → _archive_uploads/
```

---

## 5 · Open items (small, can decide during implementation)

1. **Cloud palette selection** — currently `Clouds_gray` is the default; preview at `docs/qa/ref-renders/canonical-preview-city1-night.png` shows them slightly over-contrasted at night. May want `Clouds_black` or 70% opacity. Decide at first Town implementation review.
2. **Walker render scale** — default 0.45× (≈58px on-screen). If feels too small at 924×540 viewport, bump to 0.50× (~64px).
3. **Animation FPS overrides** — defaults in § 3 are conservative; designer may want 12 fps for Walk if it looks too step-y.
4. **Day-cycle frame durations** — § 1.3 says ~10 s per frame, ~600 ms cross-fade. May want tuning after first cycle preview.
5. **NamedBirds positioning** — Chick (16×16) vs Rooster (32×32) — decide whether they share a y-band or split (e.g. Chick lower, Rooster on rooftops).
6. **Solo / Buddy / Character / Profile / Wallet** — design refresh for v6 needs to be requested separately. MVP excludes these.

---

## 6 · Verification of this index

When implementation lands a scene:

```bash
# Render the canonical preview from this doc
python3 -c "..."   # see /tmp/scripts in canonical-preview generation logs

# Diff implementation render vs canonical preview
python3 scripts/ref-audit/pixdiff.py
# expected: <15% diff for Town night scene
```

Also re-read `reference-internal-consistency.md` §§ Recommendations — every locked decision here should resolve one of the F-01..F-20 findings. Map:

| Finding | Resolved by |
|---|---|
| F-01 (-src.html broken) | § 4 cleanup → delete it |
| F-02 (bundle stuck on splash) | § 4 cleanup → archive |
| F-03 (no login HTML) | § 1.2 action item → create `FocusTown-login.html` |
| F-04 (bundle button labels mismatch) | § 4 cleanup → archive bundle |
| F-05 (bundle day stamp mismatch) | § 4 cleanup → archive bundle |
| F-06 (`FOCUS #5` duplicate) | § 0 source-of-truth → screenshot wins, JSX fixes the duplication |
| F-07 (T-coin chip on screenshot, not HTML) | § 0 source-of-truth → screenshot wins, JSX adds wallet stub |
| F-08 (login redesign) | § 1.2 lock v6-login as the only login canon |
| F-09 (v5 orphan) | § 0 v5 archive |
| F-10/F-11 (animals + LBT.TV chip) | § 1.1 layer 72 + 80 |
| F-12 (cloud-preview fonts) | tooling-only; document Playwright `document.fonts.ready` requirement |
| F-13 (--neon-glow names) | follow-up token rename, low priority |
| F-14 (pre-versioned singletons) | § 4 cleanup → `_archive_pre_v2/` |
| F-15 (HTML shares JSX) | § 0 source-of-truth |
| F-16 (bundle hardcoded "12 online") | § 4 cleanup → archive |
| F-17 | n/a (consistent) |
| F-18 (cross-version drift) | § 0 v5 archive + Era A archive |
| F-19 (multi-direction palette) | § 0 removed |
| F-20 (count was off) | reported, no action |
