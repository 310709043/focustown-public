import { getTranslations } from "next-intl/server";

type Props = {
  title: string;
  subtitle?: string;
  effectiveDate: string;
  version: string;
};

export async function LegalDocHeader({ title, subtitle, effectiveDate, version }: Props) {
  const t = await getTranslations("common.legal");
  return (
    <header className="mb-10 pb-6 border-b border-border">
      <h1
        className="font-pixel tracking-wider mb-3"
        style={{
          fontSize: "var(--font-size-page-title)",
          lineHeight: "var(--line-height-tight)",
          color: "var(--a2)",
          textShadow: "0 0 14px var(--a1)",
        }}
      >
        ✦ {title} ✦
      </h1>
      {subtitle ? (
        <p
          className="text-muted"
          style={{
            fontSize: "var(--font-size-body)",
            lineHeight: "var(--line-height-body)",
          }}
        >
          {subtitle}
        </p>
      ) : null}
      <div
        className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-muted"
        style={{
          fontSize: "var(--font-size-caption)",
          letterSpacing: 0.4,
          lineHeight: 1.5,
        }}
      >
        <span>{t("effectiveDate", { date: effectiveDate })}</span>
        <span>{t("version", { version })}</span>
      </div>
    </header>
  );
}
