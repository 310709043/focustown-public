# LowBatteryTown operations

## Accounts and deployment

Cloudflare resources belong to the Focus Town 1314 account. GitHub's repository
owner is `310709043`; use the owner's xiangyi10200 identity for other services.
Do not deploy to a different account or commit credentials.

Merged into develop: security #31, ended-chat deletion/moderation #18,
TypeScript/lockfile repair #32, operations #38, React types #41 and the tested
user-event update #43. Deployment and health checks are operational.

Verified on 2026-10-05 (Asia/Taipei):

- GitHub frontend deployment succeeded on develop `9f85cd4`: run `37310653916`.
- API GitHub deployment succeeded: run `37218987281`, Worker version
  `83f0cd17-634f-4f70-b3a9-33a28f11fc1e`; remote migrations are applied.
- `/healthz` is healthy; public chat status and the updated privacy page respond.
  The admin HTML includes moderation and companion duty controls.
- Feedback test `07e52750-8c15-43ec-b1db-8d0611a09dd4` returned 201 and its D1
  row has `sheet_sent = 1` (Apps Script acknowledged it).

GitHub secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` are configured.
The D1 permission failure is resolved. The owner-confirmed deployment token has
Account D1 Edit, Workers Scripts Edit, Workers Tail Read and Account Settings
Read on the Focus Town account, plus Workers Routes Edit only for
lowbatterytown.com. Unneeded KV/R2/Pages/AI/Containers/user permissions were
removed. Both website and API CI deployments passed with this token. Do not skip
migrations or grant global token-administration access as a workaround.

After an owner-created replacement is ready, run
`python3 scripts/configure-cloudflare-ci.py`: hidden input, account validation and
a read-only D1 query preflight precede updating GitHub Secrets. The token is never
printed or written to a file. Then dispatch `edge.yml` and require its migration,
deploy and smoke-test steps to pass. The previously disclosed DNS token was
revoked in the owner-approved Cloudflare UI action and its removal verified.

## Health checks

`python3 scripts/check-lbt-health.py` checks the website, API health and public
status, with HTTPS certificate verification, request timeouts, response limits
and one retry. It creates no guests, reports, feedback or chat traffic. A closed
town is valid. Errors expose no upstream body or personal information.

The `LowBatteryTown health` workflow runs every 15 minutes on develop (the default
branch), and can be dispatched manually. Failure marks the Actions run failed;
the owner must enable GitHub Actions failure notifications for email alerts.
GitHub may delay scheduled runs: this is basic availability monitoring, not a
guaranteed real-time pager, billing monitor or end-to-end pairing check.
Failure email delivery is not yet verified. Enable GitHub Settings →
Notifications → System → Actions → Email → Only notify for failed workflows on
the owner's account; do not create an outage on the public website to test it.
After enabling those preferences, dispatch `monitor-lbt.yml` with
`test_failure_alert=true`. That explicitly labelled manual probe exits with a
failure without calling production. Confirm the notification arrives in the
owner's inbox, then dispatch the default healthy run. Scheduled and PR checks
never enable this probe; an intentional failure alone does not prove delivery.

Cloudflare budget alerts remain unconfigured. If available for the account's
plan, use Billing → Billable usage → Create budget alert, with an initial US$5
usage threshold and the owner as recipient. This sends a notification; it is
**not a hard spending cap** and does not stop Workers. Do not upgrade the account
plan or subscribe to paid add-ons just to enable this alert.

## Capacity

Run `cd edge && pnpm test:capacity`. Each scenario starts a fresh **local workerd**
with a local Durable Object and local D1. This never contacts the public API;
`SELF.fetch` uses the production-shaped URL only as a local request address.
Documentation-only IPs model independent visitors. The separate scenarios keep
100/300/500 sockets open, pair every guest, exchange messages, then leave/close.
Regular CI does not run this heavier benchmark.

Initial isolated results on the owner's Mac:

| Guests | Simultaneous pairs | Setup | Message p50 | Message p95 |
| --- | --- | --- | --- | --- |
| 100 | 50 | 0.637 s | 44 ms | 75 ms |
| 300 | 150 | 13.659 s | 220 ms | 420 ms |
| 500 | 250 | 61.988 s | 475 ms | 934 ms |

An earlier combined run timed out at 500 after retaining recent visitors from
the preceding cases. The runner now starts independent processes so those
visitors cannot distort subsequent scenarios. Public status includes recent idle
visitors during the offline grace period, rather than only active pairs.

These results are **not a production user limit**: network latency, geographic
traffic, sustained typing/reconnects, distributed abuse and billed resource
limits are not simulated. One town Durable Object handles all visitors. Per-IP
guest creation remains limited to 30/hour, which matters for shared networks.
Before announcing capacity, run a separate staging-domain sustained test and
review Cloudflare CPU, errors and billing metrics. Do not load-test real visitors.

### Isolated Cloudflare staging

`cd edge && pnpm test:capacity:staging 100 120` creates a uniquely named
`lbt-capacity-*` Worker, SQLite Durable Object namespace and separate D1 database
in the Focus Town account. It never reads or edits production bindings or routes.
Only a workers.dev hostname is accepted; requests require a fresh private test
key. The entrypoint refuses admin/report/feedback endpoints and fails closed if
the isolated-mode marker/key/hostname is missing. Test keys live in memory and
Worker Secrets, never files or command arguments. Admin and Sheet secrets are
not copied. The runner removes the test Worker and D1 in `finally`, and reports
cleanup failures explicitly. Do not terminate the runner with SIGKILL: if it is
interrupted externally, remove only the printed `lbt-capacity-*` resources.

Allowed inputs: 100, 300 or 500 guests, 30–180 seconds. Traffic is bounded,
manual-only, and may consume Cloudflare included usage or usage-based charges;
it is not scheduled in CI. Synthetic documentation IPs represent independent
visitors **after test-key authentication**, so production NAT/anti-abuse limits
are not exercised or weakened. Every guest pairs, receives the partner's exact
messages, and leaves; 10% replace their sockets and recover the same partner.

Verified 2026-10-05: 100 guests / 50 pairs, 120 seconds, 10 reconnects,
1,200 received partner messages, setup 3.743 seconds, p50 208 ms / p95 256 ms.
Both temporary Worker and D1 were removed. These bounded checks do not establish
a guaranteed capacity, multi-region performance, or a long-duration soak SLO.
Larger attempts did **not** pass: new workers.dev routes returned intermittent
HTTP/WebSocket 404s; one 500-guest attempt reached 460 paired guests before a
test-client network failure. Do not count these as verified 300/500 capacity.
The runner now reports startup HTTP/handshake retries and network cause codes,
and handles rejected frame waits so cleanup can finish after a synchronous send
failure. A previously interrupted run's leftover test D1 was removed explicitly;
the subsequent D1 inventory contained only the production `lbt` database.

## Privacy and safety

Ended ordinary chat messages and profiles are removed immediately from the
application's chat store, and the browser clears chat state. Reports must be
submitted before leaving; evidence remains 180 days. Feedback remains 365 days.
Google Sheet copies require a separate retention/access policy. The actual
LowBatteryTown Sheet was checked: general access is **Restricted**, with only
xiangyi10200 as owner. The deployed Apps Script uses `RETENTION_DAYS = 365`, but
has **zero triggers**. A daily `purgeOld` trigger at 03:00–04:00 GMT+08, with
immediate failure notification, is prepared but not saved: the owner must confirm
the permanent deletion of expired rows before activation. Do not mark retention
automation complete until the trigger appears and an execution succeeds.
Anonymous-code
restrictions do not stop a person creating a new identity. This service is not
end-to-end encrypted and cannot prevent screenshots.

Cloudflare account MFA is enabled (confirmed through the account API).
Google account MFA is enabled (verified in xiangyi10200's security settings).
GitHub/payment-account MFA remain unverified; old-token revocation is verified.
Reauthentication or MFA enrollment must be completed by the owner.
The admin password was rotated by the owner; no new password was shared here.

## Payments and customer contact

The approved destination is https://buymeacoffee.com/lowbatterytown. One Power is
US$3; support is voluntary and grants no matching priority. The owner dashboard
shows a connected payout account, US$0 earnings and no payout history as of this
verification. A genuine supporter payment and eventual bank receipt are still
required; do not mark checkout navigation as a successful payment or have the
creator pay themselves. First-payout review/eligibility is controlled by the
platform; withdrawal is an owner financial action.

`hello@lowbatterytown.com` Email Routing is configured in the Focus Town account,
forwarding to the **verified** xiangyi10200 Gmail destination. The named rule is
on and catch-all is off. MX (route1/2/3.mx.cloudflare.net), SPF and Cloudflare DKIM
were verified through public DNS. The last dashboard state was synchronizing;
final activation and actual receipt still need verification. Test from a
different sender than the forwarding destination; Gmail may discard a message
sent back to the sender through an alias. A proposed owner-account test message
requires explicit authorization before sending. Local OAuth lacks Email Routing
edit permission; never claim successful receipt based only on DNS or rule state.

## Dependency maintenance

The React update in this follow-up changes `react` and `react-dom` together to
19.3.0; the one-package PR #42 failed because React DOM remained 19.2.7. Local
validation passed typecheck, lint, 607 unit tests, 17 LowBatteryTown browser
tests and the Cloudflare build. Dependabot now groups the two runtime packages,
the two React type packages, and Next with eslint-config-next.

Defer standalone major migrations until a dedicated compatibility change:

- Next #34: Next 16 removes `next lint`; the current lint command failed. Upgrade
  ESLint configuration, routing and the OpenNext deployment together, with CI.
- jsdom #44: all test environments failed in undici with
  `webidl.util.markAsUncloneable is not a function`; keep jsdom 25 until repaired.
- Node types #45: CI passed, but Node 26 types do not match deployment's Node 22;
  stay on current Node 22 types to avoid describing unsupported runtime APIs.

Major version updates for these packages are deferred in Dependabot; minor and
patch updates remain enabled. Review security alerts separately rather than
assuming a deferred major upgrade is safe forever.
