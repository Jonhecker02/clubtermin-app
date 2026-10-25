import type { SpieltagGame, SpieltagMatch } from "@/types/database";

export type SetScore = [number, number];

export interface GameResult {
  setsUs: number;
  setsThem: number;
  // null while nothing is entered or the sets are level.
  winner: "us" | "them" | null;
}

export function gameResult(sets: SetScore[]): GameResult {
  let setsUs = 0;
  let setsThem = 0;
  for (const [us, them] of sets) {
    if (us > them) setsUs += 1;
    else if (them > us) setsThem += 1;
  }
  const winner = setsUs > setsThem ? "us" : setsThem > setsUs ? "them" : null;
  return { setsUs, setsThem, winner };
}

export interface MatchScore {
  us: number;
  them: number;
  // Games with a decided winner / all games of the Begegnung.
  decided: number;
  total: number;
  outcome: "win" | "loss" | "draw" | null;
}

// "2 : 1" for a Begegnung with three doubles. The outcome only shows once
// every Spiel has a winner — before that it is still running.
export function matchScore(games: SpieltagGame[]): MatchScore {
  let us = 0;
  let them = 0;
  let decided = 0;
  for (const g of games) {
    const r = gameResult(g.sets);
    if (r.winner === "us") us += 1;
    if (r.winner === "them") them += 1;
    if (r.winner) decided += 1;
  }
  const total = games.length;
  const outcome = total > 0 && decided === total ? (us > them ? "win" : them > us ? "loss" : "draw") : null;
  return { us, them, decided, total, outcome };
}

export interface SpieltagScore extends MatchScore {
  matches: number;
}

// Whole Spieltag: Spiele won over all Begegnungen, and how many Begegnungen
// were won / lost / drawn.
export function spieltagScore(matches: SpieltagMatch[], games: SpieltagGame[]): SpieltagScore & { won: number; lost: number; drawn: number } {
  let us = 0;
  let them = 0;
  let decided = 0;
  let total = 0;
  let won = 0;
  let lost = 0;
  let drawn = 0;
  for (const m of matches) {
    const s = matchScore(games.filter((g) => g.match_id === m.id));
    us += s.us;
    them += s.them;
    decided += s.decided;
    total += s.total;
    if (s.outcome === "win") won += 1;
    if (s.outcome === "loss") lost += 1;
    if (s.outcome === "draw") drawn += 1;
  }
  const outcome = total > 0 && decided === total ? (us > them ? "win" : them > us ? "loss" : "draw") : null;
  return { us, them, decided, total, outcome, matches: matches.length, won, lost, drawn };
}

export const OUTCOME_LABEL: Record<"win" | "loss" | "draw", string> = { win: "Sieg", loss: "Niederlage", draw: "Unentschieden" };

// "6:3 4:6 10:8"
export function setsText(sets: SetScore[]): string {
  return sets.map(([a, b]) => `${a}:${b}`).join("  ");
}

// Accepts what the editor produces; drops incomplete rows. Scores are small
// non-negative integers.
export function cleanSets(rows: { us: string; them: string }[]): SetScore[] | null {
  const out: SetScore[] = [];
  for (const r of rows) {
    if (r.us.trim() === "" && r.them.trim() === "") continue;
    const us = Number(r.us);
    const them = Number(r.them);
    if (!Number.isInteger(us) || !Number.isInteger(them) || us < 0 || them < 0 || us > 99 || them > 99) return null;
    out.push([us, them]);
  }
  return out;
}
