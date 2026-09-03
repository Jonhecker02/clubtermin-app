"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { queryKeys } from "./keys";
import type { TerminCourtGroup } from "@/types/database";

export interface CourtGroupWithMembers extends TerminCourtGroup {
  member_ids: string[];
}

export function useTerminCourtGroups(terminId: string | null) {
  return useQuery({
    queryKey: terminId ? queryKeys.courtGroups(terminId) : ["courtGroups", "none"],
    queryFn: async (): Promise<CourtGroupWithMembers[]> => {
      if (!terminId) return [];
      const supabase = createClient();
      const { data: groups, error } = await supabase
        .from("termin_court_groups")
        .select("id, termin_id, label, trainer_name, trains_in_round, created_at")
        .eq("termin_id", terminId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      if (groups.length === 0) return [];

      const { data: members, error: membersError } = await supabase
        .from("termin_court_group_members")
        .select("group_id, user_id")
        .in(
          "group_id",
          groups.map((g) => g.id),
        );
      if (membersError) throw membersError;

      return groups.map((g) => ({
        ...g,
        member_ids: members.filter((m) => m.group_id === g.id).map((m) => m.user_id),
      }));
    },
    enabled: !!terminId,
  });
}
