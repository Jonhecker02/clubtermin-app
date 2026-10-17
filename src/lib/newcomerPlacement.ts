import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { suggestGroupFor, type PartnerCounts } from "@/lib/courtAssign";

export interface PlacementResult {
  // Newcomers that were put into a court group.
  placed: { userId: string; name: string; groupLabel: string }[];
  // Confirmed players that fit nowhere (every court is full).
  unplaced: { userId: string; name: string }[];
  // Players dropped from the groups because they are no longer confirmed.
  removed: number;
}

const NOTHING: PlacementResult = { placed: [], unplaced: [], removed: 0 };

// Keeps a training's court groups in step with who is actually confirmed.
// Only acts when groups already exist (they are drawn by the Clubmanager):
//   1. players who left (cancelled, removed) are taken out of their group,
//   2. every confirmed player without a group — a Nachrücker, someone who
//      moved up from the waitlist, a late manual addition — is put on the
//      court that fits best, by the SAME rule as the automatic assignment:
//      level first, then who they recently shared a court with.
// The placement is saved right away and stays; the Clubmanager is told by
// push so they can check it. Idempotent: calling it again changes nothing.
export async function placeNewcomers(service: SupabaseClient<Database>, terminId: string): Promise<PlacementResult> {
  const { data: termin } = await service
    .from("termine")
    .select("id, type, register_groups")
    .eq("id", terminId)
    .single();
  if (!termin || termin.type !== "training") return NOTHING;

  const { data: groups } = await service
    .from("termin_court_groups")
    .select("id, label, created_at")
    .eq("termin_id", terminId)
    .order("created_at", { ascending: true });
  if (!groups || groups.length === 0) return NOTHING;

  const { data: members } = await service
    .from("termin_court_group_members")
    .select("group_id, user_id")
    .in(
      "group_id",
      groups.map((g) => g.id),
    );

  const { data: confirmed } = await service
    .from("registrations")
    .select("user_id, created_at, profiles(name)")
    .eq("termin_id", terminId)
    .eq("status", "angemeldet")
    .order("created_at", { ascending: true });
  const confirmedIds = new Set((confirmed ?? []).map((r) => r.user_id));
  const nameOf = new Map((confirmed ?? []).map((r) => [r.user_id, r.profiles?.name ?? "—"]));

  // 1. Free the seats of people who are gone.
  let current = members ?? [];
  const gone = current.filter((m) => !confirmedIds.has(m.user_id));
  for (const m of gone) {
    await service.from("termin_court_group_members").delete().eq("group_id", m.group_id).eq("user_id", m.user_id);
  }
  current = current.filter((m) => confirmedIds.has(m.user_id));

  // Nothing grouped at all (e.g. everyone left): not a grouping worth extending.
  if (current.length === 0) return { ...NOTHING, removed: gone.length };

  const placedIds = new Set(current.map((m) => m.user_id));
  const newcomers = (confirmed ?? []).filter((r) => !placedIds.has(r.user_id));
  if (newcomers.length === 0) return { ...NOTHING, removed: gone.length };

  // 2. Levels (trainer-only data, so it is read with the service role) and
  // recent partners of this club team.
  const untyped = service as unknown as SupabaseClient;
  const involved = [...new Set([...current.map((m) => m.user_id), ...newcomers.map((r) => r.user_id)])];
  const { data: levelRows } = await untyped.from("profiles").select("id, skill_level").in("id", involved);
  const levelOf = new Map<string, number | null>(
    (levelRows ?? []).map((r: { id: string; skill_level: number | null }) => [
      r.id,
      r.skill_level === null || r.skill_level === undefined ? null : Number(r.skill_level),
    ]),
  );

  const partnerCounts = await loadPartnerCounts(service, termin.register_groups, terminId);

  const working = groups.map((g) => ({
    key: g.id,
    label: g.label,
    members: current
      .filter((m) => m.group_id === g.id)
      .map((m) => ({ id: m.user_id, level: levelOf.get(m.user_id) ?? null })),
  }));

  const result: PlacementResult = { placed: [], unplaced: [], removed: gone.length };
  for (const n of newcomers) {
    const player = { id: n.user_id, level: levelOf.get(n.user_id) ?? null };
    const key = suggestGroupFor(player, working, partnerCounts);
    const target = key ? working.find((g) => g.key === key) : undefined;
    if (!target) {
      result.unplaced.push({ userId: n.user_id, name: nameOf.get(n.user_id) ?? "—" });
      continue;
    }
    const { error } = await service.from("termin_court_group_members").insert({ group_id: target.key, user_id: n.user_id });
    if (error) continue; // lost a race with another call — it is placed by now
    target.members.push(player);
    result.placed.push({ userId: n.user_id, name: nameOf.get(n.user_id) ?? "—", groupLabel: target.label });
  }
  return result;
}

// Same window as get_recent_partners (the club team's last 10 trainings with
// groups), computed here because that RPC is admin-only and a server call
// has no signed-in admin.
async function loadPartnerCounts(
  service: SupabaseClient<Database>,
  registerGroups: string[],
  terminId: string,
): Promise<PartnerCounts> {
  if (registerGroups.length !== 1 || registerGroups[0] === "all") return {};

  const { data: past } = await service
    .from("termine")
    .select("id, date, start_time")
    .eq("type", "training")
    .contains("register_groups", [registerGroups[0]])
    .neq("id", terminId)
    .lt("date", new Date().toISOString().slice(0, 10))
    .order("date", { ascending: false })
    .order("start_time", { ascending: false })
    .limit(30);
  const termine = past ?? [];
  if (termine.length === 0) return {};

  const { data: courtGroups } = await service
    .from("termin_court_groups")
    .select("id, termin_id")
    .in(
      "termin_id",
      termine.map((t) => t.id),
    );
  const withGroups = new Set((courtGroups ?? []).map((g) => g.termin_id));
  const recent = termine.filter((t) => withGroups.has(t.id)).slice(0, 10);
  const recentIds = new Set(recent.map((t) => t.id));
  const groupIds = (courtGroups ?? []).filter((g) => recentIds.has(g.termin_id)).map((g) => g.id);
  if (groupIds.length === 0) return {};

  const { data: rows } = await service.from("termin_court_group_members").select("group_id, user_id").in("group_id", groupIds);
  const byGroup = new Map<string, string[]>();
  for (const r of rows ?? []) byGroup.set(r.group_id, [...(byGroup.get(r.group_id) ?? []), r.user_id]);

  const counts: PartnerCounts = {};
  for (const ids of byGroup.values()) {
    for (const a of ids) {
      for (const b of ids) {
        if (a === b) continue;
        counts[a] ??= {};
        counts[a][b] = (counts[a][b] ?? 0) + 1;
      }
    }
  }
  return counts;
}
