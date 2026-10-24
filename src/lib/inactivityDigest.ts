import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, RegistrationStatus, Termin } from "@/types/database";
import { computeParticipation, findCheckInCandidates, type CheckInCandidate } from "@/lib/participation";

const PAGE = 1000;

// Server-side twin of the "Mal nachfragen" card on the Teilnahme page: who of
// the regular team members has not registered for a single training in the
// last `weeks` weeks. Used by the weekly Clubmanager push.
export async function loadCheckInCandidates(service: SupabaseClient<Database>, weeks: number): Promise<CheckInCandidate[]> {
  const nowMs = Date.now();
  const since = new Date(nowMs - 400 * 86400000).toISOString().slice(0, 10);

  const { data: termine } = await service.from("termine").select("*").gte("date", since);
  const { data: profiles } = await service
    .from("profiles")
    .select("id, name, group_id, created_at, is_guest")
    .eq("status", "approved")
    .eq("is_guest", false)
    .not("group_id", "is", null);
  if (!termine || !profiles) return [];

  const registrations: { termin_id: string; user_id: string; status: RegistrationStatus }[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await service
      .from("registrations")
      .select("termin_id, user_id, status, termine!inner(date)")
      .gte("termine.date", since)
      .order("termin_id", { ascending: true })
      .order("user_id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error || !data) break;
    for (const r of data) registrations.push({ termin_id: r.termin_id, user_id: r.user_id, status: r.status });
    if (data.length < PAGE) break;
  }

  const rows = computeParticipation({
    termine: termine as Termin[],
    registrations,
    players: profiles,
    sinceISO: null,
    nowMs,
    types: ["training"],
  });
  const joined = new Map(profiles.map((p) => [p.id, p.created_at.slice(0, 10)]));
  return findCheckInCandidates(rows, joined, weeks, nowMs);
}
