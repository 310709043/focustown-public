"use client";

import { useTranslations } from "next-intl";

import { Link } from "@/i18n/routing";
import { LEGAL } from "@/lib/config/legal";

export function AppFooter() {
  const t = useTranslations("common.legal");
  return (
    <footer
      className="relative z-10 py-6 px-6 text-center text-muted"
      style={{
        fontSize: "var(--font-size-caption)",
        lineHeight: 1.5,
      }}
    >
      <div className="flex flex-wrap justify-center items-center gap-x-5 gap-y-2">
        <span className="text-dim">© {new Date().getFullYear()} {LEGAL.companyName}</span>
        <Link href="/legal/terms" className="hover:text-accent-2">
          {t("terms")}
        </Link>
        <Link href="/legal/privacy" className="hover:text-accent-2">
          {t("privacy")}
        </Link>
        <Link href="/legal/refund" className="hover:text-accent-2">
          {t("refund")}
        </Link>
      </div>
    </footer>
  );
}
