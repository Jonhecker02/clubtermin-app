"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { queryKeys } from "./keys";
import type { Group } from "@/types/database";

export function useGroups() {
  return useQuery({
    queryKey: queryKeys.groups,
    queryFn: async (): Promise<Group[]> => {
      const supabase = createClient();
      const { data, error } = await supabase.from("groups").select("*").order("name");
      if (error) throw error;
      return data;
    },
    staleTime: 60_000,
  });
}
