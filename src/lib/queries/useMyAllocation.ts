"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { queryKeys } from "./keys";

export interface MyAllocation {
  included: boolean;
  excluded_from_rotation: boolean;
  rank_order: number | null;
  applicant_count: number | null;
  last_participation: string | null;
  never_participated: boolean;
}

// The player's own row from the last fair-rotation allocation run for this
// termin (if any) — registration_allocations is admin-only by default, but
// carries a second RLS policy (user_id = auth.uid()) letting a player read
// just their own row, which is where the "why" lives.
export function useMyAllocation(terminId: string | null, userId: string | null) {
  return useQuery({
    queryKey: terminId ? queryKeys.myAllocation(terminId) : ["myAllocation", "none"],
    queryFn: async (): Promise<MyAllocation | null> => {
      if (!terminId || !userId) return null;
      const supabase = createClient();
      const { data, error } = await supabase
        .from("registration_allocations")
        .select("included, excluded_from_rotation, rank_order, applicant_count, last_participation, never_participated")
        .eq("termin_id", terminId)
        .eq("user_id", userId)
        .order("decided_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!terminId && !!userId,
  });
}
