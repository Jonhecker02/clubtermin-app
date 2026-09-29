import { randomBytes } from "node:crypto";

// Shared by create-user and reset-password — both hand out a fresh
// initials+group-short_code password that gets communicated out of band
// (there's no email to send it to).
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  const first = parts[0][0];
  const last = parts[parts.length - 1][0];
  return (first + last).toUpperCase();
}

// Excludes 0/O/1/I/L — the initials+short_code prefix makes the password
// guessable from public info alone (anyone who knows a member's name and
// team could compute it), so a random suffix is what actually makes it
// safe; this alphabet just keeps that suffix easy to read back over chat.
const SUFFIX_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export function randomSuffix(length: number): string {
  return Array.from(randomBytes(length), (b) => SUFFIX_ALPHABET[b % SUFFIX_ALPHABET.length]).join("");
}

// No group short_code to lean on (trainer without a Mannschaft) — a longer
// random suffix keeps the entropy comparable instead.
export function generatePassword(name: string, shortCode: string): string {
  const initialsPart = initials(name);
  return shortCode ? `${initialsPart}${shortCode}-${randomSuffix(5)}` : `${initialsPart}-${randomSuffix(7)}`;
}
