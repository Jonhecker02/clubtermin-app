"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export function useIcalToken(enabled: boolean) {
  return useQuery({
    queryKey: ["ical-token"],
    queryFn: async (): Promise<string> => {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("get_my_ical_token");
      if (error) throw error;
      return data;
    },
    enabled,
    staleTime: Infinity,
  });
}
