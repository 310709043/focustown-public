# Page 6 — Impl-only routes audit (2026-05-16)

**No reference counterpart.** This audit scores impl-only routes against the established pixel-UI conventions that the reference-aligned pages set (`pixel-panel` / `pixel-btn` / `pixel-input` / `--accent*` tokens / `font-silkscreen` / `●` blink-dot headers). The rubric is "internal style consistency" — does each impl-only route read as part of the same product as the reference-aligned routes?

## Methodology

Each route gets scored on a 6-point rubric:

1. **Containers** use `pixel-panel` (not raw Tailwind divs with `bg-...` / `border-...`)
2. **Buttons** use `pixel-btn` / `pixel-btn primary` (not Tailwind-styled `<button>`)
3. **Inputs** use `pixel-input` (not generic `bg-... border-... rounded`)
4. **Colors** come from CSS vars (`var(--accent)` family, `var(--ink-mute)`, etc.) — not arbitrary hex or Tailwind palette names like `text-amber` / `text-coral` / `text-accent-2` Tailwind utilities
5. **Decorative glyphs** follow the `●` blink-dot pattern in section headers (vs `✦` / `#` / bare text)
6. **Fonts** use `font-silkscreen` for labels, `font-vt323` for body where appropriate (vs `font-pixel` / `font-japan` / no class)

Score per dimension: **✅** (compliant), **⚠️** (mixed — some compliance, some violations), **❌** (no compliance — vanilla Tailwind throughout).

## Summary

| Route | Impl entry | C1 panel | C2 btn | C3 input | C4 colors | C5 glyphs | C6 fonts | Verdict |
|---|---|---|---|---|---|---|---|---|
| `/` (splash) | `app/[locale]/page.tsx` (294 lines) | ✅ | ⚠️ | ✅ | ✅ | ✅ | ✅ | **Aligned** — same as `/signin`, missing primary CTA modifier (Page 1 D1) |
| `/awards` | `app/[locale]/awards/page.tsx` (93 lines) | ⚠️ | ❌ | n/a | ⚠️ | ❌ | ❌ | **Diverges** — 3 `pixel-panel` instances but everything else is Tailwind |
| `/shop` | `app/[locale]/shop/page.tsx` (401 lines) | ⚠️ | ❌ | n/a | ⚠️ | ❌ | ❌ | **Diverges** — 2 `pixel-panel` instances, otherwise Tailwind |
| `/legal/terms`, `/privacy`, `/refund` | `app/[locale]/legal/*/page.tsx` | ❌ | ❌ | n/a | ❌ | ❌ | ❌ | **Diverges** — pure server-rendered HTML, no pixel-UI primitives |
| `/forgot-password` | already covered under **Page 1 D11** | ❌ | ❌ | ❌ | ⚠️ | ❌ | ❌ | **Diverges** — see Page 1 audit |
| `/reset-password` | already covered under **Page 1 D11** | ❌ | ❌ | ❌ | ⚠️ | ❌ | ❌ | **Diverges** — see Page 1 audit |
| `/town/room/[id]` | `app/[locale]/town/room/[id]/page.tsx` (304 lines) + 10 components in `components/town/room/*` | ❌ | ❌ | ❌ | ⚠️ | ❌ | ❌ | **Diverges** — zero `pixel-*` primitives across page + 10 components |
| `/town/library` | `app/[locale]/town/library/page.tsx` (126 lines) + 2 components in `components/library/*` | ❌ | ❌ | ❌ | ⚠️ | ❌ | ❌ | **Diverges** — zero `pixel-*` primitives across page + 2 components |

**Overall finding:** the codebase has a clean **two-half split**:
- **Aligned half** (reference port): `/`, `/signin`, `/signup`, `/select-character`, `/town`, `/focus/[id]` (solo via Page 4)
- **Diverged half** (pre-port): `/awards`, `/shop`, `/legal/*`, `/forgot-password`, `/reset-password`, `/town/room/[id]`, `/town/library`

The diverged half was built before the reference port and was never retrofitted. As more routes get ported (Page 5 buddy), the divergence will grow more visible — users navigating from `/town` (aligned) to `/awards` (diverged) see a clear visual style break.

## Per-route findings

### R1 — `/` (locale-root splash) *(aligned — verdict ✅ with one carry-over)*

- **C1 Container**: ✅ wraps form in `pixel-panel` + `<LoginScene>` ambient frame.
- **C2 Buttons**: ⚠️ — `<SsoButtons>` uses `pixel-btn` ✓; submit button uses `pixel-btn` but **not `pixel-btn primary`** → exact same issue as **Page 1 D1**.
- **C3 Inputs**: ✅ uses `pixel-input`.
- **C4 Colors**: ✅ accent / ink-mute / panel-stroke / neon-glow tokens throughout.
- **C5 Glyphs**: ✅ `<BlinkDot color="var(--accent-3)">` + `signInTitle.toUpperCase()` header. Submit prefix `✦`.
- **C6 Fonts**: ✅ `font-silkscreen` everywhere.
- **Suggested fix:** same one-line fix as Page 1 D1 (apply `pixel-btn primary` to submit button). Otherwise faithful.

### R2 — `/awards` *(diverges — verdict ⚠️)*

- **Reference equivalent:** `screen-town.jsx`'s `AchievementsModal` (in-page overlay, not a full route).
- **C1 Container**: ⚠️ — 3 `pixel-panel` instances for the sections, but the outer chrome (header + close button) uses raw Tailwind (`bg-[rgba(3,1,17,.96)] border-b border-border h-[46px]`).
- **C2 Buttons**: ❌ close button is `border border-border text-muted font-japan text-[10px] px-3 py-1.5 ... rounded hover:border-coral hover:text-coral` — Tailwind chrome with rounded corners, no `pixel-btn` shadow/glow.
- **C4 Colors**: ⚠️ mixes `var(--amber)` / `var(--coral)` (defined CSS vars) with raw Tailwind classes (`text-muted`, `border-border`). The CSS vars are correct; the Tailwind classes resolve through `tailwind.config.ts` aliases but the styling pattern is inconsistent.
- **C5 Glyphs**: ❌ uses `font-pixel text-[9px] tracking-widest` headers with no blink-dot. Reference uses `● HEADING` pattern.
- **C6 Fonts**: ❌ `font-pixel` and `font-japan` instead of `font-silkscreen` + `font-noto-sans-tc`.
- **Suggested fix:** convert header + close button to a `pixel-btn`; replace `font-pixel text-[9px]` headers with the established `<BlinkDot> + uppercase silkscreen 10` pattern; use `var(--ink-mute)` and `var(--accent)` instead of `text-muted` / `text-amber` literals.

### R3 — `/shop` *(diverges — verdict ⚠️)*

- **Reference equivalent:** `screen-town.jsx`'s `ShopModal` (in-page overlay).
- **C1 Container**: ⚠️ — 2 `pixel-panel` instances; outer chrome uses Tailwind.
- **C2 Buttons**: ❌ purchase / equip buttons are Tailwind-styled (`border-[...] rounded text-[...] hover:...` patterns).
- **C5 Glyphs / C6 Fonts**: ❌ same as `/awards`.
- **Suggested fix:** the shop page is the biggest route here (401 lines). Convert the section headers + item cards + purchase buttons to pixel-UI primitives. This is a multi-hour refactor.

### R4 — `/legal/{terms, privacy, refund}` *(diverges — verdict ❌)*

- **C1–C6 all ❌**: legal pages are server-rendered, use `<LegalLayout>` + `<LegalDocHeader>` + `<LegalSection>` (in `components/legal/`), which contain only Tailwind utility classes (`max-w-[...]`, `prose`, etc.). Zero pixel-UI primitives across `components/legal/*.tsx` (verified by grep: 0 instances of `pixel-panel`/`pixel-btn`/`pixel-input` in the 4 files).
- **Reference equivalent:** none — legal pages are a production necessity, not a reference design.
- **Suggested fix:** **needs product call.** Legal pages reasonably get a more readable book-like treatment vs the gamified pixel-UI. Two options:
  - **A. Keep Tailwind chrome but adopt accent tokens** — replace literal Tailwind color classes (`text-gray-...`, etc.) with `var(--ink)` / `var(--ink-mute)` so dark-mode and theme switches work uniformly.
  - **B. Wrap the legal article in a `<pixel-panel>` shell** so the navigation/TOC reads as a gamified frame around the readable prose body.
- Lowest-priority finding in this audit — users spend seconds, not minutes, on legal pages.

### R5 — `/forgot-password` *(diverges — covered by Page 1 D11)*

- Cross-reference: see **Page 1 D11** (already documented). No new findings here.
- **Suggested fix:** lift the `<LoginScene>` ambient frame as-is but swap the inner form to `pixel-input` + `pixel-btn` per the existing Page 1 audit.

### R6 — `/reset-password` *(diverges — covered by Page 1 D11)*

- Cross-reference: same as R5. Already documented under Page 1 audit.

### R7 — `/town/room/[id]` *(diverges — verdict ❌, no pixel-UI primitives anywhere)*

- **Reference equivalent:** none — the reference design has the town in `screen-town.jsx` but no individual room visitor screen.
- **C1–C6 all ❌**: zero `pixel-*` primitives across the page + all 10 sub-components in `components/town/room/{Wall, OutsideWindow, OwnerPlaque, Floor, LockedRoom, MissingRoom, DecorationCanvas, VisitorPanel, DecorationToolbar, DecorationItem}.tsx`. The page uses domain-specific atoms (Wall, Floor, etc.) but renders them with raw Tailwind classes.
- **Suggested fix:** the room is an 8-bit indoor scene (its own deliberate aesthetic per the file's docstring at L4–L14). The internal atoms (`Wall`, `Floor`) are fine as bespoke art. But chrome elements (`VisitorPanel`, `DecorationToolbar`, `LockedRoom`, `MissingRoom`) should adopt `pixel-panel` + `pixel-btn` to read as part of the same product. **Medium-effort refactor — 4-6 components touched.**

### R8 — `/town/library` *(diverges — verdict ❌)*

- **Reference equivalent:** none — though the reference's `MusicPlayer` panel (in `screen-town.jsx`) and the unaudited `screen-buddy.jsx`'s `RoomMusic` panel cover music UI; this full-route library does not exist in reference.
- **C1–C6 all ❌**: zero `pixel-*` primitives across the page + `components/library/{MoodTabs, TrackList}.tsx`.
- **Suggested fix:** convert track-row chrome to `pixel-panel`, mood tabs to the reference's pixel `TabButton` pattern (see Page 2 D5 closing notes / Page 3 SkyWindow `TabPill`). **Small-effort refactor — 2 components touched.**

## Closing checklist — divergence prioritization

| Route | Severity (style-debt impact) | Effort | Open follow-up PR? |
| --- | --- | --- | --- |
| R1 `/` splash primary CTA | low | 1-line fix | ✅ fixed in Phase A (bundled with Page 1 D1) |
| R2 `/awards` chrome | medium | 1 day | pending — Phase F |
| R3 `/shop` chrome | medium | 1.5 days | pending — Phase F |
| R4 `/legal/*` | low | needs decision | **needs product call** — pixel-UI or book-style? |
| R5 `/forgot-password` | medium (Page 1 D11) | 2 hours | ✅ fixed in Phase A (bundled with Page 1 D11) |
| R6 `/reset-password` | medium (Page 1 D11) | 2 hours | ✅ fixed in Phase A (bundled with Page 1 D11) |
| R7 `/town/room/[id]` chrome | medium | 1 day | pending — Phase F |
| R8 `/town/library` | medium | 4 hours | pending — Phase F |

**Total cleanup effort** (excluding legal-pages product call): ~4-5 days across all impl-only routes.

**Recommendation:** open per-route follow-up PRs in **traffic-order** — `/awards` and `/shop` first (linked from TopHUD nav, seen on every town visit), then `/town/room/[id]` (linked from `MY ROOM` button), then `/town/library`. The Page 1 D11 fix already bundles `/forgot-password` and `/reset-password`. The `/` splash + R1 fix lands inside the Page 1 follow-up PR.

This audit treats the impl-only routes as **style debt**, not bugs — they all work functionally; they just don't visually feel like part of the same product as the reference-aligned routes. The choice to fix is product-priority-driven, not correctness-driven.
