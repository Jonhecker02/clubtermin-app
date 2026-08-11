"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { queryKeys } from "./keys";
import type { Profile } from "@/types/database";

export function useProfile() {
  return useQuery({
    queryKey: queryKeys.profile,
    queryFn: async (): Promise<Profile> => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("not_authenticated");
      const { data, error } = await supabase
        .from("profiles")
        .select("id, name, email, role, group_id, status, created_at")
        .eq("id", user.id)
        .single();
      if (error) throw error;
      return data;
    },
    staleTime: 60_000,
  });
}
