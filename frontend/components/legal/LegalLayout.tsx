import { ReactNode } from "react";
import { Link } from "@/i18n/routing";
import { TocSidebar, TocItem } from "./TocSidebar";

type Props = {
  active: "terms" | "privacy" | "refund";
  toc: TocItem[];
  children: ReactNode;
};

const RELATED = [
  { href: "/legal/terms", label: "服務條款", key: "terms" },
  { href: "/legal/privacy", label: "隱私政策", key: "privacy" },
  { href: "/legal/refund", label: "退款政策", key: "refund" },
] as const;

export function LegalLayout({ active, toc, children }: Props) {
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
            label: r.label,
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
              ← 返回首頁
            </Link>
          </footer>
        </article>
      </div>
    </main>
  );
}
