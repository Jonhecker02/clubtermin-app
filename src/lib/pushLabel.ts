import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { pushLabel } from "@/lib/pushText";

// Resolves "QTA · Titel" for a termin: the team's short code is only used
// when the termin belongs to exactly one team (same rule as everywhere else
// in the app). One lookup per team, cached for the lifetime of the request.
export function makeLabelResolver(client: SupabaseClient<Database>) {
  const cache = new Map<string, string | null>();
  return async function labelFor(termin: { title: string; register_groups: string[] }): Promise<string> {
    let shortCode: string | null = null;
    if (termin.register_groups.length === 1 && termin.register_groups[0] !== "all") {
      const groupId = termin.register_groups[0];
      if (!cache.has(groupId)) {
        const { data: group } = await client.from("groups").select("short_code").eq("id", groupId).single();
        cache.set(groupId, group?.short_code ?? null);
      }
      shortCode = cache.get(groupId) ?? null;
    }
    return pushLabel(shortCode, termin.title);
  };
}
