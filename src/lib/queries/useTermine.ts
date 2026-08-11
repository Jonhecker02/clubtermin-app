"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { queryKeys } from "./keys";
import type { Termin } from "@/types/database";

export function useTermine() {
  return useQuery({
    queryKey: queryKeys.termine,
    queryFn: async (): Promise<Termin[]> => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("termine")
        .select("*")
        .order("date", { ascending: true })
        .order("start_time", { ascending: true });
      if (error) throw error;
      return data;
    },
  });
}
