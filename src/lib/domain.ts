import type { Group, TerminType } from "@/types/database";

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

export function isUpcoming(t: { date: string; start_time: string }): boolean {
  return terminDateTime(t.date, t.start_time).getTime() >= Date.now();
}

type RegistrationWindow = { registration_opens_date: string | null; registration_opens_time: string | null };

export function isRegistrationOpen(t: RegistrationWindow): boolean {
  if (!t.registration_opens_date) return true;
  return terminDateTime(t.registration_opens_date, t.registration_opens_time ?? "00:00").getTime() <= Date.now();
}

export function registrationOpensLabel(t: RegistrationWindow): string | null {
  if (isRegistrationOpen(t)) return null;
  const time = t.registration_opens_time ? hhmm(t.registration_opens_time) : null;
  return `Anmeldung ab ${dateLabel(t.registration_opens_date!)}${time ? ` ${time} Uhr` : ""}`;
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
