import type { Group, RegistrationStatus, Termin, TerminType, SessionFormat, Gender } from "@/types/database";

// Keep in sync with cancel_registration()'s v_cutoff_hours in supabase/migrations/0001_init.sql
export const CANCEL_CUTOFF_HOURS = 24;

export const WEEKDAY_LABELS = ["MO", "DI", "MI", "DO", "FR", "SA", "SO"] as const;

// Accounts created in the app (self-registration, owner-created) get a
// technical placeholder address that only exists to satisfy the auth system.
// It is never shown to people; real addresses (older accounts) still are.
export function displayEmail(email: string | null | undefined): string | null {
  if (!email || email.toLowerCase().endsWith("@clubtermin.local")) return null;
  return email;
}

// Whether a termin belongs to a trainer's scope: it is visible to / open for
// one of their groups (or everyone), or they are its assigned trainer.
export function terminInTrainerScope(
  t: { visible_groups: string[]; register_groups: string[]; trainer_id: string | null },
  groupIds: string[],
  userId: string | null,
): boolean {
  if (userId && t.trainer_id === userId) return true;
  const hit = (list: string[]) => list.includes("all") || list.some((g) => groupIds.includes(g));
  return hit(t.visible_groups) || hit(t.register_groups);
}

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

type CourtGroupTiming = {
  start_time: string;
  end_time: string;
  court_groups_switch_time: string | null;
  session_format?: SessionFormat;
};

function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function minutesToHHMM(min: number): string {
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// Where Runde 1 ends and Runde 2 begins. Defaults to start + 60 min (the
// usual "1 Std. Training, 1 Std. Spiel" shape) rather than the exact
// midpoint — a 2:15h slot should still default to a clean 1h first half,
// not 1h07. Clamped into [start, end] so a manual override can't produce a
// negative-length round even if the termin's time changes afterward.
export function courtGroupSwitchMinutes(t: CourtGroupTiming): number {
  const start = timeToMinutes(t.start_time);
  const end = timeToMinutes(t.end_time);
  const wanted = t.court_groups_switch_time ? timeToMinutes(t.court_groups_switch_time) : start + 60;
  return Math.min(Math.max(wanted, start), end);
}

export function courtGroupRoundRange(round: 1 | 2, t: CourtGroupTiming): string {
  const start = timeToMinutes(t.start_time);
  const end = timeToMinutes(t.end_time);
  const switchAt = courtGroupSwitchMinutes(t);
  const [from, to] = round === 1 ? [start, switchAt] : [switchAt, end];
  return `${minutesToHHMM(from)}–${minutesToHHMM(to)}`;
}

export const SESSION_FORMAT_LABELS: Record<SessionFormat, string> = {
  training_spiel: "Training & Spiel",
  nur_spiel: "Nur Spiel",
  nur_training: "Nur Training",
};

export function sessionFormatOf(t: { session_format?: SessionFormat | null }): SessionFormat {
  return t.session_format ?? "training_spiel";
}

// Whole-slot time range ("18:00–20:00").
function wholeSlotRange(t: CourtGroupTiming): string {
  return `${minutesToHHMM(timeToMinutes(t.start_time))}–${minutesToHHMM(timeToMinutes(t.end_time))}`;
}

// What one group does and when, in plain words. `round` 1 = trains first,
// 2 = plays first (only meaningful for "Training & Spiel").
//   "Erst Training 18:00–19:00, dann Spiel 19:00–20:00"
export function courtGroupPlanText(round: 1 | 2, t: CourtGroupTiming): string {
  const format = sessionFormatOf(t);
  if (format === "nur_spiel") return `Spiel ${wholeSlotRange(t)}`;
  if (format === "nur_training") return `Training ${wholeSlotRange(t)}`;
  const first = courtGroupRoundRange(1, t);
  const second = courtGroupRoundRange(2, t);
  return round === 1 ? `Erst Training ${first}, dann Spiel ${second}` : `Erst Spiel ${first}, dann Training ${second}`;
}

// What the player sees on their own card.
export function playerPlanSentence(round: 1 | 2, t: CourtGroupTiming): string {
  const format = sessionFormatOf(t);
  if (format === "nur_spiel") return `Du spielst (${wholeSlotRange(t)}).`;
  if (format === "nur_training") return `Du trainierst (${wholeSlotRange(t)}).`;
  const first = courtGroupRoundRange(1, t);
  const second = courtGroupRoundRange(2, t);
  return round === 1
    ? `Erst trainierst du (${first}), danach spielst du (${second}).`
    : `Erst spielst du (${first}), danach trainierst du (${second}).`;
}

export function msUntil(target: Date): number {
  return target.getTime() - Date.now();
}

// "Kommend" until the termin is over — one that is running right now still
// counts (it only moves to "Vergangen" after its end time).
export function isUpcoming(t: { date: string; start_time: string; end_time?: string }): boolean {
  return terminDateTime(t.date, t.end_time ?? t.start_time).getTime() >= Date.now();
}

// Between start and end right now.
export function isTerminRunning(t: { date: string; start_time: string; end_time: string }, nowMs = Date.now()): boolean {
  return terminDateTime(t.date, t.start_time).getTime() <= nowMs && nowMs <= terminDateTime(t.date, t.end_time).getTime();
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

// Deadline of a fair-rotation termin has passed (false when there is none).
export function registrationDeadlinePassed(t: RegistrationCloses): boolean {
  const closes = registrationClosesAt(t);
  return !!closes && closes.getTime() <= Date.now();
}

// A registration that came in after the deadline of a fair-rotation termin:
// someone who stepped in ("Nachrücker") for a spot that was still free.
export function isNachruecker(createdAt: string, t: RegistrationCloses): boolean {
  const closes = registrationClosesAt(t);
  return !!closes && new Date(createdAt).getTime() > closes.getTime();
}

// Line for copied/exported lists when spots are still open, telling people
// how to take one.
export function freeSpotsHint(free: number, lateSignup: boolean): string | null {
  if (free <= 0) return null;
  const spots = free === 1 ? "1 Platz" : `${free} Plätze`;
  return lateSignup
    ? `Noch ${spots} frei — als Nachrücker in der App anmelden: clubtermine.online`
    : `Noch ${spots} frei — in der App anmelden: clubtermine.online`;
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

// The Saturday immediately before a training date, 22:00 — leaves Saturday
// evening/Sunday morning free to review and confirm the fair-rotation
// allocation before the week's session. Just a starting suggestion for the
// admin to accept or override, not enforced.
export function suggestedRegistrationCloses(dateISO: string): string {
  const d = new Date(`${dateISO}T00:00:00`);
  // Sat=0, Sun=1, Mon=2, ... Fri=6 — and a Saturday training gets the Saturday
  // a week earlier (22:00 the same evening would be after the training).
  const daysSinceSaturday = (d.getDay() + 1) % 7 || 7;
  const saturday = new Date(d);
  saturday.setDate(d.getDate() - daysSinceSaturday);
  const iso = `${saturday.getFullYear()}-${String(saturday.getMonth() + 1).padStart(2, "0")}-${String(saturday.getDate()).padStart(2, "0")}`;
  return `${iso}T22:00`;
}

// Re-sorts the waitlist into actual nachrück-order — created_at order is
// only correct when fair rotation is off; get_waitlist_rank() (queried once
// per termin) supplies the real order otherwise, this just applies it.
// Falls back to the incoming order (already created_at-sorted from the
// query) while ranks haven't loaded yet or the termin has no rotation.
export function orderByWaitlistRank<T extends { user_id: string }>(
  waitlist: T[],
  ranks: Record<string, number> | undefined,
): T[] {
  if (!ranks || Object.keys(ranks).length === 0) return waitlist;
  return [...waitlist].sort((a, b) => (ranks[a.user_id] ?? Number.MAX_SAFE_INTEGER) - (ranks[b.user_id] ?? Number.MAX_SAFE_INTEGER));
}

interface RotationFacts {
  last_participation: string | null;
  never_participated: boolean;
}

// The one fact the rotation ranks on first. For players who were never
// confirmed, the stored date is the day their account was created — their
// "waiting since" — so it's labeled differently, not as a participation.
export function lastParticipationLabel(a: RotationFacts): string | null {
  if (!a.last_participation) return null;
  return a.never_participated
    ? `noch nie dabei (zählt ab ${dateLabel(a.last_participation)})`
    : `zuletzt dabei am ${dateLabel(a.last_participation)}`;
}

// One line per allocated player for the admin's "Zuteilung erklären":
// where they ranked among applicants and the facts that decided it.
export function allocationDetail(
  a: RotationFacts & {
    excluded_from_rotation: boolean;
    rank_order: number | null;
    applicant_count: number | null;
    quote: number | null;
  },
): string {
  const parts: string[] = [];
  if (a.rank_order != null && a.applicant_count != null) parts.push(`Rang ${a.rank_order} von ${a.applicant_count}`);
  if (a.excluded_from_rotation) {
    parts.push("von Rotation ausgeschlossen — Platz garantiert");
  } else {
    const last = lastParticipationLabel(a);
    if (last) parts.push(last);
    if (a.quote != null) parts.push(`Quote ${Math.round(a.quote * 100)}%`);
  }
  return parts.length > 0 ? parts.join(" · ") : "Keine Historie";
}

export const ROTATION_RULE_TEXT =
  "So wird zugeteilt: 1. Wer am längsten nicht dabei war, hat Vorrang. 2. Bei Gleichstand: wer zuletzt seltener einen Platz bekam. 3. Dann entscheidet das Los. Der Anmeldezeitpunkt spielt keine Rolle.";

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
  // "Nur Spiel" has no trainer to name.
  showTrainer?: boolean;
  // How to take one of the open spots (see freeSpotsHint).
  freeHint?: string | null;
}): string {
  const { title, shortCode, dateLabel, timeLabel, location, courts, trainer, price, maxTn, participants, waitlist } = params;
  const lines: string[] = [
    shortCode ? `${shortCode} · ${title}` : title,
    `${dateLabel} · ${timeLabel} Uhr`,
    `${location}${courts ? `, ${courts}` : ""}`,
  ];
  if (params.showTrainer !== false && trainer && trainer !== "—") lines.push(`Trainer: ${trainer}`);
  if (price) lines.push(`Preis: ${price}`);
  lines.push("", `Teilnehmer (${participants.length}/${maxTn}):`);
  if (participants.length === 0) lines.push("—");
  participants.forEach((name, i) => lines.push(`${i + 1}. ${name}`));
  // Open spots up to the maximum set when the termin was created.
  for (let n = participants.length + 1; n <= maxTn; n++) lines.push(`${n}. FREI`);
  if (waitlist.length > 0) {
    lines.push("", `Warteliste (${waitlist.length}):`);
    waitlist.forEach((name, i) => lines.push(`${i + 1}. ${name}`));
  }
  if (params.freeHint) lines.push("", params.freeHint);
  return lines.join("\n");
}

// Spielstärke is 0–5 with decimals ("2,5"). Shown German-style, without
// trailing zeros: 3 -> "3", 2.5 -> "2,5", 2.75 -> "2,75".
export function formatLevel(level: number): string {
  return String(Math.round(level * 100) / 100).replace(".", ",");
}

// Accepts "2,5" or "2.5"; empty = not rated. Returns undefined for anything
// that isn't a number between 0 and 5.
export function parseLevel(text: string): number | null | undefined {
  const clean = text.trim().replace(",", ".");
  if (clean === "") return null;
  if (!/^\d+(\.\d+)?$/.test(clean)) return undefined;
  const value = Math.round(Number(clean) * 100) / 100;
  return value >= 0 && value <= 5 ? value : undefined;
}

// Trainer-facing overview of who plays on which court, for pasting into
// WhatsApp (the *bold* markers render there and are harmless elsewhere).
// Deliberately carries no Spielstärke — levels are for the planning screen
// only, a pasted text must not leak them.
export function buildCourtGroupsShareText(params: {
  termin: Pick<
    Termin,
    "title" | "date" | "start_time" | "end_time" | "location" | "courts" | "court_groups_switch_time" | "session_format"
  >;
  groups: { label: string; trainerName: string; round: 1 | 2; memberNames: string[] }[];
}): string {
  const { termin, groups } = params;
  const format = sessionFormatOf(termin);
  const lines: string[] = [
    `*${format === "nur_spiel" ? "Einteilung" : "Trainingsgruppen"} · ${termin.title}*`,
    `${fullDateLabel(termin.date)} · ${hhmm(termin.start_time)}–${hhmm(termin.end_time)} Uhr`,
    `${termin.location}${termin.courts ? `, ${termin.courts}` : ""}`,
    "",
  ];
  for (const g of groups) {
    const trainer = g.trainerName && format !== "nur_spiel" ? ` · Trainer: ${g.trainerName}` : "";
    lines.push(`*${g.label}*${trainer}`);
    lines.push(courtGroupPlanText(g.round, termin));
    g.memberNames.forEach((name, i) => lines.push(`${i + 1}. ${name}`));
    lines.push("");
  }
  return lines.join("\n").trimEnd();
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

// ---- Courts -----------------------------------------------------------
// The club has seven courts. A termin stores the booked ones as text
// ("Court 1–3", "Court 2, 5") because every display site just prints it.

export const COURT_COUNT = 7;

// Reads the stored text (also older free-typed values like "1-3" or "Court 2,4")
// back into court numbers. Anything outside 1..COURT_COUNT is ignored.
export function parseCourts(text: string | null | undefined): number[] {
  if (!text) return [];
  const found = new Set<number>();
  for (const part of text.replace(/courts?/gi, "").split(/[,;&+/]|\bund\b/i)) {
    const range = part.match(/(\d+)\s*[-–—]\s*(\d+)/);
    if (range) {
      const [from, to] = [Number(range[1]), Number(range[2])].sort((a, b) => a - b);
      for (let n = from; n <= to; n++) found.add(n);
      continue;
    }
    const single = part.match(/\d+/);
    if (single) found.add(Number(single[0]));
  }
  return [...found].filter((n) => n >= 1 && n <= COURT_COUNT).sort((a, b) => a - b);
}

// 3+ consecutive courts collapse to a range: [1,2,3,5] -> "Court 1–3, 5".
export function formatCourts(selected: number[]): string {
  const nums = [...new Set(selected)].sort((a, b) => a - b);
  if (nums.length === 0) return "";
  const parts: string[] = [];
  let i = 0;
  while (i < nums.length) {
    let j = i;
    while (j + 1 < nums.length && nums[j + 1] === nums[j] + 1) j++;
    if (j - i >= 2) parts.push(`${nums[i]}–${nums[j]}`);
    else for (let k = i; k <= j; k++) parts.push(String(nums[k]));
    i = j + 1;
  }
  return `Court ${parts.join(", ")}`;
}

// "Court 3" -> labels the groups after the courts that were actually booked
// ("Court 1–4" booked -> group 1 is Court 1, ...). More groups than booked
// courts fall back to plain numbering.
export function courtGroupLabel(index: number, booked: number[]): string {
  return booked[index] !== undefined ? `Court ${booked[index]}` : `Gruppe ${index + 1}`;
}

// The courts that are really in use: if the groups are named after courts
// ("Court 1", "Court 2", ...) show exactly those — fewer players than booked
// courts means fewer courts. Falls back to the booked courts when the group
// names say nothing usable or name a court that was never booked.
export function courtsInUse(groupLabels: string[], bookedText: string): string {
  const used = new Set<number>();
  for (const label of groupLabels) {
    if (/^\s*court\s*\d+\s*$/i.test(label)) for (const n of parseCourts(label)) used.add(n);
  }
  if (used.size === 0) return bookedText;
  const booked = parseCourts(bookedText);
  if (booked.length > 0 && [...used].some((n) => !booked.includes(n))) return bookedText;
  return formatCourts([...used]);
}

// Overview line in the Termine list. While people are waiting for the
// allocation, how many wait matters more than 0/16.
export function registrationMeta(confirmed: number, pending: number, maxTn: number): string {
  if (pending > 0) return confirmed > 0 ? `${confirmed}/${maxTn} · ${pending} warten` : `${pending} warten`;
  return `${confirmed}/${maxTn}`;
}

// ---- Live -------------------------------------------------------------
// A training counts as "live" from a quarter hour before the start until a
// quarter hour after the end, so the trainers' live view is there while
// people arrive and for the last notes after the session.

const LIVE_MARGIN_MS = 15 * 60 * 1000;

export function isTerminLive(t: { type: string; date: string; start_time: string; end_time: string }, nowMs: number): boolean {
  if (t.type !== "training") return false;
  const start = terminDateTime(t.date, t.start_time).getTime();
  const end = terminDateTime(t.date, t.end_time).getTime();
  return nowMs >= start - LIVE_MARGIN_MS && nowMs <= end + LIVE_MARGIN_MS;
}

// "startet in 8 Min" / "noch 42 Min" / "beendet"
export function liveStatusText(t: { date: string; start_time: string; end_time: string }, nowMs: number): string {
  const start = terminDateTime(t.date, t.start_time).getTime();
  const end = terminDateTime(t.date, t.end_time).getTime();
  const minutes = (ms: number) => Math.max(1, Math.round(ms / 60000));
  if (nowMs < start) return `startet in ${minutes(start - nowMs)} Min`;
  if (nowMs <= end) return `noch ${minutes(end - nowMs)} Min`;
  return "gerade beendet";
}

// Which half of a "Training & Spiel" session it is right now (1 = before the
// changeover). Only meaningful during the session.
export function livePhase(t: CourtGroupTiming, nowMs: number): 1 | 2 {
  const now = new Date(nowMs);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  return nowMinutes < courtGroupSwitchMinutes(t) ? 1 : 2;
}

// ---- Geburtsdatum -----------------------------------------------------

// Whole years on a given day ("YYYY-MM-DD" -> 38).
export function ageOf(birthISO: string, on: Date = new Date()): number {
  const [y, m, d] = birthISO.split("-").map(Number);
  let age = on.getFullYear() - y;
  if (on.getMonth() + 1 < m || (on.getMonth() + 1 === m && on.getDate() < d)) age -= 1;
  return age;
}

// "03.05.1988 · 38 J."
export function birthLabel(birthISO: string): string {
  const [y, m, d] = birthISO.split("-");
  return `${d}.${m}.${y} · ${ageOf(birthISO)} J.`;
}

// Plausible date of birth typed or picked by a person.
export function isPlausibleBirthDate(iso: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const date = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(date.getTime())) return false;
  const todayISO = new Date().toISOString().slice(0, 10);
  return iso >= "1900-01-01" && iso <= todayISO;
}

// ---- Altersklassen ----------------------------------------------------
// Team planning: "Herren 35" may field everyone born in the year that makes
// them 35 or older by the season year (Jahrgang rule), so a 52-year-old counts
// for H35, H40, H45 and H50. "Offen" has no age limit.

export const AGE_CLASS_MINIMUMS = [0, 35, 40, 45, 50, 55, 60] as const;
export type AgeClassMin = (typeof AGE_CLASS_MINIMUMS)[number];

export function genderLabel(g: Gender): string {
  return g === "m" ? "Herr" : "Dame";
}

export function ageClassLabel(gender: Gender, min: AgeClassMin): string {
  return `${gender === "m" ? "Herren" : "Damen"} ${min === 0 ? "Offen" : min}`;
}

// Age by Jahrgang in a given season year (2026 - 1988 = 38).
export function ageInYear(birthISO: string, year: number): number {
  return year - Number(birthISO.slice(0, 4));
}

export function inAgeClass(birthISO: string | null | undefined, min: AgeClassMin, year: number): boolean {
  if (min === 0) return true;
  if (!birthISO) return false;
  return ageInYear(birthISO, year) >= min;
}

// Exactly inside the band of this class (35-39 for H35), not just eligible.
export function inAgeBand(birthISO: string | null | undefined, min: AgeClassMin, year: number): boolean {
  if (!birthISO) return false;
  const age = ageInYear(birthISO, year);
  const idx = AGE_CLASS_MINIMUMS.indexOf(min);
  const next = AGE_CLASS_MINIMUMS[idx + 1];
  if (min === 0) return age < (AGE_CLASS_MINIMUMS[1] as number);
  return age >= min && (next === undefined || age < next);
}

// "35–39" for H35, "60+" for the oldest class.
export function ageBandLabel(min: AgeClassMin): string {
  const next = AGE_CLASS_MINIMUMS[AGE_CLASS_MINIMUMS.indexOf(min) + 1];
  return next === undefined ? `${min}+` : `${min}–${next - 1}`;
}
