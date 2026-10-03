/**
 * Pure rules for LowBatteryTown: input cleaning, contact masking, pairing
 * and opening hours. A port of backend/app/domain/services/lbt_rules.py;
 * no I/O, so every rule is unit-testable with plain values.
 */

export const NICKNAME_MAX = 12;
export const MESSAGE_MAX = 500;
export const REPORT_NOTE_MAX = 500;

export const ENERGIES = [1, 2, 3] as const;
export const PREFERENCES = ["casual", "listen", "story"] as const;
export const REPORT_REASONS = ["harassment", "sexual", "minor", "spam", "self_harm", "other"] as const;

export type Preference = (typeof PREFERENCES)[number];
export type ReportReason = (typeof REPORT_REASONS)[number];

export interface Profile {
  nickname: string;
  energy: number;
  preference: Preference;
  /** Set by the server only; parseProfile never accepts a client-supplied role. */
  role?: "admin";
}

export interface Waiting {
  guestId: string;
  profile: Profile;
  /** epoch ms */
  joinedAt: number;
}

/** The client sent something the rules reject; `code` goes back over the socket. */
export class InputError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

// C0 controls (minus \t \n), DEL, zero-width and bidi overrides/isolates.
const CONTROL = /[\u0000-\u0008\u000b-\u001f\u007f​-‏‪-‮⁦-⁩]/g;

/** Strip control / bidi-override characters, trim, cap by code points. */
export function cleanText(raw: unknown, limit: number): string {
  if (typeof raw !== "string") return "";
  const cleaned = raw.replace(CONTROL, "").replace(/\r\n?/g, "\n").trim();
  return Array.from(cleaned).slice(0, limit).join("").trim();
}

export function parseProfile(raw: unknown): Profile {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const nickname = cleanText(r.nickname, NICKNAME_MAX).replace(/\n/g, " ");
  if (!nickname) throw new InputError("nickname_required");
  const energy = r.energy;
  if (typeof energy !== "number" || !(ENERGIES as readonly number[]).includes(energy)) {
    throw new InputError("invalid_energy");
  }
  const preference = r.preference;
  if (typeof preference !== "string" || !(PREFERENCES as readonly string[]).includes(preference)) {
    throw new InputError("invalid_preference");
  }
  return { nickname, energy, preference: preference as Preference };
}

// ── contact masking ──────────────────────────────────────────────────

export const CONTACT_MASK = "•••";

const DIGIT = "0-9０-９"; // ASCII and full-width digits
const URL_RE = new RegExp(
  String.raw`(?:https?://|www\.)\S+` +
    String.raw`|\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.` +
    "(?:com|net|org|io|tw|me|cc|co|app|link|ly|gg|xyz|info|top|tv|to|ai|dev|page|site)" +
    String.raw`\b(?:/\S*)?`,
  "gi",
);
const EMAIL_RE = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
const HANDLE_RE = /(?<![\w@])@[A-Za-z0-9_.]{3,}/g;
// Separators: space, hyphen, dot, brackets, plus their full-width forms.
const PHONE_RE = new RegExp(
  `[+\\uff0b]?[${DIGIT}](?:[${DIGIT}\\s\\-.()\\uff0d\\uff0e\\uff08\\uff09]{6,})[${DIGIT}]`,
  "g",
);
const DIGIT_RE = new RegExp(`[${DIGIT}]`, "g");

/**
 * Hide links, e-mail addresses, @handles and phone numbers. Moving a
 * stranger to another channel is where scams and harassment start. Short
 * digit runs (times, years) stay; eight or more digits read as a phone.
 */
export function maskContacts(text: string): string {
  // E-mail first: its domain would otherwise be taken for a bare link.
  return text
    .replace(EMAIL_RE, CONTACT_MASK)
    .replace(URL_RE, CONTACT_MASK)
    .replace(HANDLE_RE, CONTACT_MASK)
    .replace(PHONE_RE, (m) => ((m.match(DIGIT_RE)?.length ?? 0) >= 8 ? CONTACT_MASK : m));
}

// ── pairing ──────────────────────────────────────────────────────────

/**
 * Higher is a better pairing; 0 means "only if nobody better shows up".
 * Listener + storyteller is best, "just chatting" goes with anyone, two
 * people who only want to be heard is weakest. Batteries within one step
 * add a point (similar reply pace).
 */
export function compatibility(me: Profile, other: Profile): number {
  const pair = new Set([me.preference, other.preference]);
  let score: number;
  if (pair.has("listen") && pair.has("story")) score = 3;
  else if (pair.has("casual")) score = 1;
  else if (pair.size === 1 && pair.has("story")) score = 1;
  else score = 0;
  if (Math.abs(me.energy - other.energy) <= 1) score += 1;
  return score;
}

/**
 * Best partner for `me` among `candidates` (oldest first). A candidate
 * needs a score of at least 1 unless either side has waited `relaxAfterMs`,
 * then anyone not blocked will do. Ties go to whoever waited longest.
 */
export function pickPartner(
  me: Waiting,
  candidates: Iterable<Waiting>,
  now: number,
  relaxAfterMs: number,
  blocked: ReadonlySet<string> = new Set(),
): Waiting | null {
  let best: Waiting | null = null;
  let bestScore = -1;
  for (const other of candidates) {
    if (other.guestId === me.guestId || blocked.has(other.guestId)) continue;
    const score = compatibility(me.profile, other.profile);
    const relaxed = now - me.joinedAt >= relaxAfterMs || now - other.joinedAt >= relaxAfterMs;
    if (score < 1 && !relaxed) continue;
    if (score > bestScore || (score === bestScore && best && other.joinedAt < best.joinedAt)) {
      best = other;
      bestScore = score;
    }
  }
  return best;
}

// ── opening hours ────────────────────────────────────────────────────

/** Minutes after local midnight. */
export type OpenHours = { start: number; end: number };

const HOURS_RE = /^\s*(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})\s*$/;

/** `"21:00-24:00"` → window; empty means always open. Throws on a bad spec. */
export function parseOpenHours(spec: string): OpenHours | null {
  if (!spec.trim()) return null;
  const m = HOURS_RE.exec(spec);
  if (!m) throw new Error(`invalid open hours: ${spec}`);
  const [h1, m1, h2, m2] = m.slice(1).map(Number) as [number, number, number, number];
  if (h1 > 24 || h2 > 24 || m1 > 59 || m2 > 59 || (h1 === 24 && m1) || (h2 === 24 && m2)) {
    throw new Error(`invalid open hours: ${spec}`);
  }
  const start = (h1 % 24) * 60 + m1;
  const end = (h2 % 24) * 60 + m2;
  if (start === end) throw new Error(`open hours must not be empty: ${spec}`);
  return { start, end };
}

function localMinutes(now: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(now));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return get("hour") * 60 + get("minute");
}

/** Whether the street lamps are lit at `now` (epoch ms). */
export function isOpen(now: number, hours: OpenHours | null, timeZone: string): boolean {
  if (!hours) return true;
  const local = localMinutes(now, timeZone);
  if (hours.start < hours.end) return hours.start <= local && local < hours.end;
  return local >= hours.start || local < hours.end; // window crosses midnight
}
