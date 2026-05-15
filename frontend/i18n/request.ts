import { getRequestConfig } from "next-intl/server";
import { routing, type Locale } from "./routing";

function isSupportedLocale(value: string | undefined): value is Locale {
  return value !== undefined && (routing.locales as readonly string[]).includes(value);
}

const NAMESPACES = [
  "common",
  "auth",
  "town",
  "focus",
  "match",
  "shop",
  "library",
  "legal",
  "errors",
  "scenes",
  "characters",
] as const;

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = isSupportedLocale(requested) ? requested : routing.defaultLocale;

  const bundles = await Promise.all(
    NAMESPACES.map((ns) =>
      import(`../messages/${locale}/${ns}.json`).then((m) => [ns, m.default] as const),
    ),
  );

  return {
    locale,
    messages: Object.fromEntries(bundles),
    timeZone: "Asia/Taipei",
  };
});
