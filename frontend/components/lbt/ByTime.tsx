import type { ReactNode } from "react";

/**
 * Copy for each town time. All four are in the HTML and CSS shows the one
 * matching <html data-lbt-time> (lbt.css, `.by-time`), so the server HTML
 * is the same for everyone and the words change with the clock.
 */
export function ByTime({
  night,
  dawn = night,
  day = night,
  dusk = night,
}: {
  night: ReactNode;
  dawn?: ReactNode;
  day?: ReactNode;
  dusk?: ReactNode;
}) {
  return (
    <>
      <span className="by-time t-dawn">{dawn}</span>
      <span className="by-time t-day">{day}</span>
      <span className="by-time t-dusk">{dusk}</span>
      <span className="by-time t-night">{night}</span>
    </>
  );
}
