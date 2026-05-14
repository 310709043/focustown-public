"use client";

import { ReactNode } from "react";

type Props = {
  id: string;
  title: string;
  children: ReactNode;
};

export function LegalSection({ id, title, children }: Props) {
  return (
    <section id={id} className="scroll-mt-24 mb-12">
      <h2
        className="font-pixel tracking-wider mb-4 text-accent-2"
        style={{
          fontSize: "var(--font-size-card-title)",
          lineHeight: "var(--line-height-title)",
        }}
      >
        {title}
      </h2>
      <div
        className="text-text space-y-4 [&_a]:text-accent-2 [&_a]:underline [&_a:hover]:text-accent-1 [&_strong]:text-accent-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:space-y-2"
        style={{
          fontSize: "var(--font-size-body-lg)",
          lineHeight: "var(--line-height-reading)",
        }}
      >
        {children}
      </div>
    </section>
  );
}
