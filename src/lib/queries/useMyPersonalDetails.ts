"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useProfile } from "./useProfile";
import type { PersonalDetails } from "./usePersonalDetails";

// The signed-in user's own date of birth and gender (null = not entered yet).
// Never persisted on the device (see queryPersist).
export function useMyPersonalDetails() {
  const { data: profile } = useProfile();
  return useQuery({
    queryKey: ["myPersonalDetails"] as const,
    queryFn: async (): Promise<PersonalDetails> => {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("get_my_personal_details");
      if (error) throw error;
      return data?.[0] ?? { birth_date: null, gender: null };
    },
    enabled: profile?.status === "approved" || profile?.role === "owner" || profile?.role === "trainer",
    retry: false,
  });
}
