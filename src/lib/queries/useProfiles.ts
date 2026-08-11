"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { queryKeys } from "./keys";
import type { Profile } from "@/types/database";

// Admin-only screens (Gruppen-Mitglieder, Anfragen, Rollen); RLS still applies.
export function useProfiles() {
  return useQuery({
    queryKey: queryKeys.profiles,
    queryFn: async (): Promise<Profile[]> => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("profiles")
        .select("id, name, email, role, group_id, status, created_at")
        .order("name");
      if (error) throw error;
      return data;
    },
  });
}
