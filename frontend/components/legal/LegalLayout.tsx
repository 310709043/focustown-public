import { ReactNode } from "react";
import { getTranslations } from "next-intl/server";

import { Link } from "@/i18n/routing";
import { TocSidebar, TocItem } from "./TocSidebar";

type Props = {
  active: "terms" | "privacy" | "refund";
  toc: TocItem[];
  children: ReactNode;
};

const RELATED: Array<{ href: string; key: "terms" | "privacy" | "refund" }> = [
  { href: "/legal/terms", key: "terms" },
  { href: "/legal/privacy", key: "privacy" },
  { href: "/legal/refund", key: "refund" },
];

export async function LegalLayout({ active, toc, children }: Props) {
  const t = await getTranslations("common.legal");
  return (
    <main
      data-testid="legal-layout"
      data-legal-active={active}
      className="min-h-screen px-4 md:px-10 py-10"
      style={{
        background:
          "linear-gradient(155deg,#060120 0%,#0d0435 55%,#060120 100%)",
      }}
    >
      <div className="max-w-6xl mx-auto flex gap-8">
        <TocSidebar
          items={toc}
          related={RELATED.map((r) => ({
            href: r.href,
            label: t(r.key),
            active: r.key === active,
          }))}
        />
        <article
          data-testid="legal-article"
          className="pixel-panel flex-1 max-w-3xl"
          style={{ padding: "24px 28px" }}
        >
          {children}
          <footer
            className="font-silkscreen"
            style={{
              marginTop: 48,
              paddingTop: 24,
              borderTop: "1px solid var(--panel-stroke)",
              fontSize: "var(--font-size-label)",
              lineHeight: 1.5,
              color: "var(--ink-mute)",
              letterSpacing: "0.1em",
            }}
          >
            <Link
              href="/"
              style={{ color: "var(--accent-2)", textDecoration: "none" }}
            >
              ◀ {t("backHome")}
            </Link>
          </footer>
        </article>
      </div>
    </main>
  );
}
