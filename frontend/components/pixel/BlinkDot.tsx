/** Small LED dot — slow "blink-soft" pulse used in pixel-UI section headers. */
export function BlinkDot({
  color,
  size = 6,
  marginRight = 0,
}: {
  color: string;
  size?: number;
  marginRight?: number;
}) {
  return (
    <span
      aria-hidden
      className="animate-blinkSoft"
      style={{
        display: "inline-block",
        width: size,
        height: size,
        background: color,
        boxShadow: `0 0 6px ${color}`,
        verticalAlign: "middle",
        marginRight,
      }}
    />
  );
}
