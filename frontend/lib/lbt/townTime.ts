/**
 * The town follows the visitor's own clock: four times of day and, on
 * weekends, a different street. Pure functions, plus a self-contained
 * `applyTownTime` that also runs as an inline script before first paint
 * (app/[locale]/layout.tsx), so the page never flashes the wrong sky.
 *
 * Weekdays (Mon–Fri) show the city street, weekends (Sat–Sun) the old
 * apartment lane. A `?time=` / `?week=` query parameter previews a state
 * (QA, screenshots); anything else is ignored.
 */

export const TOWN_TIMES = ["dawn", "day", "dusk", "night"] as const;
export const TOWN_WEEKS = ["weekday", "weekend"] as const;
export type TownTime = (typeof TOWN_TIMES)[number];
export type TownWeek = (typeof TOWN_WEEKS)[number];

/** Minutes after local midnight where each time of day starts. */
export const TOWN_TIME_STARTS = { dawn: 5 * 60, day: 6 * 60 + 30, dusk: 17 * 60, night: 19 * 60 } as const;

export function townTimeAt(date: Date): TownTime {
  const m = date.getHours() * 60 + date.getMinutes();
  if (m >= TOWN_TIME_STARTS.night || m < TOWN_TIME_STARTS.dawn) return "night";
  if (m >= TOWN_TIME_STARTS.dusk) return "dusk";
  if (m >= TOWN_TIME_STARTS.day) return "day";
  return "dawn";
}

export function townWeekAt(date: Date): TownWeek {
  const d = date.getDay();
  return d === 0 || d === 6 ? "weekend" : "weekday";
}

/**
 * Writes `data-lbt-time` / `data-lbt-week` on `root` (the <html> element).
 * Self-contained on purpose: it is stringified into the inline boot script,
 * so it may not reference anything outside its own body.
 */
export function applyTownTime(root: HTMLElement, now: Date = new Date(), search = ""): void {
  const times = ["dawn", "day", "dusk", "night"];
  const weeks = ["weekday", "weekend"];
  const params = new URLSearchParams(search);
  const m = now.getHours() * 60 + now.getMinutes();
  let time = m >= 1140 || m < 300 ? "night" : m >= 1020 ? "dusk" : m >= 390 ? "day" : "dawn";
  let week = now.getDay() === 0 || now.getDay() === 6 ? "weekend" : "weekday";
  const askedTime = params.get("time");
  const askedWeek = params.get("week");
  if (askedTime && times.indexOf(askedTime) >= 0) time = askedTime;
  if (askedWeek && weeks.indexOf(askedWeek) >= 0) week = askedWeek;
  if (root.getAttribute("data-lbt-time") !== time) root.setAttribute("data-lbt-time", time);
  if (root.getAttribute("data-lbt-week") !== week) root.setAttribute("data-lbt-week", week);
}

/** Inline boot script: sets the attributes before the first paint. */
export const TOWN_TIME_BOOT = `try{(${applyTownTime.toString()})(document.documentElement,new Date(),location.search)}catch(e){}`;
