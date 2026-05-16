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

### R2 — `/awards` *(✅ resolved in Phase F1 — `fix/sync-page-6-awards`)*

- **Reference equivalent:** `screen-town.jsx`'s `AchievementsModal` (in-page overlay, not a full route).
- **C1 Container**: ✅ — outer chrome now uses an `<AwardsTopBar>` shell with `pixel-panel` sections inside. No raw Tailwind chrome.
- **C2 Buttons**: ✅ close button is `pixel-btn` with the standard inset shadow + neon glow.
- **C4 Colors**: ✅ all colors come from CSS vars (`var(--amber)`, `var(--teal)`, `var(--ink-mute)`, `var(--panel-stroke)`). No Tailwind alias classes.
- **C5 Glyphs**: ✅ section headers use `<BlinkDot> + uppercase silkscreen` pattern; ✦ / 🏆 / 🎖️ prefixes dropped from i18n strings.
- **C6 Fonts**: ✅ `font-silkscreen` throughout (sections + top bar). Tailwind picks up `font-noto-sans-tc` for CJK from the global stack.
- **Deferred (out of audit scope):** reference's pair-wall + week-stars sections (require new backend endpoints `/api/v1/pair-wall`, `/api/v1/week-stars`). Current scope retains the existing 2 sections (leaderboard + achievements).
- **Side effect:** `<BlinkDot>` extracted to `components/pixel/BlinkDot.tsx`; 5 prior inline duplicates (`LoginScene`, splash, signin, signup, `SkyWindow`) converted to import the shared primitive.

### R3 — `/shop` *(✅ resolved in Phase F2 — `fix/sync-page-6-shop`)*

- **Reference equivalent:** `screen-town.jsx`'s `ShopModal` (in-page overlay).
- **C1 Container**: ✅ — outer chrome is now `<ShopScene>` (full-bleed `<main>` + diagonal gradient) wrapping `<ShopTopBar>` + a chromeless `<ShopView>` body. Every panel uses `pixel-panel`.
- **C2 Buttons**: ✅ purchase + equip CTAs use `pixel-btn primary` for the positive action (buy / equip) and default `pixel-btn` for the cancel action (unequip); close button is `pixel-btn`.
- **C4 Colors**: ✅ all colors come from CSS vars (`var(--pink)`, `var(--accent-2)`, `var(--amber)`, `var(--teal)`, `var(--accent)`, `var(--ink-mute)`, `var(--coral)`). No Tailwind palette literals.
- **C5 Glyphs**: ✅ top bar + every section header uses the `<BlinkDot> + uppercase silkscreen` pattern; the `🛒` / `★` / `✦` glyph prefixes survive only inside the i18n strings (`shop.page.title`, `shop.page.subscriptionTitle`, `shop.page.subscriptionBadge`) where they read as content rather than chrome.
- **C6 Fonts**: ✅ `font-silkscreen` for labels; VT323 for numeric (prices + balance) via inline `font-family: var(--font-vt323), monospace`. All `font-pixel` / `font-japan` removed from `/shop`.
- **Split:** `<ShopScene>` (route-only chrome) + `<ShopView>` (chromeless body, reused by `<ShopModal>`). Section pieces under `components/shop/`: `WalletBadge`, `ShopTopBar`, `SubscriptionPanel`, `CategorySection`, `ShopItemCard`. Page reduced from 56 LOC of inline chrome to a 4-LOC shell.
- **Side note:** `<ShopModal>`'s in-modal coin badge is left untouched (separate audit row under Page 3 modals); it can be swapped for the new `<WalletBadge>` in a follow-up.

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

### R7 — `/town/room/[id]` *(✅ fixed in Phase F3)*

- **Reference equivalent:** none — the reference design has the town in `screen-town.jsx` but no individual room visitor screen.
- **Original verdict:** C1–C6 all ❌ — zero `pixel-*` primitives across the page + all 10 sub-components in `components/town/room/{Wall, OutsideWindow, OwnerPlaque, Floor, LockedRoom, MissingRoom, DecorationCanvas, VisitorPanel, DecorationToolbar, DecorationItem}.tsx`. The page used domain-specific atoms (Wall, Floor, etc.) but rendered them with raw Tailwind classes.
- **Fix shipped (Phase F3):** chrome surfaces converted to pixel-UI while keeping the interior 8-bit composition (`Wall`, `Floor`, `OutsideWindow`, `OwnerPlaque`, `DecorationCanvas`, `DecorationItem`) untouched as deliberate aesthetic. Five files changed: `page.tsx` (top nav strip + theme picker + loading state), `VisitorPanel.tsx` (top-left strip → `pixel-panel`), `DecorationToolbar.tsx` (bottom-left → `pixel-panel` + `pixel-btn` tiles), `LockedRoom.tsx` and `MissingRoom.tsx` (full-screen 403/404 → `pixel-panel` + `pixel-btn` back button). Mirrors R8's canonical pattern (BlinkDot + silkscreen headers, accent-coded badges, `var(--ink-*)` palette).

### R8 — `/town/library` *(diverges — verdict ❌)*

- **Reference equivalent:** none — though the reference's `MusicPlayer` panel (in `screen-town.jsx`) and the unaudited `screen-buddy.jsx`'s `RoomMusic` panel cover music UI; this full-route library does not exist in reference.
- **C1–C6 all ❌**: zero `pixel-*` primitives across the page + `components/library/{MoodTabs, TrackList}.tsx`.
- **Suggested fix:** convert track-row chrome to `pixel-panel`, mood tabs to the reference's pixel `TabButton` pattern (see Page 2 D5 closing notes / Page 3 SkyWindow `TabPill`). **Small-effort refactor — 2 components touched.**

## Closing checklist — divergence prioritization

| Route | Severity (style-debt impact) | Effort | Open follow-up PR? |
| --- | --- | --- | --- |
| R1 `/` splash primary CTA | low | 1-line fix | ✅ fixed in Phase A (bundled with Page 1 D1) |
| R2 `/awards` chrome | medium | 1 day | ✅ shipped in Phase F1 (`fix/sync-page-6-awards`) — chrome converted to `pixel-panel` + `pixel-btn` + `<BlinkDot>` + `font-silkscreen`; pair-wall + week-stars sections deferred (need backend endpoints) |
| R3 `/shop` chrome | medium | 1.5 days | ✅ shipped in Phase F2 (`fix/sync-page-6-shop`) — chrome converted to `pixel-panel` + `pixel-btn` + `<BlinkDot>` + `font-silkscreen`; `<ShopScene>` wraps a chromeless `<ShopView>` so `<ShopModal>` still reuses the same body |
| R4 `/legal/*` | low | needs decision | **needs product call** — pixel-UI or book-style? |
| R5 `/forgot-password` | medium (Page 1 D11) | 2 hours | ✅ fixed in Phase A (bundled with Page 1 D11) |
| R6 `/reset-password` | medium (Page 1 D11) | 2 hours | ✅ fixed in Phase A (bundled with Page 1 D11) |
| R7 `/town/room/[id]` chrome | medium | 1 day | ✅ fixed in Phase F3 — chrome (`VisitorPanel` / `DecorationToolbar` / `LockedRoom` / `MissingRoom` / room `page.tsx` nav + theme picker) on `pixel-panel` + `pixel-btn` + `<BlinkDot>` + `font-silkscreen`; interior 8-bit art (Wall / Floor / OwnerPlaque / OutsideWindow / DecorationCanvas / DecorationItem) preserved as deliberate aesthetic |
| R8 `/town/library` | medium | 4 hours | ✅ fixed in Phase F4 — page header in `pixel-panel`, MoodTabs use accent-fill pixel tabs, TrackList rows are `pixel-panel` with `pixel-btn` play + `pixel-btn primary` for in-room tracks |

**Total cleanup effort** (excluding legal-pages product call): ~4-5 days across all impl-only routes.

**Recommendation:** open per-route follow-up PRs in **traffic-order** — `/awards` and `/shop` first (linked from TopHUD nav, seen on every town visit), then `/town/room/[id]` (linked from `MY ROOM` button), then `/town/library`. The Page 1 D11 fix already bundles `/forgot-password` and `/reset-password`. The `/` splash + R1 fix lands inside the Page 1 follow-up PR.

This audit treats the impl-only routes as **style debt**, not bugs — they all work functionally; they just don't visually feel like part of the same product as the reference-aligned routes. The choice to fix is product-priority-driven, not correctness-driven.
