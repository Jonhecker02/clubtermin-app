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
