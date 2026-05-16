# Page 2 — `/select-character` audit (2026-05-16)

**Re-verified 2026-05-16:** `git diff origin/main` shows zero changes to Page 2 source files since the original audit ran. All 5 findings below still stand verbatim.

Reference: `focustwon/reference/screen-character.jsx` (392 lines)
Impl entry: `frontend/app/[locale]/select-character/page.tsx` (299 lines)
Composing components: `frontend/components/select-character/{SelectCharacterScene, PreviewCard, NicknameField, AgeSlider, RegionSelect, DailyGoalRadio, TabBar, RoleGrid, AvatarCell, InterestChips, SkillChips, SectionLabel, Chip, ToggleChip, SummaryFooter}.tsx`

Branch base: `origin/main` (these files are untouched on the audit branch — verified by `git diff origin/main`)

## Summary

- **5 discrepancies total**: 2 high, 1 medium, 2 low.
- This is the **most faithful port** of the four audited pages. The 1:1 modularization (each reference function got its own component file) preserves the reference's structural design with very little drift.
- Both "high" findings are facets of the same root cause: the codebase has no `.pixel-btn.primary` CSS modifier, so any reference button that uses `pixel-btn primary` was either silently downgraded to plain `pixel-btn` (SummaryFooter CTA) or worked around with an inline opacity-and-glow hack (DailyGoalRadio active state).

## Discrepancies

### D1 — `enterTownBtn` confirm CTA missing `.pixel-btn.primary` modifier *(high)*

- **Reference** (`screen-character.jsx:L217-L223`): bottom CTA is `<button className="pixel-btn primary" disabled={!name} …>{t('enterTownBtn')}</button>` — `primary` paints it accent-2 pink so it pops above the muted summary line on its left.
- **Impl** (`components/select-character/SummaryFooter.tsx:L60-L74`): plain `className="pixel-btn"` only. Disabled state uses `opacity: 0.5`. No accent-2 emphasis.
- **Diff:** primary CTA is the same neon-purple as the section labels / form controls — no visual hierarchy distinguishing "the action".
- **Suggested fix:** add the shared `.pixel-btn.primary` modifier in `globals.css` (`border-color: var(--accent-2); color: var(--accent-2); text-shadow: 0 0 8px var(--accent-2);`) and apply it. This single fix also lifts Page 1 D1 and Page 4 D11.

### D2 — `DailyGoalRadio` uses opacity + inline glow instead of `pixel-btn primary` toggle *(high)*

- **Reference** (`screen-character.jsx:L141-L149`): each `2 / 4 / 6 / 8` button renders as `className={`pixel-btn ${goal === n ? 'primary' : ''}`}`. So the selected button gets the pink-accent `primary` look; the other three stay normal-weight panel-purple `pixel-btn`s.
- **Impl** (`components/select-character/DailyGoalRadio.tsx:L22-L42`): every button is plain `pixel-btn`; non-selected ones are dimmed to `opacity: 0.55`; the selected one gets an inline brighter `box-shadow: …, 0 0 24px rgba(167,139,250,0.6)`.
- **Diff:** the unselected goals look semi-transparent / disabled instead of just "not yet picked"; the selected goal gets a bigger glow but stays purple (reference flips it to pink). Visual rhythm is meaningfully different — at a glance, the impl reads as "one option is highlighted and three are muted" rather than "one is the active choice".
- **Suggested fix:** once `.pixel-btn.primary` exists (D1), drop the opacity dimming and the inline boxShadow override; toggle the `primary` class on the selected button only — `className={`pixel-btn ${value === n ? 'primary' : ''}`}`.

### D3 — `SelectCharacterScene` back button is a hard-coded `Link` to `/signup` *(medium)*

- **Reference** (`screen-character.jsx:L85`): back is `<button onClick={onBack} className="pixel-btn">…</button>` — caller controls where it goes.
- **Impl** (`components/select-character/SelectCharacterScene.tsx:L58-L68`): back is `<Link href="/signup" className="pixel-btn">…</Link>`. Always routes to `/signup` regardless of how the user reached `/select-character`.
- **Diff:** visually identical (same chrome). But a user who lands on `/select-character` from `/town` (e.g. "edit my character" deeplink in v2) will be teleported to `/signup` — surprising and probably wrong. Documenting under audit because it's a small structural deviation from the reference's design intent even though pixels match.
- **Suggested fix:** lift back-routing into a prop: `backHref?: string` (default `/signup`) or `onBack?: () => void`. Page 2 keeps `/signup` for the linear signup flow; other consumers can pass a different target.

### D4 — Toast banner UI is impl-only (not in reference) *(low)*

- **Reference:** no toast pattern in `screen-character.jsx`. The confirm button is simply `disabled={!name}` — feedback for "name is empty" is conveyed by the disabled state alone.
- **Impl** (`app/[locale]/select-character/page.tsx:L26-L34, L276-L296`): adds a `useTransientToast` hook + a fixed-position `role="status"` banner that flashes "請先選一個角色" / "Please pick a character first." for 2.5 s when the confirm button is clicked while nickname is blank.
- **Diff:** an extra UI element appears on a specific user action — but in the reference's design the button is just disabled, so the user can't trigger that action at all. Impl button is also disabled, so the toast triggers only via keyboard activation or programmatic click. Visible artifact when it does fire.
- **Suggested fix:** keep — it's a useful affordance for keyboard users — but if matching reference precisely is the goal, the entire toast path can be removed safely without changing the happy path. The disabled button already prevents submission for mouse users.

### D5 — `previewIdBlank` translates differently per locale *(low)*

- **Reference** (`screen-character.jsx:L116`): `name || (lang === 'zh' ? '???' : '?????')` — inline conditional, three Q-marks for zh, five for en.
- **Impl** (`messages/{en,zh-TW}/characters.json:characters.selectPage.previewIdBlank`): zh-TW = `???`, en = `?????`. Same outcome; refactored into a locale-aware i18n key.
- **Diff:** none visible to the user, just a structural refactor away from the inline conditional toward the i18n catalog. Documenting for completeness.

## Matches (no discrepancy)

- Background gradient: `radial-gradient(ellipse at 50% 20%, var(--sky-mid) 0%, var(--sky-top) 60%, var(--bg-0) 100%)` — verbatim.
- `<StarField density={0.0008} />` ambient stars ✓.
- Top bar: padding `12px 24px`, `borderBottom: 1px solid var(--panel-stroke)`, `background: rgba(7,4,26,0.7)`, `zIndex: 5` ✓.
- Step counter format `STEP 02 / 03` with `font-silkscreen`, fontSize 11, ink-mute, letter-spacing 0.2em ✓.
- ProgressDot trio (done / active / pending) with `var(--accent)` border + neon-glow on active ✓.
- Top-bar Logo at scale 0.7 → 28 px (matches reference's `<LogoImage size={28} />`).
- Top-bar `<PixelWord text="FOCUSTOWN" scale={2} color="var(--accent)" glow="var(--accent)" />` ✓.
- Two-column grid: `gridTemplateColumns: '380px 1fr'`, `gap: 18`, `padding: 18`, `height: calc(100% - 50px)` ✓.
- PreviewCard: `pixel-panel`, `padding: 14`, `gap: 14`, items `flex` aligned center, `92×92` avatar slot with `border: 2px solid var(--accent)` + `var(--neon-glow)`, sprite at scale 5, CITIZEN ID label silkscreen 9 ink-mute 0.2em, name silkscreen 20 ink with neon-glow textShadow, role-name silkscreen 11 accent-3, three caption Chips (LV.1 / age / NEW@accent-3) ✓.
- PreviewCard inline `CornerDeco` (4 L-bracket spans, 12 × 12 px, 2 px stroke at corners) — matches reference's shared `<CornerDeco />`.
- Form panel: `pixel-panel`, padding 14, gap 10 ✓.
- `SectionLabel`: 6 × 6 accent square + neon-glow + accent-colored silkscreen 11 0.2em label — verbatim.
- NicknameField: `pixel-input` styled, `maxLength={20}` ✓.
- Age label inline hint: `· {ageLockedHint}` in accent-2, silkscreen 9, 0.1em — verbatim.
- AgeSlider: silkscreen 20 accent-colored age readout with neon-glow textShadow, `−` / `+` `pixel-btn` (padding `2px 8px`, fontSize 11), native range with `accent-color: var(--accent)`, min/max captions silkscreen 8 ink-dim ✓.
- RegionSelect: 14-entry list, flag emoji + localized name, dropdown panel with `background: rgba(7,4,26,0.97)` + accent border, hover row tint `rgba(167,139,250,0.08)`, selected row tint `rgba(183,148,246,0.15)` + accent color ✓.
- Region default seed `TW-TPE` ✓.
- `regionSub` caption beneath dropdown — silkscreen 9 ink-dim ✓.
- DailyGoalRadio sub-caption: `{value} × 25 min = {value * 25} min/{dailyGoal}` ✓.
- TabBar: 4 tabs (role / interests+badge / skills+badge / ALL), active state `background: var(--accent)` + `color: #0a0524` (inverted), tab font silkscreen 11 0.12em ✓.
- Tabs `Badge`: inline span `background: rgba(0,0,0,0.3)`, padding `0 4px`, fontSize 9, inherit color, 1 px border ✓.
- Right-column subtitle `t('roleSub')` rendered in silkscreen 10 ink-mute 0.15em on tab row's right ✓.
- Sectioned scroll area: `flex: 1, overflowY: 'auto', overflowX: 'hidden', gap: 14, paddingRight: 6` ✓.
- RoleGrid: `repeat(auto-fill, minmax(108px, 1fr))`, `gap: 8` ✓.
- AvatarCell: selected = `rgba(183,148,246,0.15)` bg + `2px solid var(--accent)` border + `var(--neon-glow)`; inactive = `rgba(0,0,0,0.35)` bg + panel-stroke border; sprite scale 2.5; role-name caption silkscreen 9 (accent when selected, ink-mute when not); 16 × 16 ✓ overlay in upper-right when selected with `background: var(--accent), color: #0a0524, fontSize: 10` ✓.
- InterestChips: 18 chips, emoji prefix + localized label, ToggleChip with `var(--accent)` active fill ✓.
- SkillChips: 16 chips, ToggleChip with `var(--accent-3)` (cyan) active fill ✓.
- ToggleChip: `padding: 6px 10px`, active = solid color fill + dark ink + `0 0 8px {color}66` glow; inactive = `rgba(0,0,0,0.3)` bg + ink-mute + panel-stroke; font-silkscreen 11 0.05em letter-spacing; `transition: all 0.12s steps(2)` ✓.
- SummaryFooter: `padding: 10px 0`, `borderTop: 1px solid var(--panel-stroke)`, left chip line uses accent (role) / accent-2 (interests count) / accent-3 (skills count) coloring per reference ✓.

## Closing checklist — open follow-up fixes?

| Discrepancy | Severity | Open follow-up PR? |
| --- | --- | --- |
| D1 SummaryFooter primary CTA | high | ✅ fixed in Phase B — `confirm-cta` uses `pixel-btn primary` (modifier shipped in PR #41) |
| D2 DailyGoalRadio active toggle | high | ✅ fixed in Phase B — selected button uses `pixel-btn primary`; dropped opacity 0.55 hack and inline boxShadow override |
| D3 Back button hardcoded to `/signup` | medium | ✅ fixed in Phase B — `SelectCharacterScene` accepts `backHref?: string` (default `/signup`). OCP additive. |
| D4 Toast banner extra | low | deferred — doc only, improves keyboard UX |
| D5 `previewIdBlank` i18n move | low | deferred — refactor, not a visual change |

**Status:** all 3 actionable items (D1, D2, D3) shipped in Phase B. D4 and D5 deferred — neither is a user-visible regression.
