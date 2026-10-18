import type { Profile, RegistrationStatus, Termin } from "@/types/database";

// Participation overview: for every player, out of the termine they could
// have joined in a period — how often they registered, how often they got a
// confirmed spot ("dabei"), how often they only ended up on the waitlist.
// "Dabei" means a confirmed spot, not a recorded attendance, and cancellations
// leave no trace (a cancelled registration is deleted).

export type Outcome = "dabei" | "warteliste" | "nicht";
export type Tier = "stamm" | "mittel" | "selten" | "neu";

export interface PlayerParticipation {
  userId: string;
  name: string;
  groupId: string | null;
  eligible: number;
  confirmed: number;
  waitlist: number;
  registered: number;
  confirmedRate: number | null;
  registeredRate: number | null;
  lastConfirmed: string | null;
  // Newest first.
  history: { terminId: string; date: string; title: string; outcome: Outcome }[];
  tier: Tier;
}

export interface ParticipationInput {
  termine: Termin[];
  registrations: { termin_id: string; user_id: string; status: RegistrationStatus }[];
  players: Pick<Profile, "id" | "name" | "group_id" | "created_at">[];
  // Only termine that ended before this moment and start on/after sinceISO.
  sinceISO: string | null;
  nowMs: number;
  types: Termin["type"][];
}

export const TIER_LABELS: Record<Tier, string> = {
  stamm: "Stammspieler",
  mittel: "Gelegentlich",
  selten: "Selten dabei",
  neu: "Neu",
};

function tierOf(eligible: number, confirmedRate: number | null): Tier {
  if (eligible < 3 || confirmedRate === null) return "neu";
  if (confirmedRate >= 0.6) return "stamm";
  if (confirmedRate >= 0.3) return "mittel";
  return "selten";
}

export function computeParticipation(input: ParticipationInput): PlayerParticipation[] {
  const { termine, registrations, players, sinceISO, nowMs, types } = input;

  const statusByKey = new Map<string, RegistrationStatus>();
  for (const r of registrations) statusByKey.set(`${r.termin_id}:${r.user_id}`, r.status);

  const past = termine
    .filter((t) => types.includes(t.type))
    .filter((t) => (sinceISO ? t.date >= sinceISO : true))
    .filter((t) => new Date(`${t.date}T${t.end_time}`).getTime() < nowMs)
    .sort((a, b) => (a.date + a.start_time < b.date + b.start_time ? 1 : -1)); // newest first

  return players.map((p) => {
    const joined = p.created_at.slice(0, 10);
    const history: PlayerParticipation["history"] = [];
    let confirmed = 0;
    let waitlist = 0;
    let lastConfirmed: string | null = null;

    for (const t of past) {
      const open = t.register_groups.includes("all") || (p.group_id !== null && t.register_groups.includes(p.group_id));
      if (!open || t.date < joined) continue;
      const status = statusByKey.get(`${t.id}:${p.id}`);
      const outcome: Outcome = status === "angemeldet" ? "dabei" : status === "warteliste" || status === "ausstehend" ? "warteliste" : "nicht";
      if (outcome === "dabei") {
        confirmed++;
        if (lastConfirmed === null) lastConfirmed = t.date; // newest first
      } else if (outcome === "warteliste") {
        waitlist++;
      }
      history.push({ terminId: t.id, date: t.date, title: t.title, outcome });
    }

    const eligible = history.length;
    const registered = confirmed + waitlist;
    const confirmedRate = eligible > 0 ? confirmed / eligible : null;
    return {
      userId: p.id,
      name: p.name,
      groupId: p.group_id,
      eligible,
      confirmed,
      waitlist,
      registered,
      confirmedRate,
      registeredRate: eligible > 0 ? registered / eligible : null,
      lastConfirmed,
      history,
      tier: tierOf(eligible, confirmedRate),
    };
  });
}
