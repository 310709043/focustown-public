type Props = {
  title: string;
  subtitle?: string;
  effectiveDate: string;
  version: string;
};

export function LegalDocHeader({ title, subtitle, effectiveDate, version }: Props) {
  return (
    <header className="mb-8 pb-6 border-b border-border">
      <h1
        className="font-pixel text-[18px] tracking-wider mb-2"
        style={{
          color: "var(--a2)",
          textShadow: "0 0 14px var(--a1)",
        }}
      >
        ✦ {title} ✦
      </h1>
      {subtitle ? (
        <p className="text-[12px] text-muted">{subtitle}</p>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-muted">
        <span>生效日期：{effectiveDate}</span>
        <span>版本：{version}</span>
      </div>
    </header>
  );
}
