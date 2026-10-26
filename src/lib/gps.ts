// GPS = German Padel Series: tournaments played at the club, registered for
// outside the app (DPV portal). The app only lists them with a link and a hint.

export const GPS_LABEL = "GPS";
export const GPS_DEFAULT_HINT = "Ggf. schon voll. Anmeldung über das DPV-Portal. Lizenz je nach Klasse erforderlich.";
export const GPS_DEFAULT_DESCRIPTION =
  "Turniere der offiziellen German Padel Series – hier nur Termine, die bei The Padellers Essen stattfinden.";
export const GPS_DEFAULT_LOCATION = "The Padellers Essen";
// Flyers only print the start; tournaments run for several hours.
export const GPS_DEFAULT_DURATION_HOURS = 5;

// One line of a schedule flyer as read from the picture.
export interface GpsEntry {
  weekday: string; // "SO", "DI", ... (as printed)
  day: number;
  month: number;
  time: string; // "HH:MM"
  title: string;
}

const WEEKDAY_INDEX: Record<string, number> = { SO: 0, MO: 1, DI: 2, MI: 3, DO: 4, FR: 5, SA: 6 };

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function isoDate(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(day)}`;
}

// The flyer has no year. The printed weekday tells it: pick the year (last,
// this or next) in which that day/month falls on that weekday, preferring the
// one closest to now. `matched` is false when no year fits (misread weekday) —
// the caller flags the row for a manual look.
export function inferYear(entry: Pick<GpsEntry, "weekday" | "day" | "month">, now: Date = new Date()): { year: number; matched: boolean } {
  const wanted = WEEKDAY_INDEX[entry.weekday.trim().toUpperCase().slice(0, 2)];
  const candidates = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1];
  const fits = candidates.filter((y) => {
    const d = new Date(y, entry.month - 1, entry.day);
    return d.getMonth() === entry.month - 1 && d.getDate() === entry.day && (wanted === undefined || d.getDay() === wanted);
  });
  const pool = fits.length > 0 ? fits : candidates;
  // Prefer upcoming dates; among past ones the most recent.
  const cutoff = now.getTime() - 45 * 86400000;
  const upcoming = pool.filter((y) => new Date(y, entry.month - 1, entry.day).getTime() >= cutoff);
  const year = upcoming.length > 0 ? Math.min(...upcoming) : Math.max(...pool);
  return { year, matched: fits.length > 0 && wanted !== undefined };
}

export function addHours(time: string, hours: number): string {
  const [h, m] = time.split(":").map(Number);
  const total = Math.min(h * 60 + m + Math.round(hours * 60), 23 * 60 + 59);
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
}

// Accepts "10:00", "10.00", "10", "10:00 Uhr".
export function normalizeTime(raw: string): string | null {
  const m = raw.trim().match(/^(\d{1,2})(?:[:.](\d{2}))?/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2] ?? "0");
  if (h > 23 || min > 59) return null;
  return `${pad(h)}:${pad(min)}`;
}

export function isValidLink(link: string): boolean {
  return /^https?:\/\/\S+\.\S+$/i.test(link.trim());
}

// ---- Reading the club's schedule PDF without any AI -----------------------
// The PDF stores weekday, date and title as real text, laid out as one row per
// tournament. Rows are found by their date ("01.11."), the weekday sits just
// above it, the title to its right. (The start times are drawn as shapes, not
// text — they are read separately.)

export interface TextBit {
  str: string;
  x: number;
  y: number; // PDF coordinates: grows upward
}

export interface GpsTextRow {
  weekday: string;
  day: number;
  month: number;
  title: string;
  // Vertical middle of the row in PDF coordinates.
  y: number;
}

const WEEKDAY_RE = /^(MO|DI|MI|DO|FR|SA|SO)$/;
const DATE_RE = /^(\d{1,2})\.(\d{1,2})\.$/;

export function rowsFromTextBits(bits: TextBit[]): { rows: GpsTextRow[]; pitch: number } {
  const clean = bits.map((b) => ({ ...b, str: b.str.trim() })).filter((b) => b.str !== "");
  const dates = clean.filter((b) => DATE_RE.test(b.str)).sort((a, b) => b.y - a.y);
  if (dates.length === 0) return { rows: [], pitch: 0 };

  const gaps = dates.slice(1).map((d, i) => dates[i].y - d.y).filter((g) => g > 1);
  const pitch = gaps.length > 0 ? [...gaps].sort((a, b) => a - b)[Math.floor(gaps.length / 2)] : 40;

  const rows: GpsTextRow[] = [];
  for (const date of dates) {
    const [, d, m] = date.str.match(DATE_RE)!;
    // Weekday: same column, directly above the date.
    const weekday = clean
      .filter((b) => WEEKDAY_RE.test(b.str) && Math.abs(b.x - date.x) < 12 && b.y > date.y && b.y - date.y < pitch * 0.8)
      .sort((a, b) => a.y - b.y)[0];
    const middle = weekday ? (weekday.y + date.y) / 2 : date.y + pitch * 0.2;
    // Title: everything to the right of the date on this row.
    const title = clean
      .filter((b) => b.x > date.x + 25 && Math.abs(b.y - middle) < pitch * 0.45 && !DATE_RE.test(b.str) && !WEEKDAY_RE.test(b.str))
      .sort((a, b) => a.x - b.x)
      .map((b) => b.str)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    if (!title) continue;
    rows.push({ weekday: weekday?.str ?? "", day: Number(d), month: Number(m), title, y: middle });
  }
  return { rows, pitch };
}

// "1800" / "10:00" / "1 1:00" / "930" -> "HH:MM", or null when it is not a time.
export function timeFromOcr(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length !== 3 && digits.length !== 4) return null;
  const hours = digits.length === 3 ? digits.slice(0, 1) : digits.slice(0, 2);
  const minutes = digits.slice(-2);
  const h = Number(hours);
  const m = Number(minutes);
  if (h > 23 || m > 59) return null;
  return `${pad(h)}:${pad(m)}`;
}
