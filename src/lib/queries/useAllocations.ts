"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { queryKeys } from "./keys";

export interface AllocationEntry {
  id: string;
  user_id: string;
  quote: number | null;
  included: boolean;
  excluded_from_rotation: boolean;
  decided_at: string;
  name: string;
}

// Admin-only ("Zuteilung erklären") — RLS already restricts
// registration_allocations to admins, this just joins in the player name.
export function useAllocationsForTermin(terminId: string | null) {
  return useQuery({
    queryKey: terminId ? queryKeys.allocations(terminId) : ["allocations", "none"],
    queryFn: async (): Promise<AllocationEntry[]> => {
      if (!terminId) return [];
      const supabase = createClient();
      const { data: allocations, error } = await supabase
        .from("registration_allocations")
        .select("id, user_id, quote, included, excluded_from_rotation, decided_at")
        .eq("termin_id", terminId);
      if (error) throw error;
      if (allocations.length === 0) return [];

      const userIds = [...new Set(allocations.map((a) => a.user_id))];
      const { data: profiles, error: profilesError } = await supabase.from("profiles").select("id, name").in("id", userIds);
      if (profilesError) throw profilesError;

      const byId = new Map(profiles.map((p) => [p.id, p.name]));
      return allocations
        .map((a) => ({ ...a, name: byId.get(a.user_id) ?? "—" }))
        .sort((a, b) => (b.quote ?? -1) - (a.quote ?? -1) || (a.included === b.included ? 0 : a.included ? -1 : 1));
    },
    enabled: !!terminId,
  });
}
