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
    <header
      data-testid="legal-doc-header"
      style={{
        marginBottom: 40,
        paddingBottom: 24,
        borderBottom: "1px solid var(--panel-stroke)",
      }}
    >
      <h1
        className="font-silkscreen"
        style={{
          fontSize: "var(--font-size-page-title)",
          lineHeight: "var(--line-height-tight)",
          color: "var(--accent-2)",
          textShadow: "var(--neon-glow-pink)",
          letterSpacing: "0.12em",
          margin: 0,
          marginBottom: 12,
        }}
      >
        ✦ {title} ✦
      </h1>
      {subtitle ? (
        <p
          style={{
            fontSize: "var(--font-size-body)",
            lineHeight: "var(--line-height-body)",
            color: "var(--ink-mute)",
            margin: 0,
          }}
        >
          {subtitle}
        </p>
      ) : null}
      <div
        className="font-silkscreen"
        style={{
          marginTop: 16,
          display: "flex",
          flexWrap: "wrap",
          gap: "4px 16px",
          fontSize: "var(--font-size-caption)",
          letterSpacing: "0.1em",
          lineHeight: 1.5,
          color: "var(--ink-dim)",
        }}
      >
        <span>{t("effectiveDate", { date: effectiveDate })}</span>
        <span>{t("version", { version })}</span>
      </div>
    </header>
  );
}
