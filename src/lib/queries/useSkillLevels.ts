"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { queryKeys } from "./keys";

// Trainer/owner-only ("Spielstärke") — is_trainer_or_owner()-gated on the
// RPC itself; skill_level isn't in the general profiles column grant, so
// this RPC is the only way to read it at all.
export function useSkillLevels() {
  return useQuery({
    queryKey: queryKeys.skillLevels,
    queryFn: async (): Promise<Record<string, number | null>> => {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("get_skill_levels");
      if (error) throw error;
      const map: Record<string, number | null> = {};
      for (const row of data ?? []) map[row.user_id] = row.skill_level;
      return map;
    },
  });
}
