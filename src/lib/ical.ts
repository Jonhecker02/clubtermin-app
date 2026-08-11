import type { IcalEvent } from "@/types/database";

// Wall-clock date+time -> iCal local format (YYYYMMDDTHHMMSS), paired with
// TZID=Europe/Berlin in the caller. Apple/Google/Outlook all resolve that
// IANA name from their own tz database, so no embedded VTIMEZONE is needed.
function toIcalLocal(date: string, time: string): string {
  return `${date.replace(/-/g, "")}T${time.replace(/:/g, "").padEnd(6, "0")}`;
}

function toIcalUtc(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
}

function escapeText(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

// Long lines must be folded at 75 octets per RFC 5545; keeps clients that
// enforce this (some do) from silently truncating descriptions/locations.
function foldLine(line: string): string {
  if (line.length <= 75) return line;
  const chunks: string[] = [];
  let rest = line;
  while (rest.length > 75) {
    chunks.push(rest.slice(0, 75));
    rest = " " + rest.slice(75);
  }
  chunks.push(rest);
  return chunks.join("\r\n");
}

export function buildIcs(events: IcalEvent[]): string {
  const now = toIcalUtc(new Date());
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//The Padellers//Trainingsanmeldung//DE",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:The Padellers",
    // Both are just hints — clients poll on their own schedule and neither
    // property is universally honored (Apple/Google/Outlook differ, and some
    // ignore both). PT4H keeps cancellations/promotions from lagging too long
    // once a client does check in.
    "REFRESH-INTERVAL;VALUE=DURATION:PT4H",
    "X-PUBLISHED-TTL:PT4H",
  ];

  for (const e of events) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${e.id}@the-padellers-app`,
      `DTSTAMP:${now}`,
      `DTSTART;TZID=Europe/Berlin:${toIcalLocal(e.date, e.start_time)}`,
      `DTEND;TZID=Europe/Berlin:${toIcalLocal(e.date, e.end_time)}`,
      `SUMMARY:${escapeText(e.title)}`,
    );
    if (e.location) lines.push(`LOCATION:${escapeText(e.location)}`);
    if (e.description) lines.push(`DESCRIPTION:${escapeText(e.description)}`);
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join("\r\n");
}
