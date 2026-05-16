# Page 1 — login family audit (2026-05-16)

**Re-verified 2026-05-16:** `git diff origin/main` shows zero changes to Page 1 source files since the original audit ran. All 12 findings below still stand verbatim.

Reference: `focustwon/reference/screen-login.jsx` (459 lines, covers `signin` + `signup` only)
Impl entries:
- `frontend/app/[locale]/signin/page.tsx` (279 lines)
- `frontend/app/[locale]/signup/page.tsx` (354 lines)
- `frontend/app/[locale]/forgot-password/page.tsx` (140 lines) — **no reference counterpart**
- `frontend/app/[locale]/reset-password/page.tsx` (~190 lines) — **no reference counterpart**
- `frontend/components/login/{LoginScene,Tagline,LoginCitizens,FloatingPixels,SkylineLayers,AvatarFloatStrip,SsoButtons,CornerDeco,NumberRoll}.tsx`

Branch base: `origin/main` (these files are untouched on the audit branch — verified by `git diff origin/main`)

## Summary

- **12 discrepancies total**: 6 high, 3 medium, 3 low.
- The `LoginScene` ambient stack (sky, stars, moon, three-canvas skyline, ground, walkers + cat, drifting coffee/notes, top-bar marker) ports the reference 1:1 — these account for ~60% of the visual surface and all match.
- The form panels (signin / signup) drift on a few specific affordances (no `.pixel-btn.primary` modifier, wrong CTA label on signin, signup adds two extra fields + an extra SSO row not in reference).
- The two impl-only routes (`forgot-password`, `reset-password`) abandon the established pixel aesthetic and render with plain Tailwind tokens, breaking visual consistency with the rest of the Page 1 family even though the reference has no template for them.

## Discrepancies

### D1 — Submit button missing `.pixel-btn.primary` accent variant *(high)*

- **Reference** (`screen-login.jsx:L334, L391`): both signin and signup primary CTAs render as `<button className="pixel-btn primary" …>`. The `primary` modifier (defined in `ui-shared.jsx`) overrides the panel-purple stroke with `accent-2` pink, giving the button visible visual hierarchy over the SSO buttons above it.
- **Impl signin** (`app/[locale]/signin/page.tsx:L149-L165`) and **signup** (`app/[locale]/signup/page.tsx:L219-L235`): both use plain `pixel-btn` with no modifier and no inline accent-2 override.
- **Diff:** primary CTA looks identical to the SSO buttons — no visual hierarchy distinguishing "the action" from "the alternates".
- **Suggested fix:** add a `.pixel-btn.primary` CSS modifier in `globals.css` (`border-color: var(--accent-2); color: var(--accent-2); text-shadow: 0 0 8px var(--accent-2);`) and apply it to both submit buttons. Same fix lands D11 in Page 4's audit.

### D2 — Signin CTA label says `signInTitle` instead of `enterTown` *(high)*

- **Reference** (`screen-login.jsx:L334-L336`): submit button reads `✦ {t('enterTown')}` — i.e. "進入小鎮" / "Enter Town".
- **Impl** (`app/[locale]/signin/page.tsx:L163-L164`): `<span>✦</span><span>{loading ? t("loadingCta") : tSplash("signInTitle")}</span>` → "登入" / "Sign in".
- **Diff:** the button title duplicates the panel header text instead of inviting the user into the town. Loses the on-brand "Enter Town" framing.
- **Suggested fix:** swap `tSplash("signInTitle")` → `tSplash("enterTown")` (key already exists in i18n).

### D3 — Signup form adds `displayName` field not in reference *(high)*

- **Reference SignUpForm** (`screen-login.jsx:L345-L403`): fields = email + password + confirmPw + TOS checkbox. No display-name field at all. The form has 4 inputs.
- **Impl SignUpPage** (`app/[locale]/signup/page.tsx:L100-L126`): adds a dedicated `displayName` input labelled `t("displayNameLabel").toUpperCase()` ("顯示名稱" / "DISPLAY NAME") as the FIRST field above email. The form has 5 inputs.
- **Diff:** extra leading row pushes the panel ~80 px taller than reference. Reference relies on the social account name or post-signup edit.
- **Suggested fix:** either remove the display-name field (collect it on `/select-character` instead) or document that this is an intentional impl-only addition and update the audit baseline. Need product call.

### D4 — Signup form adds `marketingOptIn` second checkbox not in reference *(high)*

- **Reference** (`screen-login.jsx:L386-L389`): single `PixelCheckbox` for `agreeToTos`.
- **Impl** (`app/[locale]/signup/page.tsx:L190-L207`): a SECOND `PixelCheckbox` below the TOS one for `marketingOptIn` ("接收行銷郵件" / "Receive marketing emails").
- **Diff:** two stacked checkboxes vs one — adds vertical weight to the form footer, may also feel pushy on first signup.
- **Suggested fix:** move the marketing opt-in to a post-signup settings page, OR collapse it into the TOS line as a secondary toggle, OR confirm with product this is an intentional compliance-driven addition.

### D5 — Signup renders all 3 SSO buttons; reference shows only Google *(high)*

- **Reference SignUpForm** (`screen-login.jsx:L360-L367`): renders ONLY the Google button before the email divider. (The GitHub + Apple pair is signin-only.)
- **Impl SignUpPage** (`app/[locale]/signup/page.tsx:L95`): calls `<SsoButtons disabled={loading} />` which always renders all 3 (Google + GitHub + Apple).
- **Diff:** signup panel has 3 SSO buttons in two rows instead of just 1 — adds another 50 px and dilutes the "sign up with email" path.
- **Suggested fix:** parameterize `<SsoButtons>` with a `compact` or `googleOnly` prop and pass `googleOnly` from `SignUpPage`.

### D6 — Signup confirm-password label is `PASSWORD ✓` instead of `CONFIRM PASSWORD` *(medium)*

- **Reference** (`screen-login.jsx:L381`): second password column label is `t('confirmPw').toUpperCase()` ("確認密碼" / "CONFIRM PASSWORD").
- **Impl** (`app/[locale]/signup/page.tsx:L141`): renders `<Label>{t("passwordLabel").toUpperCase()} ✓</Label>` → "PASSWORD ✓" with a literal ✓ glyph instead of a dedicated label key.
- **Diff:** reuses the same i18n key as the left column and visually appends ✓, losing the "confirm" semantic in both en + zh.
- **Suggested fix:** add `auth.signup.confirmPasswordLabel` keys and use them.

### D7 — `LoginScene` lost the `direction === 'rain'` RainOverlay branch *(medium)*

- **Reference** (`screen-login.jsx:L49`): when `direction === 'rain'`, `<RainOverlay width={size.w} height={size.h} color="var(--accent)" />` overlays the entire login scene.
- **Impl** (`components/login/LoginScene.tsx`): no `direction` prop, no RainOverlay branch. The component is hardcoded to the "neon" direction.
- **Diff:** "rain" theme variant unreachable through the login surface even though `SkylineLayers` and the global direction-sync infra still understand it.
- **Suggested fix:** add a `direction?: 'neon' | 'dusk' | 'rain'` prop on `LoginScene`, forward it to `SkylineLayers`, and gate `<RainOverlay color="var(--accent)" />` on `direction === 'rain'`. Pass from `useDirection()` hook or `DirectionSync`.

### D8 — `SkylineLayers` direction is hardcoded `neon` even though `direction` prop exists *(medium)*

- **Reference** (`screen-login.jsx:L25-L35`): `palettes[direction] || palettes.neon` — palette dynamically swaps based on the current direction.
- **Impl** (`components/login/SkylineLayers.tsx:L11-L27` + `components/login/LoginScene.tsx:L96-L97`): `SkylineLayers` accepts a `direction` prop but `LoginScene` never passes one, defaulting to `neon`. So dusk and rain palettes ship dormant.
- **Diff:** parallax skyline cannot color-shift with the theme.
- **Suggested fix:** lift from the same fix as D7 — pipe `direction` through `LoginScene` → `SkylineLayers`.

### D9 — Citizens marker i18n key renamed (`t('citizens')` → `t('citizensLabel')`) *(low)*

- **Reference** (`screen-login.jsx:L76`): `<span>{t('citizens')} <NumberRoll target={2847} /></span>`.
- **Impl** (`components/login/LoginScene.tsx:L141`): `<span>{t("citizensLabel")} <NumberRoll target={citizenCount} /></span>` (key renamed).
- **Diff:** the visible text matches per-locale, only the key name changed. Documenting for completeness.

### D10 — Signup TOS sentence wraps two `<Link>` legal targets through label copy *(low)*

- **Reference** (`screen-login.jsx:L386-L389`): a single label whose text is just `t('agreeToTos')`. No inline links — reference assumes legal pages live elsewhere.
- **Impl** (`app/[locale]/signup/page.tsx:L151-L187`): label combines four i18n fragments (`termsAgreement`, `termsLink`, `termsConnector`, `privacyLink`) and renders inline `<Link href="/legal/terms">` + `<Link href="/legal/privacy">` chips.
- **Diff:** richer affordance (terms + privacy clickable inline) but introduces multi-line wrapping in zh-TW where the reference is a clean single line.
- **Suggested fix:** keep the inline links (compliance value > visual tidiness), but tighten `lineHeight: 1.4` and apply `<wbr/>` between the connector to control wrap points.

### D11 — `/forgot-password` and `/reset-password` use Tailwind tokens instead of pixel-input / pixel-btn *(high — impl-only routes, but break visual cohesion)*

- **Reference:** none — neither route exists in the reference UI.
- **Impl `/forgot-password`** (`app/[locale]/forgot-password/page.tsx:L100-L125`): email field uses `className="bg-[rgba(12,5,35,.9)] border border-border rounded px-3 py-2 …"` — plain Tailwind. Submit button uses `className="font-pixel border-2 border-accent-1 text-accent-1 py-2.5 rounded hover:border-accent-2 …"` — Tailwind rather than `pixel-input` / `pixel-btn`.
- **Impl `/reset-password`**: same pattern — Tailwind classes, `text-text`, `text-accent-2 hover:text-accent-1`, no `pixel-panel` form wrapper on the no-token state.
- **Diff:** these pages still sit inside `LoginScene` (so the ambient stack matches), but the form chrome reads as "vanilla Tailwind" against the pixel-UI everywhere else in Page 1. Inputs are rounded instead of square, buttons have hover transitions that feel wrong next to the chunky neon `pixel-btn`.
- **Suggested fix:** swap the email input to `className="pixel-input"`, the submit button to `pixel-btn` with the same `padding/fontSize/gap` as signin/signup, wrap the no-token state in `pixel-panel`. Same for reset-password's new-password + confirm fields. This single refactor lifts both pages back into the established Page 1 aesthetic.

### D12 — Both impl auth pages render `<AppFooter />`; reference has none *(low)*

- **Reference** (`screen-login.jsx`): the form panel and avatar strip sit directly above the bottom-edge `LoginCitizens`. No persistent footer.
- **Impl** (`app/[locale]/signin/page.tsx:L184`, `signup/page.tsx:L247`, `forgot-password/page.tsx:L136`, `reset-password/page.tsx`): each renders `<AppFooter />` after the form. The footer is visible below the strip and shows legal nav links.
- **Diff:** extra row of legal links at the bottom of the page — not in reference, may push avatar strip up against the form on small viewports.
- **Suggested fix:** keep for compliance, but verify that the footer doesn't overlap `LoginCitizens` walkers or `AvatarFloatStrip` at common breakpoints. Optionally hide on viewport widths < 480 px where vertical room is tight.

## Matches (no discrepancy)

- `LoginScene` background gradient: `linear-gradient(180deg, var(--sky-top) 0%, var(--sky-mid) 65%, var(--sky-low) 100%)` — verbatim.
- `<StarField density={0.0008} />` ambient stars + `<ShootingStars />` meteor streaks ✓.
- Moon: `<PixelSprite sprite={MOON} palette={MOON_PAL} scale={5} glow="rgba(252,211,77,0.5)" />`, `top: 80, right: 100, opacity: 0.9`, with `animate-floatMoon` ✓.
- Three-canvas `SkylineLayers`: seeds 7 (near `bottom: 80, height: 230`), 22 (far `bottom: 200, height: 150, opacity: 0.55`), 41 (farthest `bottom: 280, height: 110, opacity: 0.4`) — verbatim, with `shadeHex` body scaling at 0.55 / 0.7.
- Ground gradient strip `height: 80, linear-gradient(180deg, var(--bg-1), var(--bg-0))` + `1px solid var(--panel-stroke)` top edge ✓.
- `LoginCitizens`: 5 walkers (`WALKERS[0|2|5|6|4]`, speeds 0.05 / 0.04 / 0.06 / 0.045 / 0.05, dirs 1 / 1 / -1 / 1 / -1, starting x = 5 / 28 / 56 / 78 / 92) + cat at `left: 40%`, `animate-driftX 28s` ✓.
- `FloatingPixels`: 4 items (COFFEE/NOTE alternating), y = 18% / 24% / 32% / 38%, scales 3 / 3 / 2 / 2, durations 38 / 32 / 42 / 35 s, delays 0 / 6 / 12 / 18 s, NOTE items glow `var(--accent-3)` and reverse direction ✓.
- Top bar marker: `<BlinkDot color="var(--accent)" /> FT v1.2.0 · {citizensLabel} <NumberRoll target={2847} />`, position `top: 16, left: 20, right: 20`, font silkscreen 10, letter-spacing 0.15em ✓.
- Hero: `Logo scale={3.75}` (= 150 px) with `animate-logoBob` + `<PixelWord text="FOCUSTOWN" scale={4} color="var(--accent)" glow="var(--accent-2)" />` with `animate-neonFlicker` + `<Tagline />` ✓.
- `Tagline`: 60 ms typing, 2400 ms hold, 30 ms erasing, STAR_TINY `Y: var(--accent-3)` prefix at `scale=2`, 6 × 12 px caret `var(--accent-3)` with `caret-blink` 0.9s ✓.
- Form panel chrome: `pixel-panel` + `login-form-anim`, `width: 380, padding: 20, gap: 12`, `<CornerDeco />` (`CornerDeco color="var(--accent-2)"` on signup) ✓.
- Header dot pattern: `<BlinkDot color="var(--accent-3)"/>` (signin) / `<BlinkDot color="var(--accent-2)"/>` (signup) + uppercased title in `font-silkscreen, fontSize 11, color var(--ink-mute), letterSpacing 0.2em` ✓.
- `SsoButtons` (signin path): Google button `background: #fff, color: #0a0524, borderColor: #fff, fontWeight: 700` + GitHub / Apple pair `flex: 1, padding: 8px 8px, fontSize: 10` ✓.
- `Divider`: 1 px horizontal panel-stroke flank lines + center "OR" in silkscreen 9 ink-dim ✓.
- `Label` helper: silkscreen 10, ink-mute, 0.2em tracking, marginBottom 4 ✓.
- Inputs: `pixel-input` class (signin email + password; signup email; sign-in password) ✓.
- `PixelCheckbox`: 14 × 14, `var(--panel-stroke-strong)` border, `var(--accent)` fill when checked, dark `#0a0524` ✓ glyph ✓.
- "New here? Create account →" footer link: silkscreen 10 ink-dim with the call-to-action chip in `var(--accent)` + neon-glow ✓.
- `AvatarFloatStrip` (signin landing only): `AVATARS.slice(0, 7)` at `scale 1.8` with `floatY` and `0.16s` per-slot staggered delay, glow `rgba(167,139,250,0.4)` ✓.

## Closing checklist — open follow-up fixes?

| Discrepancy | Severity | Open follow-up PR? |
| --- | --- | --- |
| D1 `.pixel-btn.primary` modifier | high | ✅ fixed in Phase A — signin/signup/splash submit buttons now use `pixel-btn primary` (modifier shipped in PR #41) |
| D2 Signin CTA "Enter Town" | high | ✅ no fix needed — `auth.splash.signInTitle` already resolves to "ENTER TOWN" / "進入小鎮" in both locales (audit caught key name, not displayed text) |
| D3 Signup extra `displayName` field | high | **deferred — needs product decision** |
| D4 Signup extra `marketingOptIn` checkbox | high | **deferred — needs product decision** (compliance angle) |
| D5 Signup extra GitHub/Apple SSO row | high | **deferred — needs product decision** |
| D6 Signup confirm-password label | medium | ✅ fixed in Phase A — added `auth.signup.confirmPasswordLabel` + `confirmPasswordPlaceholder` keys, swapped Label |
| D7 LoginScene rain RainOverlay branch | medium | ✅ fixed in Phase A — `LoginScene` accepts `direction` prop; `rain` mounts `<RainOverlay color="var(--accent)">` |
| D8 SkylineLayers direction wiring | medium | ✅ fixed in Phase A — `LoginScene` forwards `direction` to `<SkylineLayers direction={direction}>` |
| D9 Citizens i18n key rename | low | deferred — document only, not user-visible |
| D10 Signup TOS Link wrapping | low | deferred — depends on D3/D4 outcome |
| D11 forgot-password / reset-password Tailwind chrome | high | ✅ fixed in Phase A — both forms converted to `pixel-input` + `pixel-btn primary` + cleaner `pixel-panel` chrome |
| D12 AppFooter not in reference | low | deferred — likely intentional production necessity |

**Recommendation:** D1 + D2 + D11 are quick, high-impact, no-product-decision fixes — bundle into a single `fix(login): restore .pixel-btn primary, "Enter Town" CTA, pixel-panel chrome on forgot/reset` follow-up PR. D3 / D4 / D5 require product alignment first; flag for design+PM review. D7 / D8 can wait until a real dusk/rain theme is wired.
