/**
 * Calendar dates in Asia/Jakarta, as "YYYY-MM-DD" strings.
 *
 * The owner reports take a range of Jakarta dates and bucket by Jakarta time
 * in the database, so "today" has to mean today in Jakarta whatever clock the
 * browser is on. WIB is UTC+7 with no daylight saving, so shifting the instant
 * by a fixed seven hours and reading the UTC fields gives the Jakarta date
 * exactly. Every date here is then handled as a UTC midnight, which keeps the
 * day arithmetic free of the browser's own timezone.
 */

export type IsoDate = string;

const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

function toIso(d: Date): IsoDate {
  return d.toISOString().slice(0, 10);
}

export function parseIso(date: IsoDate): Date {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function todayJakarta(): IsoDate {
  return toIso(new Date(Date.now() + WIB_OFFSET_MS));
}

export function addDays(date: IsoDate, days: number): IsoDate {
  return toIso(new Date(parseIso(date).getTime() + days * DAY_MS));
}

export function daysBetween(from: IsoDate, to: IsoDate): number {
  return Math.round((parseIso(to).getTime() - parseIso(from).getTime()) / DAY_MS);
}

/** Weeks start on Monday. */
export function startOfWeek(date: IsoDate): IsoDate {
  const dow = parseIso(date).getUTCDay(); // 0 = Sunday
  return addDays(date, -((dow + 6) % 7));
}

export function startOfMonth(date: IsoDate): IsoDate {
  return date.slice(0, 8) + "01";
}

export function endOfMonth(date: IsoDate): IsoDate {
  const d = parseIso(date);
  return toIso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)));
}

export function addMonths(date: IsoDate, months: number): IsoDate {
  const d = parseIso(date);
  return toIso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1)));
}

export type PresetKey =
  | "today"
  | "yesterday"
  | "thisWeek"
  | "lastWeek"
  | "thisMonth"
  | "lastMonth"
  | "thisYear"
  | "lastYear"
  | "custom";

export type DateRange = { from: IsoDate; to: IsoDate; preset: PresetKey };

export const PRESETS: { key: Exclude<PresetKey, "custom">; label: string }[] = [
  { key: "today", label: "Hari ini" },
  { key: "yesterday", label: "Kemarin" },
  { key: "thisWeek", label: "Minggu ini" },
  { key: "lastWeek", label: "Minggu lalu" },
  { key: "thisMonth", label: "Bulan ini" },
  { key: "lastMonth", label: "Bulan lalu" },
  { key: "thisYear", label: "Tahun ini" },
  { key: "lastYear", label: "Tahun lalu" },
];

/**
 * The "this ..." presets end today rather than at the end of the period: the
 * days after today have no sales yet, and including them would flatten the
 * end of every chart to zero.
 */
export function presetRange(key: Exclude<PresetKey, "custom">): DateRange {
  const today = todayJakarta();
  const year = today.slice(0, 4);

  switch (key) {
    case "today":
      return { from: today, to: today, preset: key };
    case "yesterday": {
      const y = addDays(today, -1);
      return { from: y, to: y, preset: key };
    }
    case "thisWeek":
      return { from: startOfWeek(today), to: today, preset: key };
    case "lastWeek": {
      const from = addDays(startOfWeek(today), -7);
      return { from, to: addDays(from, 6), preset: key };
    }
    case "thisMonth":
      return { from: startOfMonth(today), to: today, preset: key };
    case "lastMonth": {
      const from = addMonths(today, -1);
      return { from, to: endOfMonth(from), preset: key };
    }
    case "thisYear":
      return { from: `${year}-01-01`, to: today, preset: key };
    case "lastYear": {
      const last = String(Number(year) - 1);
      return { from: `${last}-01-01`, to: `${last}-12-31`, preset: key };
    }
  }
}

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
export const MONTHS_LONG = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];
export const WEEKDAYS_SHORT = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"]; // 0 = Sunday

/** "26 Sep 2026" */
export function formatDate(date: IsoDate): string {
  const d = parseIso(date);
  return `${d.getUTCDate()} ${MONTHS_SHORT[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** "26 Sep" */
export function formatDayMonth(date: IsoDate): string {
  const d = parseIso(date);
  return `${d.getUTCDate()} ${MONTHS_SHORT[d.getUTCMonth()]}`;
}

/** "1 – 26 Sep 2026", or a single date when the range is one day. */
export function formatRange(from: IsoDate, to: IsoDate): string {
  if (from === to) return formatDate(from);
  const a = parseIso(from);
  const b = parseIso(to);
  if (a.getUTCFullYear() !== b.getUTCFullYear()) return `${formatDate(from)} – ${formatDate(to)}`;
  if (a.getUTCMonth() !== b.getUTCMonth()) return `${formatDayMonth(from)} – ${formatDate(to)}`;
  return `${a.getUTCDate()} – ${formatDate(to)}`;
}

/** A stored timestamp shown on Jakarta's clock: "26 Sep 2026 · 14.05". */
export function formatJakartaDateTime(timestamp: string): string {
  const shifted = new Date(new Date(timestamp).getTime() + WIB_OFFSET_MS);
  const date = formatDate(toIso(shifted));
  const hh = String(shifted.getUTCHours()).padStart(2, "0");
  const mm = String(shifted.getUTCMinutes()).padStart(2, "0");
  return `${date} · ${hh}.${mm}`;
}
