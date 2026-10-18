"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { RegistrationStatus } from "@/types/database";

export interface HistoryRegistration {
  termin_id: string;
  user_id: string;
  status: RegistrationStatus;
}

const PAGE = 1000;
const HISTORY_DAYS = 400;

// Every registration for termine of roughly the last year, for the
// participation overview (admins only — RLS). PostgREST hands out at most
// 1000 rows per request, so this pages until everything is in.
export function useRegistrationHistory() {
  return useQuery({
    queryKey: ["registrationHistory"] as const,
    queryFn: async (): Promise<HistoryRegistration[]> => {
      const supabase = createClient();
      const since = new Date(Date.now() - HISTORY_DAYS * 86400000).toISOString().slice(0, 10);
      const all: HistoryRegistration[] = [];
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await supabase
          .from("registrations")
          .select("termin_id, user_id, status, termine!inner(date)")
          .gte("termine.date", since)
          .order("termin_id", { ascending: true })
          .order("user_id", { ascending: true })
          .range(from, from + PAGE - 1);
        if (error) throw error;
        for (const r of data) all.push({ termin_id: r.termin_id, user_id: r.user_id, status: r.status });
        if (data.length < PAGE) break;
      }
      return all;
    },
    staleTime: 60_000,
  });
}
