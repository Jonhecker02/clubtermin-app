import type { Group, RegistrationStatus, TerminType } from "@/types/database";

// Keep in sync with cancel_registration()'s v_cutoff_hours in supabase/migrations/0001_init.sql
export const CANCEL_CUTOFF_HOURS = 24;

export const WEEKDAY_LABELS = ["MO", "DI", "MI", "DO", "FR", "SA", "SO"] as const;

export function weekdayLabel(dateISO: string): string {
  const d = new Date(`${dateISO}T00:00:00`);
  return WEEKDAY_LABELS[(d.getDay() + 6) % 7];
}

export function dateLabel(dateISO: string): string {
  const d = new Date(`${dateISO}T00:00:00`);
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.`;
}

export function fullDateLabel(dateISO: string): string {
  const d = new Date(`${dateISO}T00:00:00`);
  return `${weekdayLabel(dateISO)}, ${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}. ${d.getFullYear()}`;
}

export function hhmm(time: string): string {
  return time.slice(0, 5);
}

export function terminDateTime(dateISO: string, time: string): Date {
  return new Date(`${dateISO}T${time}`);
}

export function hoursUntil(dateISO: string, time: string): number {
  return (terminDateTime(dateISO, time).getTime() - Date.now()) / 3_600_000;
}

export function msUntil(target: Date): number {
  return target.getTime() - Date.now();
}

export function isUpcoming(t: { date: string; start_time: string }): boolean {
  return terminDateTime(t.date, t.start_time).getTime() >= Date.now();
}

type RegistrationWindow = {
  registration_opens_date: string | null;
  registration_opens_time: string | null;
  registration_opens_hidden: boolean;
};

export function isRegistrationOpen(t: RegistrationWindow): boolean {
  if (!t.registration_opens_date) return true;
  return terminDateTime(t.registration_opens_date, t.registration_opens_time ?? "00:00").getTime() <= Date.now();
}

// forAdmin bypasses the "hide from members" flag — admins always see the
// real opening time in their own views. Hidden (for a member) means no
// notice line at all, not a generic placeholder: the row is already dimmed
// and the register button already reads "noch nicht offen", so nothing
// else needs to hint at the concealed date/time.
export function registrationOpensLabel(t: RegistrationWindow, opts?: { forAdmin?: boolean }): string | null {
  if (isRegistrationOpen(t)) return null;
  if (t.registration_opens_hidden && !opts?.forAdmin) return null;
  const time = t.registration_opens_time ? hhmm(t.registration_opens_time) : null;
  return `Anmeldung ab ${dateLabel(t.registration_opens_date!)}${time ? ` ${time} Uhr` : ""}`;
}

type RegistrationCloses = {
  registration_closes_date: string | null;
  registration_closes_time: string | null;
};

// null = no deadline set (rotation inactive for this termin) — matches the
// backend's own fallback-to-instant-behavior rule exactly.
export function registrationClosesAt(t: RegistrationCloses): Date | null {
  if (!t.registration_closes_date) return null;
  return terminDateTime(t.registration_closes_date, t.registration_closes_time ?? "00:00");
}

// Splits a termin's registrations into the three buckets every list/detail
// page needs — pulled out once here instead of each page re-implementing
// the same three `.filter(r => r.status === ...)` calls inline.
export function splitRegistrations<T extends { status: RegistrationStatus }>(
  registrations: T[],
): { confirmed: T[]; waitlist: T[]; pending: T[] } {
  return {
    confirmed: registrations.filter((r) => r.status === "angemeldet"),
    waitlist: registrations.filter((r) => r.status === "warteliste"),
    pending: registrations.filter((r) => r.status === "ausstehend"),
  };
}

// "2 Tage 4 Std." / "3 Std. 12 Min." / "8 Min." — coarsens to the two most
// significant units so it doesn't tick unnecessarily fast in the UI: pass a
// pre-computed remaining-ms value (the caller owns the ticking interval,
// this stays a pure formatter).
export function formatCountdown(msRemaining: number): string {
  if (msRemaining <= 0) return "0 Min.";
  const totalMinutes = Math.floor(msRemaining / 60_000);
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) return `${days} Tag${days === 1 ? "" : "e"} ${hours} Std.`;
  if (hours > 0) return `${hours} Std. ${minutes} Min.`;
  return `${minutes} Min.`;
}

export function formatPrice(price: number | null): string {
  if (price == null) return "";
  return `${price.toFixed(2).replace(".", ",")} €`;
}

export function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function badgeInfo(type: TerminType): { tone: "navy" | "pink" | "outline"; label: string } {
  if (type === "training") return { tone: "navy", label: "Training" };
  if (type === "event") return { tone: "pink", label: "Event" };
  return { tone: "outline", label: "Spieltag" };
}

export function groupLabel(g: Pick<Group, "name" | "short_code">): string {
  return g.short_code ? `${g.short_code} - ${g.name}` : g.name;
}

export function groupsLabel(ids: string[], groups: Pick<Group, "id" | "name" | "short_code">[]): string {
  if (ids.includes("all")) return "Alle Gruppen";
  return ids
    .map((id) => {
      const g = groups.find((g) => g.id === id);
      return g ? groupLabel(g) : id;
    })
    .join(", ");
}

// Only shows a Kürzel when a termin/notification maps to exactly one specific
// group — "all" or multiple groups have no single short code to display.
export function groupShortCode(ids: string[], groups: Pick<Group, "id" | "short_code">[]): string | null {
  if (ids.length !== 1 || ids[0] === "all") return null;
  return groups.find((g) => g.id === ids[0])?.short_code ?? null;
}

export function withShortCode(title: string, shortCode: string | null): string {
  return shortCode ? `${shortCode} · ${title}` : title;
}

const MONTH_LABELS = [
  "Januar",
  "Februar",
  "März",
  "April",
  "Mai",
  "Juni",
  "Juli",
  "August",
  "September",
  "Oktober",
  "November",
  "Dezember",
];

export function monthLabel(year: number, month: number): string {
  return `${MONTH_LABELS[month]} ${year}`;
}

export interface CalendarCell {
  day: number;
  iso: string;
}

export function buildTerminShareText(params: {
  title: string;
  shortCode: string | null;
  dateLabel: string;
  timeLabel: string;
  location: string;
  courts: string;
  trainer: string;
  price: string;
  maxTn: number;
  participants: string[];
  waitlist: string[];
}): string {
  const { title, shortCode, dateLabel, timeLabel, location, courts, trainer, price, maxTn, participants, waitlist } = params;
  const lines: string[] = [
    shortCode ? `${shortCode} · ${title}` : title,
    `${dateLabel} · ${timeLabel} Uhr`,
    `${location}${courts ? `, ${courts}` : ""}`,
    `Trainer: ${trainer}`,
  ];
  if (price) lines.push(`Preis: ${price}`);
  lines.push("", `Teilnehmer (${participants.length}/${maxTn}):`);
  if (participants.length === 0) lines.push("—");
  participants.forEach((name, i) => lines.push(`${i + 1}. ${name}`));
  if (waitlist.length > 0) {
    lines.push("", `Warteliste (${waitlist.length}):`);
    waitlist.forEach((name, i) => lines.push(`${i + 1}. ${name}`));
  }
  return lines.join("\n");
}

// Monday-start month grid; null entries pad the leading empty cells.
export function buildMonthGrid(year: number, month: number): (CalendarCell | null)[] {
  const firstOfMonth = new Date(year, month, 1);
  const startOffset = (firstOfMonth.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: (CalendarCell | null)[] = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    const iso = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    cells.push({ day: d, iso });
  }
  return cells;
}
