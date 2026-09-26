"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { queryKeys } from "./keys";

export function useWaitlistRank(terminId: string | null) {
  return useQuery({
    queryKey: terminId ? queryKeys.waitlistRank(terminId) : ["waitlistRank", "none"],
    queryFn: async (): Promise<Record<string, number>> => {
      if (!terminId) return {};
      const supabase = createClient();
      const { data, error } = await supabase.rpc("get_waitlist_rank", { p_termin_id: terminId });
      if (error) throw error;
      const map: Record<string, number> = {};
      for (const row of data ?? []) map[row.user_id] = row.rank_order;
      return map;
    },
    enabled: !!terminId,
  });
}
