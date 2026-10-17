"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { queryKeys } from "./keys";

export interface NotesSummary {
  count: number;
  latest: string;
  latestAt: string;
}

// How many notes each player has and the newest one — for badges and previews
// in the trainer views. Admin-only (player_notes RLS); never persisted on the
// device (see queryPersist).
export function usePlayerNotesOverview() {
  return useQuery({
    queryKey: queryKeys.playerNotesOverview,
    queryFn: async (): Promise<Record<string, NotesSummary>> => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("player_notes")
        .select("user_id, note, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      const map: Record<string, NotesSummary> = {};
      for (const row of data) {
        const entry = map[row.user_id];
        if (entry) entry.count++;
        else map[row.user_id] = { count: 1, latest: row.note, latestAt: row.created_at };
      }
      return map;
    },
  });
}
