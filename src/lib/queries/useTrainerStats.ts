"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { queryKeys } from "./keys";
import type { PlayerTrainerStat } from "@/types/database";

// "Wer wie oft bei welchem Trainer trainiert hat" — is_admin()-gated on the
// RPC, same population as get_player_attendance_stats().
export function useTrainerStats() {
  return useQuery({
    queryKey: queryKeys.trainerStats,
    queryFn: async (): Promise<PlayerTrainerStat[]> => {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("get_player_trainer_stats");
      if (error) throw error;
      return data ?? [];
    },
  });
}
