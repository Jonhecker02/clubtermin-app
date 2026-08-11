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
      const { data: registrations, error } = await supabase
        .from("registrations")
        .select("id, user_id, status, created_at")
        .eq("termin_id", terminId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      if (registrations.length === 0) return [];

      const userIds = [...new Set(registrations.map((r) => r.user_id))];
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id, name, email")
        .in("id", userIds);
      if (profilesError) throw profilesError;

      const byId = new Map(profiles.map((p) => [p.id, p]));
      return registrations.map((r) => ({
        ...r,
        name: byId.get(r.user_id)?.name ?? "—",
        email: byId.get(r.user_id)?.email ?? "",
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
