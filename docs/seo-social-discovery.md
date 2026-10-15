# Social discovery SEO — 2026-10-16

LowBatteryTown offers short anonymous conversations, not persistent dating profiles or arranged sexual encounters. Search descriptions must match those features. This change adds two bilingual guides to the existing server-rendered guide system; chat behavior and the API are unchanged.

| Search intent | Canonical Traditional Chinese page | What the reader gets |
| --- | --- | --- |
| 匿名聊天、匿名聊天室、免註冊聊天 | `/zh-TW` | The live chat and an accurate description of free, 18+ matching |
| 匿名交友、免費線上交友、聊天交友 | `/zh-TW/guide/anonymous-dating` | How to start a conversation, opening examples, privacy and the inability to find the same partner later |
| 交友軟體、交友網站、交友軟體與匿名聊天 | `/zh-TW/guide/dating-app-or-chat` | Profiles versus brief conversations, ongoing contact, free features and service limits |
| 約砲、打砲與匿名交友的差別 | The comparison guide above | A visible section explaining that 18+ is not consent and the town does not arrange sexual encounters; no promise of a hookup or date |
| WooTalk 類似網站 | `/zh-TW/guide/wootalk-alternative` | Existing independent-service explanation |

Each new article has an equivalent `/en/guide/...` page. The existing renderer provides unique title/description, self-canonical, reciprocal language alternatives, Article and BreadcrumbList JSON-LD, indexable server HTML, and links to the guide and other articles. The article registry adds all four URLs to the sitemap and guide navigation. The public guide FAQ now explains the distinction from dating apps. `llms.txt` links to the guides, but is not claimed to improve Google rankings.

Do not add hidden keyword blocks, fake success stories, copied reviews, location-specific doorway pages, or unrelated sexual terms to the home title/metadata. Google describes keyword stuffing and doorway abuse in its [spam policies](https://developers.google.com/search/docs/essentials/spam-policies); its [helpful-content guidance](https://developers.google.com/search/docs/fundamentals/creating-helpful-content) focuses on useful content for the intended audience.

## Verification and follow-up

- Check the deployed four article URLs return 200, use the www canonical, are indexable, and appear in `/sitemap.xml`.
- Confirm rendered Article JSON-LD matches the visible heading and FAQ JSON-LD matches visible answers. Structured-data validity does not guarantee a rich result.
- Use the owner's `xiangyi10200@gmail.com` Search Console account. Inspect the two Traditional Chinese article URLs and request indexing after deployment; retain the existing sitemap submission rather than creating duplicate properties.
- Review query impressions, clicks, CTR and indexed-page status after Google has recrawled. No search volume, ranking position, indexing date or first-page outcome is promised.

Local regression checks: frontend typecheck, lint, production build, guide-content unit tests, `e2e/lbt-seo.spec.ts`, and the Cloudflare built-Worker route checker. Existing unrelated lint warnings remain outside this change.

The first two GitHub CI attempts failed in Turbopack's existing Noto Sans TC font resolver (`next/font/google queries have exactly one entry`). Production builds explicitly use Next.js's supported `--webpack` mode to preserve the fonts while avoiding that resolver path. The same `pnpm build` command is used by OpenNext; validate its Worker output and nonce CSP after this build change.
