"use client";

import { ReactNode } from "react";

type Props = {
  id: string;
  title: string;
  children: ReactNode;
};

export function LegalSection({ id, title, children }: Props) {
  return (
    <section id={id} className="scroll-mt-24 mb-10">
      <h2 className="font-pixel text-[12px] tracking-wider mb-3 text-accent-2">
        {title}
      </h2>
      <div className="text-[13px] leading-relaxed text-text space-y-3 [&_a]:text-accent-2 [&_a]:underline [&_a:hover]:text-accent-1 [&_strong]:text-accent-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:space-y-1">
        {children}
      </div>
    </section>
  );
}
