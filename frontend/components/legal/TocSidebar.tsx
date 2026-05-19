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
    <aside
      data-testid="toc-sidebar"
      className="hidden md:block sticky top-6 self-start w-64 shrink-0"
    >
      <div
        className="pixel-panel"
        style={{
          padding: 18,
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        <div
          className="font-silkscreen"
          style={{
            fontSize: "var(--font-size-caption)",
            color: "var(--accent-2)",
            letterSpacing: "0.2em",
            textShadow: "var(--neon-glow-pink)",
          }}
        >
          ● {t("toc")}
        </div>
        <nav style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {items.map((it) => (
            <a
              key={it.id}
              data-toc-entry={it.id}
              href={`#${it.id}`}
              className="font-silkscreen"
              style={{
                fontSize: "var(--font-size-label)",
                color: "var(--ink-mute)",
                lineHeight: 1.45,
                letterSpacing: "0.05em",
                textDecoration: "none",
              }}
            >
              {it.title}
            </a>
          ))}
        </nav>
        {related?.length ? (
          <>
            <div
              className="font-silkscreen"
              style={{
                fontSize: "var(--font-size-caption)",
                color: "var(--accent-2)",
                letterSpacing: "0.2em",
              }}
            >
              ● {t("related")}
            </div>
            <nav style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {related.map((r) => (
                <Link
                  key={r.href}
                  href={r.href as never}
                  className="font-silkscreen"
                  data-toc-related={r.href}
                  style={{
                    fontSize: "var(--font-size-label)",
                    color: r.active ? "var(--accent)" : "var(--ink-mute)",
                    textShadow: r.active ? "var(--neon-glow)" : "none",
                    letterSpacing: "0.05em",
                    textDecoration: "none",
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
