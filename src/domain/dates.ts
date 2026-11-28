/**
 * Calendar-date helpers. Everything works on ISO "YYYY-MM-DD" strings and UTC
 * arithmetic, so results never shift with the device's time zone or DST.
 */

export type IsoDate = string;

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MS_PER_DAY = 86_400_000;

function toUtcMs(iso: IsoDate): number {
  const m = ISO_RE.exec(iso);
  if (!m) throw new RangeError(`Not an ISO date: ${iso}`);
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function fromUtcMs(ms: number): IsoDate {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Build an ISO date, or null if the day/month/year is not a real date (e.g. 31/02). */
export function makeIsoDate(year: number, month: number, day: number): IsoDate | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) {
    return null;
  }
  return fromUtcMs(d.getTime());
}

export function isIsoDate(value: string): boolean {
  const m = ISO_RE.exec(value);
  return !!m && makeIsoDate(Number(m[1]), Number(m[2]), Number(m[3])) === value;
}

/** The device-local calendar date for a moment (defaults to now). */
export function toLocalIsoDate(at: Date = new Date()): IsoDate {
  const y = at.getFullYear();
  const m = String(at.getMonth() + 1).padStart(2, '0');
  const d = String(at.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Accepts an ISO date or a full ISO timestamp and returns the date part. */
export function toIsoDate(value: string): IsoDate {
  const date = value.slice(0, 10);
  if (!isIsoDate(date)) throw new RangeError(`Not an ISO date or timestamp: ${value}`);
  return date;
}

export function addDays(iso: IsoDate, days: number): IsoDate {
  return fromUtcMs(toUtcMs(iso) + days * MS_PER_DAY);
}

/** Whole days from `from` to `to` (positive when `to` is later). */
export function daysBetween(from: IsoDate, to: IsoDate): number {
  return Math.round((toUtcMs(to) - toUtcMs(from)) / MS_PER_DAY);
}

function lastDayOfMonth(year: number, month: number): IsoDate {
  return fromUtcMs(Date.UTC(year, month, 0));
}

function expandYear(y: number): number {
  return y < 100 ? 2000 + y : y;
}

function monthFromName(name: string): number | null {
  const i = MONTHS.indexOf(name.slice(0, 3).toLowerCase());
  return i === -1 ? null : i + 1;
}

/** For a day and month with no year, pick the year that puts the date closest to `reference`. */
function nearestYear(day: number, month: number, reference: IsoDate): IsoDate | null {
  const refYear = Number(reference.slice(0, 4));
  let best: IsoDate | null = null;
  for (const year of [refYear - 1, refYear, refYear + 1]) {
    const candidate = makeIsoDate(year, month, day);
    if (!candidate) continue;
    if (
      best === null ||
      Math.abs(daysBetween(reference, candidate)) < Math.abs(daysBetween(reference, best))
    ) {
      best = candidate;
    }
  }
  return best;
}

// Labels printed before dates on UK/EU packs. Longest first so "BBE" wins over "BB".
const LABEL_RE =
  /^(?:best\s+before\s+end|best\s+before|use\s+by|display\s+until|sell\s+by|bbe|bb|exp(?:iry|ires)?|mhd|à\s+consommer\s+de\s+préférence\s+avant(?:\s+fin)?|dlc|ddm)[\s.:]*/i;

export interface ParseDateOptions {
  /** Used to fill in a missing year. Defaults to today. */
  reference?: IsoDate;
}

/**
 * Parse a printed day-first UK/EU date into an ISO date, or return null.
 *
 * Handles "12/03/2026", "12.03.26", "12-3-2026", "12 DEC", "12 Dec 2026",
 * "12DEC26", "DEC 2026", "BB 03/27" and an optional label such as "Use by" or "BBE".
 *
 * Two numeric parts are read as day/month when the second part is 1–12
 * ("12/03" is 12 March), and as month/year otherwise ("03/27" is March 2027).
 * Month-only dates resolve to the last day of that month, as packs mean
 * "best before end". Never guesses month-first (US) order.
 */
export function parseDayFirstDate(input: string, options: ParseDateOptions = {}): IsoDate | null {
  const reference = options.reference ?? toLocalIsoDate();
  const text = input.trim().replace(LABEL_RE, '').trim();
  if (!text) return null;
  if (isIsoDate(text)) return text;

  // 12/03/2026, 12.03.26, 12-3-2026, 12 03 2026
  let m = /^(\d{1,2})[/.\-\s](\d{1,2})[/.\-\s](\d{2}|\d{4})$/.exec(text);
  if (m) return makeIsoDate(expandYear(Number(m[3])), Number(m[2]), Number(m[1]));

  // Two numeric parts: dd/mm, or mm/yy(yy) when the second part can't be a month.
  m = /^(\d{1,2})[/.-](\d{2}|\d{4})$/.exec(text);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (m[2]!.length === 2 && b >= 1 && b <= 12) return nearestYear(a, b, reference);
    if (a >= 1 && a <= 12) return lastDayOfMonth(expandYear(b), a);
    return null;
  }

  // 12 DEC, 12 Dec 2026, 12DEC26, 12-Dec-2026, 12th December 2026
  m = /^(\d{1,2})(?:st|nd|rd|th)?[\s.\-/]*([a-z]{3,9})\.?(?:[\s.\-/,]*(\d{2}|\d{4}))?$/i.exec(text);
  if (m) {
    const month = monthFromName(m[2]!);
    if (!month) return null;
    const day = Number(m[1]);
    return m[3]
      ? makeIsoDate(expandYear(Number(m[3])), month, day)
      : nearestYear(day, month, reference);
  }

  // DEC 2026, Dec-26 (best before end of month)
  m = /^([a-z]{3,9})\.?[\s.\-/,]*(\d{2}|\d{4})$/i.exec(text);
  if (m) {
    const month = monthFromName(m[1]!);
    return month ? lastDayOfMonth(expandYear(Number(m[2])), month) : null;
  }

  return null;
}

const SHORT_MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

export interface FormatDateOptions {
  /** Prefix with "~ " to mark an estimate (Req 4.2). */
  estimated?: boolean;
  /** Include the year when it differs from this date's year. Defaults to today. */
  reference?: IsoDate;
}

/** Short day-first label for the UI: "4 Dec", "~ 4 Dec", or "4 Dec 2027" in another year. */
export function formatShortDate(iso: IsoDate, options: FormatDateOptions = {}): string {
  const reference = options.reference ?? toLocalIsoDate();
  const [y, mo, d] = iso.split('-').map(Number) as [number, number, number];
  let label = `${d} ${SHORT_MONTHS[mo - 1]}`;
  if (String(y) !== reference.slice(0, 4)) label += ` ${y}`;
  return options.estimated ? `~ ${label}` : label;
}

/** Numeric day-first form, "04/12/2026", for exports and form fields. */
export function formatDayFirst(iso: IsoDate): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}
