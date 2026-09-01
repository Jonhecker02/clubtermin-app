"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { queryKeys } from "./keys";
import type { RegistrationStatus } from "@/types/database";

export interface RegistrationWithProfile {
  id: string;
  user_id: string;
  status: RegistrationStatus;
  created_at: string;
  name: string;
  email: string;
}

export function useRegistrationsForTermin(terminId: string | null) {
  return useQuery({
    queryKey: terminId ? queryKeys.registrations(terminId) : ["registrations", "none"],
    queryFn: async (): Promise<RegistrationWithProfile[]> => {
      if (!terminId) return [];
      const supabase = createClient();
      // Embeds the profile via the registrations.user_id -> profiles.id FK in
      // a single round trip instead of a separate follow-up query — halves
      // the network cost of every registrations fetch (profiles RLS/grants in
      // 0001_init.sql already allow reading name/email this way).
      const { data, error } = await supabase
        .from("registrations")
        .select("id, user_id, status, created_at, profiles(name, email)")
        .eq("termin_id", terminId)
        .order("created_at", { ascending: true });
      if (error) throw error;

      return data.map((r) => ({
        id: r.id,
        user_id: r.user_id,
        status: r.status,
        created_at: r.created_at,
        name: r.profiles?.name ?? "—",
        email: r.profiles?.email ?? "",
      }));
    },
    enabled: !!terminId,
  });
}

// Registered ("angemeldet") counts per termin, for the list overview — RLS
// already scopes the rows to termine the caller may see, same as useTermine().
export function useRegistrationCounts() {
  return useQuery({
    queryKey: queryKeys.registrationCounts,
    queryFn: async (): Promise<Record<string, number>> => {
      const supabase = createClient();
      const { data, error } = await supabase.from("registrations").select("termin_id").eq("status", "angemeldet");
      if (error) throw error;

      const counts: Record<string, number> = {};
      for (const r of data) counts[r.termin_id] = (counts[r.termin_id] ?? 0) + 1;
      return counts;
    },
  });
}

export function useMyRegistrations(userId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.myRegistrations,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("registrations")
        .select("id, termin_id, status, created_at")
        .eq("user_id", userId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!userId,
  });
}
