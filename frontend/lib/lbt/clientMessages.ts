import type { AbstractIntlMessages } from "next-intl";

/**
 * The messages sent to the browser with every LowBatteryTown page.
 *
 * Client components only read `lbt` (and `errors` in the error boundary),
 * and none of them reads the long server-rendered copy: the guide answers,
 * the articles and the policy sections. Leaving those and the legacy
 * Focus Town bundles out keeps them from being serialised into every
 * page's HTML (about two thirds of it before this). `policy.nav` and
 * `guide.nav` stay because the footer links use them. The legacy layout
 * provides the full set to its own pages.
 */
const CLIENT_NAMESPACES = ["lbt", "errors"] as const;

type Bundle = Record<string, unknown>;

export function lbtClientMessages(messages: Record<string, unknown>): AbstractIntlMessages {
  const picked = Object.fromEntries(
    CLIENT_NAMESPACES.filter((ns) => ns in messages).map((ns) => [ns, messages[ns]]),
  ) as Record<string, Bundle>;
  const lbt = picked.lbt;
  if (!lbt) return picked as AbstractIntlMessages;
  const { articles: _articles, policy, guide, ...rest } = lbt as Bundle & {
    policy?: Bundle;
    guide?: Bundle;
  };
  return {
    ...picked,
    lbt: {
      ...rest,
      ...(policy ? { policy: { nav: policy.nav } } : {}),
      ...(guide ? { guide: { nav: guide.nav } } : {}),
    },
  } as AbstractIntlMessages;
}
