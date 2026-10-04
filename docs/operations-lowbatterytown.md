# LowBatteryTown operations

## Accounts and deployment

Cloudflare resources belong to the Focus Town 1314 account. GitHub's repository
owner is `310709043`; use the owner's xiangyi10200 identity for other services.
Do not deploy to a different account or commit credentials.

Merged into develop: security #31, ended-chat deletion/moderation #18 and
TypeScript/lockfile repair #32. Both #18 frontend CI jobs and all 225 API tests
passed. The frontend integration also passed 607 unit tests locally.

Verified on 2026-10-05 (Asia/Taipei):

- GitHub frontend deployment succeeded: run `37215971901`, Worker version
  `97ad6ac9-9180-464a-af5f-a6879573473e` (gzip 1949 KiB).
- API deployed through the existing local OAuth grant: Worker version
  `bce8fde9-cca1-49c8-814e-2934e1a91794`; remote migrations are applied.
- `/healthz` is healthy; public chat status and the updated privacy page respond.
  The admin HTML includes moderation and companion duty controls.
- Feedback test `07e52750-8c15-43ec-b1db-8d0611a09dd4` returned 201 and its D1
  row has `sheet_sent = 1` (Apps Script acknowledged it).

GitHub secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` are configured.
The current CI token deploys the website, but API deployment fails with Cloudflare
7403 during D1 migration queries. Add D1 Edit on the same account to the deployment
token. Do not skip migrations to make the job green. Retain the existing Worker
deployment permissions, Account Read and the necessary Zone Read/Worker Routes
scope, restricted to this account/domain. Token editing needs owner confirmation;
never grant global token-administration access as a workaround.

After an owner-created replacement is ready, run
`python3 scripts/configure-cloudflare-ci.py`: hidden input, account validation and
a read-only D1 query preflight precede updating GitHub Secrets. The token is never
printed or written to a file. Then dispatch `edge.yml` and require its migration,
deploy and smoke-test steps to pass. Revoke the previously disclosed token after
confirming replacement consumers work; its revocation is not yet verified.

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

## Privacy and safety

Ended ordinary chat messages and profiles are removed immediately from the
application's chat store, and the browser clears chat state. Reports must be
submitted before leaving; evidence remains 180 days. Feedback remains 365 days.
Google Sheet copies require a separate retention/access policy. Anonymous-code
restrictions do not stop a person creating a new identity. This service is not
end-to-end encrypted and cannot prevent screenshots.

Cloudflare account MFA is enabled (confirmed through the account API).
GitHub/Google/payment-account MFA and old-token revocation are not verified.
The admin password was rotated by the owner; no new password was shared here.

## Payments and customer contact

The approved destination is https://buymeacoffee.com/lowbatterytown. One Power is
US$3; support is voluntary and grants no matching priority. The owner dashboard
shows a connected payout account, US$0 earnings and no payout history as of this
verification. A genuine supporter payment and eventual bank receipt are still
required; do not mark checkout navigation as a successful payment or have the
creator pay themselves. First-payout review/eligibility is controlled by the
platform; withdrawal is an owner financial action.

`hello@lowbatterytown.com` currently has no MX records and is not verified to
receive mail. Configure Email Routing in the Focus Town Cloudflare account to
the owner's xiangyi10200 Gmail destination, complete destination verification,
then test receipt. Existing local OAuth has no Email Routing edit permission.
Do not claim this customer-contact address works until actual mail is received.
