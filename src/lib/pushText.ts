import { dateLabel, hhmm } from "@/lib/domain";

// Every push the app sends is built here, so they all follow one shape:
//   title — one emoji + what happened, short enough to never truncate
//   body  — which termin (team · title), when, plus the one fact that matters
// No emoji in bodies, no claims that can be wrong ("heute Abend", "in 2 Std.").
// iOS shows roughly 4 lines of body on the lock screen, so bodies stay short;
// anything longer lives in the app behind the tap.

export interface PushMessage {
  title: string;
  body: string;
  // Same tag = a newer notification replaces the older one instead of
  // stacking (e.g. "opened" then "reminder" for one termin never pile up).
  // Always scoped to one termin/announcement — two different new termine
  // must never replace each other.
  tag: string;
}

const WEEKDAY_SHORT = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

// "Mi, 30.09., 18:00 Uhr"
export function pushWhen(dateISO: string, startTime: string): string {
  const day = WEEKDAY_SHORT[new Date(`${dateISO}T00:00:00`).getDay()];
  return `${day}, ${dateLabel(dateISO)}, ${hhmm(startTime)} Uhr`;
}

// "QTA · Training Mittwoch" — team code first when the termin belongs to
// exactly one team, same prefix the app uses everywhere else.
export function pushLabel(shortCode: string | null, title: string): string {
  return shortCode ? `${shortCode} · ${title}` : title;
}

function truncate(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

export const pushText = {
  terminCreated(p: { shortCode: string | null; title: string; date: string; startTime: string; location: string; terminId: string }): PushMessage {
    return {
      title: p.shortCode ? `🗓️ Neuer Termin · ${p.shortCode}` : "🗓️ Neuer Termin",
      body: `${p.title} · ${pushWhen(p.date, p.startTime)} · ${p.location}`,
      tag: `termin-created-${p.terminId}`,
    };
  },

  registrationOpen(p: { label: string; date: string; startTime: string; terminId: string }): PushMessage {
    return {
      title: "🔓 Anmeldung ist offen",
      body: `${p.label} · ${pushWhen(p.date, p.startTime)}`,
      tag: `termin-${p.terminId}`,
    };
  },

  reminder(p: { label: string; startTime: string; location: string | null; courts: string | null; terminId: string }): PushMessage {
    const where = [p.location, p.courts].filter(Boolean).join(", ");
    return {
      title: `🎾 Heute um ${hhmm(p.startTime)} Uhr`,
      body: where ? `${p.label} · ${where}` : p.label,
      tag: `termin-${p.terminId}`,
    };
  },

  waitlistPromoted(p: { label: string; date: string; startTime: string; terminId: string }): PushMessage {
    return {
      title: "⚡️ Du bist nachgerückt",
      body: `${p.label} · ${pushWhen(p.date, p.startTime)} — dein Platz ist jetzt bestätigt.`,
      tag: `termin-${p.terminId}`,
    };
  },

  allocationIn(p: { label: string; date: string; startTime: string; terminId: string }): PushMessage {
    return {
      title: "✅ Du bist dabei",
      body: `${p.label} · ${pushWhen(p.date, p.startTime)}`,
      tag: `termin-${p.terminId}`,
    };
  },

  allocationWaitlist(p: {
    label: string;
    date: string;
    startTime: string;
    terminId: string;
    waitlistPlace: number | null;
    rank: number | null;
    applicants: number | null;
    lastParticipation: string | null;
    neverParticipated: boolean;
  }): PushMessage {
    const place = p.waitlistPlace ? `Warteliste Platz ${p.waitlistPlace}` : "Warteliste";
    const rank = p.rank != null && p.applicants != null ? ` (Rang ${p.rank} von ${p.applicants} Bewerbern)` : "";
    // Newcomers haven't "paused" — they're waiting since they joined, so the
    // reason reads differently for them.
    const why = p.lastParticipation
      ? p.neverParticipated
        ? " Du warst bisher noch nie dabei — Vorrang hatten Spieler, die länger warten."
        : ` Zuletzt dabei am ${dateLabel(p.lastParticipation)} — Vorrang hatten Spieler, die länger pausiert haben.`
      : "";
    return {
      title: "⏳ Du stehst auf der Warteliste",
      body: `${p.label} · ${pushWhen(p.date, p.startTime)}\n${place}${rank}.${why}`,
      tag: `termin-${p.terminId}`,
    };
  },

  announcement(p: { shortCode: string | null; content: string; announcementId: string }): PushMessage {
    return {
      title: p.shortCode ? `📢 Ankündigung · ${p.shortCode}` : "📢 Neue Ankündigung",
      body: truncate(p.content, 120),
      tag: `announcement-${p.announcementId}`,
    };
  },

  allocationReady(p: { label: string; date: string; startTime: string; terminId: string }): PushMessage {
    return {
      title: "📋 Zuteilung wartet auf dich",
      body: `${p.label} · ${pushWhen(p.date, p.startTime)}\nVorschlag prüfen und bestätigen.`,
      tag: `allocation-${p.terminId}`,
    };
  },

  // To the Clubmanager: newcomers were put into court groups automatically.
  newcomersPlaced(p: {
    label: string;
    date: string;
    startTime: string;
    terminId: string;
    placed: { name: string; groupLabel: string }[];
    unplacedNames: string[];
  }): PushMessage {
    const parts = p.placed.map((x) => `${x.name} → ${x.groupLabel}`);
    if (p.unplacedNames.length > 0) parts.push(`${p.unplacedNames.join(", ")}: kein freier Court`);
    return {
      title: p.placed.length > 0 ? "👥 Nachrücker eingeteilt" : "👥 Nachrücker ohne Court",
      body: `${p.label} · ${pushWhen(p.date, p.startTime)}\n${truncate(parts.join(", "), 110)}. Bitte prüfen.`,
      tag: `placement-${p.terminId}`,
    };
  },
};
