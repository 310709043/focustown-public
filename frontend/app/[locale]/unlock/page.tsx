import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { GuideShell } from "@/components/lbt/GuideShell";
import { UnlockForm } from "@/components/lbt/UnlockForm";

type Params = Promise<{ locale: string }>;

/** Where a buyer enters an unlock code. Not linked from the site yet, and kept out of search. */
export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "lbt.unlock" });
  return { title: t("title"), robots: { index: false, follow: false } };
}

export default async function UnlockPage({ params }: { params: Params }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <GuideShell>
      <UnlockForm />
    </GuideShell>
  );
}
