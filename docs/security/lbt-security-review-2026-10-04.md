# LowBatteryTown security review — 2026-10-04

Scope: the currently deployed Cloudflare frontend, anonymous chat Worker,
admin console, Durable Object/D1 access, Google Sheet forwarding, dependency
lockfiles and Cloudflare CI. The retired AWS/Lightsail and FastAPI deployment
were not modified or certified. Buy Me a Coffee/Stripe security and payments
are outside this application's control; payment/withdrawal verification remains
separate work. This is code review, regression testing and live smoke testing,
not an independent penetration-test certification or a capacity guarantee.

## Findings and repairs

| Priority | Finding | Repair |
| --- | --- | --- |
| High | Companion tickets signed with the human admin password allowed offline password guessing from a ticket. | Strong server-key material plus a password fingerprint signs purpose-separated five-minute tickets. Password rotation invalidates tickets and sessions. |
| High | Admin password persisted in sessionStorage and sent with every data request; no login guess limit. | Login exchanges password for a 12-hour Secure/HttpOnly/SameSite=Strict host-only cookie. Unique session ids, server-side logout revocation, shared per-IP login/failed-bearer limit of 10 per 15 minutes, native timing-safe comparison of fixed-size digests. Old cached password is removed on reload. |
| High | JSON/frame size was unbounded before parsing; control frames and socket count were unbounded per guest. | Stream-aware 16 KiB JSON limit, 8 KiB text-only frames, 120 frames per guest per minute, maximum two open guest sockets. Existing 30 messages/minute and guest/report/feedback limits remain. Rejected connections cannot evict the current administrator socket. |
| Medium | CORS alone did not reject offsite writes or public WebSockets; guest query JWTs could appear in URL logs. | Explicit Origin validation, admin cross-site Fetch Metadata rejection, subprotocol-only socket credentials and trusted internal header replacement. Non-browser clients still require their own anti-abuse controls. |
| Medium | Spreadsheet URL and redirects accepted arbitrary HTTPS hosts; exceptions could disclose upstream details. | Exact Apps Script/Google echo hosts and paths, no credentials or custom ports, one manual GET redirect, ten-second timeout, 4 KiB response limit, generic error logging. Formula escaping and parameterized SQL retained. |
| Medium | Public LowBatteryTown script CSP allowed unsafe-inline. | Fresh edge nonce stamped after OpenNext renders trusted React HTML; matching CSP, private/no-store cache policy and optional analytics hash. No script unsafe-inline on both locales' home/demo/guide/policy pages. No user-controlled HTML/script sinks may be introduced. |
| Medium | Known dependency advisories including Vitest critical, next-intl redirect and Sentry transitive findings. | Upgrade next-intl, Sentry, Vitest/Vite and pin patched transitive versions. Frozen lockfiles, CI audit gates, read-only workflow permissions, Dependabot updates targeting develop. |
| Hardening | Alternate Worker domains and some API headers. | workers.dev and preview URLs disabled; API/admin HSTS, frame denial, nosniff, no-store and permission limits. |

## Verified

- API typecheck and 201 tests pass in the real workerd test pool, including 20
  new security regression cases. Existing two-person pairing, contact masking,
  mutual extensions, report authorization/retention and admin takeover pass.
- Frontend typecheck/lint pass; all 590 frontend tests pass with Node 25's
  experimental webstorage disabled (`NODE_OPTIONS=--no-experimental-webstorage`).
  The deployment CI uses Node 22; the ordinary frontend CI uses Node 20.
- Ordinary Next.js build ran successfully within cf:build; final OpenNext build
  and Wrangler dry-run passed. Frontend gzip is approximately 1.89 MiB; API is
  approximately 24 KiB. Both fit the free-plan 3 MiB gzip bundle limit.
- Full edge dependency audit: zero known advisories. Frontend runtime-only
  dependency audit: zero. Full frontend audit: one high advisory remains in
  development-only braces 3.0.3, used by Tailwind/ESLint filesystem globbing.
  Upstream currently provides no fixed release (GHSA-vfj7-8cjw-p6xm). Do not
  process attacker-supplied glob patterns or expose a development/test server.
  This finding is explicitly recorded, not silently ignored or marked fixed.
- Current tracked files contain no detected Cloudflare-token/private-key/AWS-key
  markers in a targeted scan. This does not certify all Git history or every
  possible secret format.
- Live API: healthz 200, offsite guest creation 403, anonymous admin overview 401.
- Live zh-TW/en home, demo and privacy HTML: every inline script carries the
  response's nonce, consecutive responses use different nonces, script CSP
  omits unsafe-inline, and both HTTPS/WSS API origins remain allowed.
- Latest develop (#29) music was integrated before the final deployment. Both
  MP3 assets return 200; the production battery play, three-level volume and
  header pause controls work, with no browser errors observed.
- Browser: production demo loads and the support modal opens under the strict
  script CSP. No real payment was initiated.

## Operator work and remaining limits

1. Owner confirmed the new admin password was entered using the interactive
   terminal command. The new credential was not shared in chat or saved in Git.
   Login with the new password has not been independently verified. Reload the
   admin console on all operator devices; established sockets are not immediately
   revoked by password rotation, so stop duty and reconnect as well.
2. Revoke/replace the Cloudflare API token previously disclosed in chat via the
   owner's Cloudflare account. Update any CI/external consumers if they use it.
   Deployment here uses local OAuth; no disclosed API token was embedded in code.
3. Enable/verify MFA for Cloudflare, GitHub, Google and the payment owner account.
   Cloudflare Access protecting both /admin and /api/v1/admin/* is recommended
   as a second admin factor, but was not enabled: the current OAuth grant has
   no Access-management permission. Review policies before enabling it so that
   owner devices and companion WebSockets remain usable.
4. Per-IP limits do not stop distributed abuse, bots or determined new identities.
   No Turnstile/WAF account policy, distributed load test, account-MFA audit or
   third-party penetration test has been performed. The single town Durable
   Object remains a shared capacity/billing bottleneck; monitor rejection rates
   and latency and test capacity before promising an online-user limit.
5. Privacy is bounded retention, not immediate disappearance: closed chat state
   lasts up to 24 hours; safety reports 180 days; feedback 365 days, purged by
   the daily cron. Google Sheet copies need their own retention/access policy.
   Storage encryption does not make chat end-to-end encrypted. Nothing can
   reliably prevent users taking screenshots or copying what they can read.
6. Legacy/dynamic Focus Town pages keep their existing CSP. React escapes chat,
   nickname and report text; the admin has a nonce CSP. The edge nonce transform
   trusts server-generated LowBatteryTown HTML and must not stamp arbitrary
   user HTML. Styles still need unsafe-inline for existing React styling.

## Deployments

- API security version: 582d8f74-1526-490c-910e-25091cecc3d5.
- Frontend final version: e44613d0-acac-49c9-a8a4-d81f8d19a473.

References: [Cloudflare Workers best practices](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/),
[Next.js CSP guidance](https://nextjs.org/docs/app/guides/content-security-policy),
[remaining braces advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm).

GitHub run 37203746814 confirms the deployment failed because both Cloudflare
secret environment values were empty. Manual deployment used existing local
OAuth. Automatic deployment still requires owner-supplied GitHub Actions secrets.
