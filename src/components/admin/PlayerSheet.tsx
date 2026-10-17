"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Input } from "@/components/ui/Input";
import { PlayerNotesPanel } from "@/components/admin/PlayerNotesPanel";
import { useProfiles } from "@/lib/queries/useProfiles";
import { useSkillLevels } from "@/lib/queries/useSkillLevels";
import { queryKeys } from "@/lib/queries/keys";
import { createClient } from "@/lib/supabase/client";
import { formatLevel, parseLevel } from "@/lib/domain";
import styles from "./PlayerSheet.module.css";

export interface SheetPlayer {
  id: string;
  name: string;
  subtitle?: string;
}

// One player, everything a trainer needs at the court side: note first (the
// field is focused), the Spielstärke next to it, earlier notes below.
// Mount it with key={player.id} so every player starts fresh.
export function PlayerSheet({ player, onClose }: { player: SheetPlayer | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { data: profiles = [] } = useProfiles();
  // Levels are trainer/owner-only: for anyone else the query errors and the
  // field simply isn't offered.
  const { data: levels, isError } = useSkillLevels();
  const canEditLevel = !isError && levels !== undefined;

  const [draft, setDraft] = useState<string | null>(null);
  const [levelError, setLevelError] = useState("");
  const [savedHint, setSavedHint] = useState(false);

  if (!player) return null;
  const current = levels?.[player.id];
  const shown = draft ?? (current != null ? formatLevel(current) : "");

  async function commitLevel() {
    if (draft === null || !player) return;
    const level = parseLevel(draft);
    if (level === undefined) {
      setLevelError("0 bis 5, z. B. 2,5");
      return;
    }
    setLevelError("");
    const supabase = createClient();
    const { error } = await supabase.rpc("set_skill_level", { p_user_id: player.id, p_skill_level: level });
    if (error) {
      setLevelError("Speichern fehlgeschlagen");
      return;
    }
    setDraft(null);
    setSavedHint(true);
    setTimeout(() => setSavedHint(false), 1800);
    await queryClient.invalidateQueries({ queryKey: queryKeys.skillLevels });
  }

  return (
    <BottomSheet open onClose={onClose} title={player.name} subtitle={player.subtitle}>
      {canEditLevel && (
        <div className={styles.levelRow}>
          <Input
            label="Spielstärke (0–5)"
            value={shown}
            placeholder="—"
            inputMode="decimal"
            error={levelError || undefined}
            helper={savedHint ? "Gespeichert ✓" : undefined}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitLevel}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
          />
        </div>
      )}
      <PlayerNotesPanel userId={player.id} profiles={profiles} composerFirst autoFocus bare />
    </BottomSheet>
  );
}
