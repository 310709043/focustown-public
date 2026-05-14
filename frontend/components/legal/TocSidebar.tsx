"use client";

import Link from "next/link";

export type TocItem = {
  id: string;
  title: string;
};

type Props = {
  items: TocItem[];
  related?: Array<{ href: string; label: string; active?: boolean }>;
};

export function TocSidebar({ items, related }: Props) {
  return (
    <aside className="hidden md:block sticky top-6 self-start w-60 shrink-0">
      <div className="bg-card border border-border rounded-lg p-4">
        <div className="font-pixel text-[9px] tracking-widest text-accent-2 mb-3">
          目錄
        </div>
        <nav className="flex flex-col gap-1.5">
          {items.map((it) => (
            <a
              key={it.id}
              href={`#${it.id}`}
              className="text-[11px] text-muted hover:text-accent-2 transition-colors"
            >
              {it.title}
            </a>
          ))}
        </nav>
        {related?.length ? (
          <>
            <div className="font-pixel text-[9px] tracking-widest text-accent-2 mt-5 mb-3">
              相關
            </div>
            <nav className="flex flex-col gap-1.5">
              {related.map((r) => (
                <Link
                  key={r.href}
                  href={r.href as never}
                  className={
                    r.active
                      ? "text-[11px] text-accent-1"
                      : "text-[11px] text-muted hover:text-accent-2"
                  }
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
