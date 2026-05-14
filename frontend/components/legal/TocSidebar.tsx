"use client";

import { useTranslations } from "next-intl";

import { Link } from "@/i18n/routing";

export type TocItem = {
  id: string;
  title: string;
};

type Props = {
  items: TocItem[];
  related?: Array<{ href: string; label: string; active?: boolean }>;
};

export function TocSidebar({ items, related }: Props) {
  const t = useTranslations("common.legal");
  return (
    <aside className="hidden md:block sticky top-6 self-start w-64 shrink-0">
      <div className="bg-card border border-border rounded-lg p-5">
        <div
          className="font-pixel tracking-widest text-accent-2 mb-4"
          style={{
            fontSize: "var(--font-size-caption)",
            lineHeight: 1.3,
          }}
        >
          {t("toc")}
        </div>
        <nav className="flex flex-col gap-2">
          {items.map((it) => (
            <a
              key={it.id}
              href={`#${it.id}`}
              className="text-muted hover:text-accent-2 transition-colors"
              style={{
                fontSize: "var(--font-size-label)",
                lineHeight: 1.45,
              }}
            >
              {it.title}
            </a>
          ))}
        </nav>
        {related?.length ? (
          <>
            <div
              className="font-pixel tracking-widest text-accent-2 mt-6 mb-4"
              style={{
                fontSize: "var(--font-size-caption)",
                lineHeight: 1.3,
              }}
            >
              {t("related")}
            </div>
            <nav className="flex flex-col gap-2">
              {related.map((r) => (
                <Link
                  key={r.href}
                  href={r.href as never}
                  className={
                    r.active
                      ? "text-accent-1"
                      : "text-muted hover:text-accent-2"
                  }
                  style={{
                    fontSize: "var(--font-size-label)",
                    lineHeight: 1.45,
                  }}
                >
                  {r.label}
                </Link>
              ))}
            </nav>
          </>
        ) : null}
      </div>
    </aside>
  );
}
