"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { queryKeys } from "./keys";
import type { PlayerNote } from "@/types/database";

export function usePlayerNotes(userId: string | null) {
  return useQuery({
    queryKey: userId ? queryKeys.playerNotes(userId) : ["playerNotes", "none"],
    queryFn: async (): Promise<PlayerNote[]> => {
      if (!userId) return [];
      const supabase = createClient();
      const { data, error } = await supabase
        .from("player_notes")
        .select("id, user_id, author_id, note, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!userId,
  });
}
