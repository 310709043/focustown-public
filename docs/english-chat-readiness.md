# English chat readiness

The interface locale and the language someone can chat in are separate. The home
form defaults to English on `/en` and Chinese on `/zh-TW`, and allows an explicit
`both` choice. The choice is carried in `join.profile.language`, remains visible
while waiting, and survives queue reconnects, chat reloads and matching again.

The Cloudflare matcher requires an overlapping language before considering pace,
intent or waiting time. Waiting longer never relaxes language. Missing language
on older clients or existing stored profiles means Chinese, preserving existing
visitors during rollout. Unsupported explicit values are rejected. Human companion
invitations require the same overlap, selected explicitly in the admin console and
checked again on acceptance. The legacy AWS backend is not part of this rollout.

English sky topics use original English conversation ideas. They are labelled as
town ideas, not Taiwanese trends translated or presented as global popularity.
The Chinese topic API and editorial workflow are unchanged. Language is included
in the existing ephemeral profile and reported profile; there is no new identifier,
tracking script, database table or retention period.

## Release and verification

Deploy the `edge/` Worker **before** the frontend. An older Worker ignores the new
field and cannot enforce the language promise. No D1 migration or new secret is
needed. Deploy both sides from the same reviewed commit. If rolling back, roll
back the frontend before removing language enforcement from the Worker.

```sh
cd edge
pnpm typecheck
pnpm test
cd ../frontend
pnpm typecheck
pnpm lint
pnpm exec vitest run tests/unit/lib/lbt tests/unit/components/lbt
pnpm test:lbt:stack
pnpm cf:build
```

`e2e/lbt-language.spec.ts` covers English desktop/mobile topics, keyboard focus,
English message exchange, reload/re-entry and an explicit bilingual match while a
Chinese-only visitor waits. Pure matcher tests cover every language combination
and waiting beyond the relaxation threshold. Existing Chinese and admin flows
remain part of the acceptance suite. Screenshots are saved as Playwright test
artifacts, not committed.
