"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { queryKeys } from "./keys";
import type { SpieltagGame, SpieltagMatch } from "@/types/database";

export interface SpieltagData {
  matches: SpieltagMatch[];
  games: SpieltagGame[];
}

// Every Begegnung and Spiel the signed-in person may see (the database only
// hands out those of Spieltage they can see). One club has a few dozen rows
// per season, so everything is fetched once and grouped on the client.
export function useSpieltagData() {
  return useQuery({
    queryKey: queryKeys.spieltag,
    queryFn: async (): Promise<SpieltagData> => {
      const supabase = createClient();
      const [matches, games] = await Promise.all([
        supabase.from("spieltag_matches").select("*").order("position").order("created_at"),
        supabase.from("spieltag_games").select("*").order("position").order("created_at"),
      ]);
      if (matches.error) throw matches.error;
      if (games.error) throw games.error;
      return { matches: matches.data, games: games.data as SpieltagGame[] };
    },
  });
}

// id -> display name for the players shown in the results.
export function usePlayerNames(ids: string[]) {
  const unique = [...new Set(ids)].sort();
  return useQuery({
    queryKey: ["playerNames", unique],
    queryFn: async (): Promise<Record<string, string>> => {
      const supabase = createClient();
      const { data, error } = await supabase.from("profiles").select("id, name").in("id", unique);
      if (error) throw error;
      return Object.fromEntries(data.map((p) => [p.id, p.name]));
    },
    enabled: unique.length > 0,
    staleTime: 5 * 60_000,
  });
}
