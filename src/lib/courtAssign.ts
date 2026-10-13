// Automatic court assignment: players of similar level share a court, and
// who trains with whom rotates based on who recently shared a court.
// Pure and dependency-free so it can be tested on its own.

export interface AssignPlayer {
  id: string;
  // Spielstärke 0-5 as entered by trainers/owner, null = not rated (or not
  // visible to the current user, e.g. a captain).
  level: number | null;
}

// partnerCounts[a][b] = how often a and b recently shared a court.
export type PartnerCounts = Record<string, Record<string, number>>;

export const COURT_SIZE = 4;

// Weight of level differences vs. repeated pairings. Levels dominate (a pair
// that played together once never outweighs a one-level mismatch), but a
// pair that has shared a court many times can pull in a neighbouring level.
const LEVEL_WEIGHT = 10;
const RESTARTS = 40;

// 16 players -> 4 courts of 4. Anything that doesn't divide evenly gets the
// fewest courts that fit (courts seat at most 4) with sizes as even as
// possible, e.g. 14 -> 4,4,3,3 rather than 4,4,4,2.
export function minCourts(playerCount: number): number {
  return Math.max(1, Math.ceil(playerCount / COURT_SIZE));
}

export function courtSizes(playerCount: number, courts: number): number[] {
  if (playerCount <= 0) return [];
  const n = Math.min(Math.max(courts, minCourts(playerCount)), playerCount);
  const base = Math.floor(playerCount / n);
  const extra = playerCount % n;
  return Array.from({ length: n }, (_, i) => base + (i < extra ? 1 : 0));
}

// Small deterministic PRNG so the same termin + seed always gives the same
// proposal ("Neu mischen" just bumps the seed).
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashSeed(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function pairCount(counts: PartnerCounts, a: string, b: string): number {
  return counts[a]?.[b] ?? counts[b]?.[a] ?? 0;
}

function median(values: number[]): number {
  if (values.length === 0) return 2.5;
  const s = [...values].sort((x, y) => x - y);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export interface AssignResult {
  // Court 1 = strongest; each entry is the player ids on that court.
  courts: string[][];
  unrated: number;
  // Pairs on the same court that also shared one recently.
  repeatedPairs: number;
}

export function autoAssign(input: {
  players: AssignPlayer[];
  partnerCounts: PartnerCounts;
  courts?: number;
  seed: number;
}): AssignResult {
  const { players, partnerCounts, seed } = input;
  const sizes = courtSizes(players.length, input.courts ?? minCourts(players.length));
  if (sizes.length === 0) return { courts: [], unrated: 0, repeatedPairs: 0 };

  const rated = players.filter((p) => p.level !== null).map((p) => p.level as number);
  const fallbackLevel = median(rated);
  const level = new Map(players.map((p) => [p.id, p.level ?? fallbackLevel]));
  const unrated = players.length - rated.length;

  function courtCost(ids: string[]): number {
    const mean = ids.reduce((s, id) => s + level.get(id)!, 0) / ids.length;
    let cost = 0;
    for (const id of ids) cost += (level.get(id)! - mean) ** 2 * LEVEL_WEIGHT;
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const c = pairCount(partnerCounts, ids[i], ids[j]);
        cost += c * c;
      }
    }
    return cost;
  }

  let best: string[][] | null = null;
  let bestCost = Infinity;

  for (let attempt = 0; attempt < RESTARTS; attempt++) {
    const rand = mulberry32(seed + attempt * 7919);
    // Strongest first; equal levels in random order, which is what lets
    // repeated restarts explore different pairings among equal players.
    const order = players
      .map((p) => ({ id: p.id, key: level.get(p.id)!, tie: rand() }))
      .sort((a, b) => b.key - a.key || a.tie - b.tie)
      .map((p) => p.id);

    const courts: string[][] = [];
    let at = 0;
    for (const size of sizes) {
      courts.push(order.slice(at, at + size));
      at += size;
    }

    // Swap players between courts while it lowers the total cost.
    let improved = true;
    let guard = 0;
    while (improved && guard++ < 100) {
      improved = false;
      for (let a = 0; a < courts.length; a++) {
        for (let b = a + 1; b < courts.length; b++) {
          for (let i = 0; i < courts[a].length; i++) {
            for (let j = 0; j < courts[b].length; j++) {
              const before = courtCost(courts[a]) + courtCost(courts[b]);
              const na = [...courts[a]];
              const nb = [...courts[b]];
              [na[i], nb[j]] = [nb[j], na[i]];
              if (courtCost(na) + courtCost(nb) < before - 1e-9) {
                courts[a] = na;
                courts[b] = nb;
                improved = true;
              }
            }
          }
        }
      }
    }

    const total = courts.reduce((s, c) => s + courtCost(c), 0);
    if (total < bestCost - 1e-9) {
      bestCost = total;
      best = courts;
    }
  }

  const finalCourts = (best ?? []).map((c) => [...c]);
  // Strongest court first, so "Court 1" is always the top level.
  const mean = (ids: string[]) => ids.reduce((s, id) => s + level.get(id)!, 0) / ids.length;
  finalCourts.sort((a, b) => mean(b) - mean(a));
  for (const court of finalCourts) court.sort((a, b) => level.get(b)! - level.get(a)!);

  let repeatedPairs = 0;
  for (const court of finalCourts) {
    for (let i = 0; i < court.length; i++) {
      for (let j = i + 1; j < court.length; j++) {
        if (pairCount(partnerCounts, court[i], court[j]) > 0) repeatedPairs++;
      }
    }
  }
  return { courts: finalCourts, unrated, repeatedPairs };
}

// Which court trains with the trainer in round 1 vs. round 2. The round
// should alternate fairly over time: courts whose players had round 1 less
// often so far (lower quote) go first. Always an even split (rounded up for
// round 1); with no signal at all it alternates court 1, 3, 5… so each round
// gets a mix of levels instead of "all strong courts first".
export function assignRounds(courts: string[][], quotes: Record<string, number>): (1 | 2)[] {
  const meanQuote = courts.map((ids) => {
    const known = ids.filter((id) => quotes[id] !== undefined).map((id) => quotes[id]);
    return known.length > 0 ? known.reduce((s, q) => s + q, 0) / known.length : 0.5;
  });
  const order = courts
    .map((_, i) => i)
    .sort((a, b) => meanQuote[a] - meanQuote[b] || (a % 2) - (b % 2) || a - b);
  const firstRound = new Set(order.slice(0, Math.ceil(courts.length / 2)));
  return courts.map((_, i) => (firstRound.has(i) ? 1 : 2));
}
