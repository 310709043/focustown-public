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
        <article className="flex-1 max-w-3xl bg-card border border-border rounded-lg p-6 md:p-10">
          {children}
          <footer
            className="mt-12 pt-6 border-t border-border text-muted"
            style={{
              fontSize: "var(--font-size-label)",
              lineHeight: 1.5,
            }}
          >
            <Link href="/" className="hover:text-accent-2">
              {t("backHome")}
            </Link>
          </footer>
        </article>
      </div>
    </main>
  );
}
