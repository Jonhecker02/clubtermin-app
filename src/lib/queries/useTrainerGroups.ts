"use client";

import { useCallback, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { queryKeys } from "./keys";
import { useProfile } from "./useProfile";
import { terminInTrainerScope } from "@/lib/domain";
import type { TrainerGroup, Termin } from "@/types/database";

// All "Trainer von" assignments (user -> group). Readable by every approved
// member; written only by the owner through set_trainer_groups().
export function useTrainerGroups() {
  return useQuery({
    queryKey: queryKeys.trainerGroups,
    queryFn: async (): Promise<TrainerGroup[]> => {
      const supabase = createClient();
      const { data, error } = await supabase.from("trainer_groups").select("user_id, group_id");
      if (error) throw error;
      return data;
    },
    staleTime: 60_000,
  });
}

const NO_GROUPS: string[] = [];

// Which groups a trainer coaches. `scoped` is only true for a trainer with at
// least one assignment — everyone else (players, owner, captains, trainers
// nobody assigned yet) keeps the unfiltered view they always had.
export function useTrainerScope() {
  const { data: profile } = useProfile();
  const { data: assignments } = useTrainerGroups();

  const role = profile?.role;
  const userId = profile?.id ?? null;
  const ownGroupId = profile?.group_id ?? null;

  // Memoized: consumers use groupIds as a hook dependency, and a fresh array
  // every render would retrigger them (and loop pages that reset state when
  // their filtered list changes).
  const groupIds = useMemo(() => {
    if (role !== "trainer" || !assignments) return NO_GROUPS;
    const mine = assignments.filter((a) => a.user_id === userId).map((a) => a.group_id);
    if (mine.length === 0) return NO_GROUPS;
    // A trainer who also plays in a group keeps seeing that group too.
    return ownGroupId && !mine.includes(ownGroupId) ? [...mine, ownGroupId] : mine;
  }, [role, assignments, userId, ownGroupId]);

  return { scoped: groupIds.length > 0, groupIds, userId };
}

export const TRAINER_SCOPE_ITEMS = [
  { id: "meine", label: "Meine Gruppen" },
  { id: "alle", label: "Alle Gruppen" },
];

// Termine list for a trainer: their groups' termine by default, with a switch
// to everything. Anyone not scoped (see useTrainerScope) gets the full list
// and no switch.
export function useTrainerTermineFilter() {
  const { scoped, groupIds, userId } = useTrainerScope();
  const [mode, setMode] = useState<"meine" | "alle">("meine");

  const apply = useCallback(
    (termine: Termin[]): Termin[] =>
      scoped && mode === "meine" ? termine.filter((t) => terminInTrainerScope(t, groupIds, userId)) : termine,
    [scoped, mode, groupIds, userId],
  );

  return { scoped, mode, setMode, apply };
}
