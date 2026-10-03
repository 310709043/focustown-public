/**
 * The battery-shaped "B" from the LowBatteryTown logo. Strokes follow
 * `currentColor` so the mark sits on the night background in paper and on
 * light surfaces in night; the lower bowl is always the peach charge.
 * Geometry matches public/brand/lbt-mark.svg; keep the two in sync.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="1 1 80 111" aria-hidden="true" focusable="false">
      <rect x="21" y="2" width="25" height="13" rx="4" fill="currentColor" />
      <path d="M9.75 55.25H48a24.25 24.25 0 0 1 0 48.5H9.75Z" fill="var(--peach, #f4b49d)" />
      <path
        d="M9.75 103.75V19.75H45.5a17.75 17.75 0 0 1 0 35.5H9.75M45.5 55.25H48a24.25 24.25 0 0 1 0 48.5H9.75"
        fill="none"
        stroke="currentColor"
        strokeWidth="15.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** "Low[B]atteryTown" as in the logo. Decorative: the link carries the name. */
export function Wordmark() {
  return (
    <span className="wordmark" aria-hidden="true">
      Low
      <BrandMark className="wordmark-b" />
      atteryTown
    </span>
  );
}
