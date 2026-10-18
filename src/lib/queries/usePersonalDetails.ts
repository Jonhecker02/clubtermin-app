"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useProfile } from "./useProfile";
import type { Gender } from "@/types/database";

export interface PersonalDetails {
  birth_date: string | null;
  gender: Gender | null;
}

// Date of birth and gender of every player, for admins/trainers only (the RPC
// refuses anyone else and the query doesn't even run for them). Never
// persisted on the device (see queryPersist).
export function usePersonalDetails() {
  const { data: profile } = useProfile();
  const isAdmin = profile?.role === "owner" || profile?.role === "trainer" || profile?.role === "captain";
  return useQuery({
    queryKey: ["personalDetails"] as const,
    queryFn: async (): Promise<Record<string, PersonalDetails>> => {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("get_personal_details");
      if (error) throw error;
      const map: Record<string, PersonalDetails> = {};
      for (const row of data ?? []) map[row.user_id] = { birth_date: row.birth_date, gender: row.gender };
      return map;
    },
    enabled: isAdmin,
    retry: false,
  });
}
