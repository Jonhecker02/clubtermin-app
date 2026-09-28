"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { queryKeys } from "./keys";

// The player's own row from the last fair-rotation allocation run for this
// termin (if any) — registration_allocations is admin-only by default, but
// carries a second RLS policy (user_id = auth.uid()) letting a player read
// just their own row, which is where the "why am I not in" reason lives.
export function useMyAllocation(terminId: string | null, userId: string | null) {
  return useQuery({
    queryKey: terminId ? queryKeys.myAllocation(terminId) : ["myAllocation", "none"],
    queryFn: async (): Promise<{ quote: number | null; included: boolean } | null> => {
      if (!terminId || !userId) return null;
      const supabase = createClient();
      const { data, error } = await supabase
        .from("registration_allocations")
        .select("quote, included")
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
