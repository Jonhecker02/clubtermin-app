"use client";

import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { Input, Select } from "@/components/ui/Input";
import { Tabs } from "@/components/ui/Tabs";
import { Button } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/queries/keys";
import { useTerminCourtGroups } from "@/lib/queries/useTerminCourtGroups";
import styles from "./CourtGroupsEditor.module.css";

const ROUND_ITEMS = [
  { id: "1", label: "Trainiert Runde 1" },
  { id: "2", label: "Trainiert Runde 2" },
];

interface DraftGroup {
  key: string;
  label: string;
  trainerName: string;
  round: 1 | 2;
  memberIds: string[];
}

interface Participant {
  user_id: string;
  name: string;
}

function draftFromSaved(saved: ReturnType<typeof useTerminCourtGroups>["data"]): DraftGroup[] {
  return (saved ?? []).map((g) => ({
    key: g.id,
    label: g.label,
    trainerName: g.trainer_name,
    round: g.trains_in_round,
    memberIds: g.member_ids,
  }));
}

export function CourtGroupsEditor({
  terminId,
  clubGroupId,
  participants,
}: {
  terminId: string;
  clubGroupId: string | null;
  participants: Participant[];
}) {
  const queryClient = useQueryClient();
  const { data: saved, isLoading } = useTerminCourtGroups(terminId);

  const [groups, setGroups] = useState<DraftGroup[]>([]);
  const [quotes, setQuotes] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [savedNotice, setSavedNotice] = useState(false);

  // Seeds the editable draft from the saved groups exactly once, when they
  // first arrive — after that the admin's in-progress edits are the source
  // of truth, so a realtime refetch from someone else saving doesn't yank
  // the form out from under them mid-edit. Adjusting state directly during
  // render (React's documented pattern for this) instead of an effect,
  // since this only needs to seed once when async data first shows up, not
  // re-run on every change to it.
  const [seededFrom, setSeededFrom] = useState<typeof saved>(undefined);
  const loadedOnce = seededFrom !== undefined;
  if (saved !== undefined && seededFrom === undefined) {
    setSeededFrom(saved);
    setGroups(draftFromSaved(saved));
  }

  useEffect(() => {
    if (!clubGroupId || participants.length === 0) return;
    const supabase = createClient();
    supabase
      .rpc("get_round1_quotes", { p_club_group_id: clubGroupId, p_user_ids: participants.map((p) => p.user_id) })
      .then(({ data }) => {
        if (!data) return;
        const map: Record<string, number> = {};
        for (const row of data) map[row.user_id] = row.quote;
        setQuotes(map);
      });
    // Only needs to run once per termin — the participant list and club
    // group don't change while this editor is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [terminId]);

  const assignedIds = useMemo(() => new Set(groups.flatMap((g) => g.memberIds)), [groups]);
  const unassigned = participants.filter((p) => !assignedIds.has(p.user_id));

  function addGroup() {
    setGroups((gs) => [
      ...gs,
      { key: crypto.randomUUID(), label: `Gruppe ${gs.length + 1}`, trainerName: "", round: 1, memberIds: [] },
    ]);
  }

  function removeGroup(key: string) {
    setGroups((gs) => gs.filter((g) => g.key !== key));
  }

  function updateGroup(key: string, patch: Partial<DraftGroup>) {
    setGroups((gs) => gs.map((g) => (g.key === key ? { ...g, ...patch } : g)));
  }

  function addMember(key: string, userId: string) {
    if (!userId) return;
    setGroups((gs) => gs.map((g) => (g.key === key ? { ...g, memberIds: [...g.memberIds, userId] } : g)));
  }

  function removeMember(key: string, userId: string) {
    setGroups((gs) => gs.map((g) => (g.key === key ? { ...g, memberIds: g.memberIds.filter((id) => id !== userId) } : g)));
  }

  function suggestedRound(memberIds: string[]): number | null {
    const known = memberIds.filter((id) => quotes[id] !== undefined);
    if (known.length === 0) return null;
    const avg = known.reduce((sum, id) => sum + quotes[id], 0) / known.length;
    return avg > 0.5 ? 2 : 1;
  }

  function nameFor(userId: string): string {
    return participants.find((p) => p.user_id === userId)?.name ?? "—";
  }

  async function save() {
    setSaving(true);
    setError("");
    setSavedNotice(false);
    const payload = groups
      .filter((g) => g.memberIds.length > 0)
      .map((g) => ({
        label: g.label.trim() || "Gruppe",
        trainer_name: g.trainerName.trim(),
        trains_in_round: g.round,
        member_ids: g.memberIds,
      }));
    const supabase = createClient();
    const { error: rpcError } = await supabase.rpc("save_termin_court_groups", {
      p_termin_id: terminId,
      p_groups: payload,
    });
    setSaving(false);
    if (rpcError) {
      setError("Speichern fehlgeschlagen.");
      return;
    }
    setSavedNotice(true);
    await queryClient.invalidateQueries({ queryKey: queryKeys.courtGroups(terminId) });
  }

  if (isLoading && !loadedOnce) {
    return <div className={styles.empty}>Trainingsgruppen werden geladen…</div>;
  }

  return (
    <div className={styles.wrap}>
      {unassigned.length > 0 && (
        <div className={styles.unassigned}>
          <span className={styles.unassignedLabel}>Nicht zugeteilt ({unassigned.length})</span>
          <div className={styles.chips}>
            {unassigned.map((p) => (
              <span key={p.user_id} className={styles.chip}>
                {p.name}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className={styles.groupList}>
        {groups.map((g) => {
          const suggestion = suggestedRound(g.memberIds);
          return (
            <div key={g.key} className={styles.groupCard}>
              <div className={styles.groupHead}>
                <Input
                  value={g.label}
                  onChange={(e) => updateGroup(g.key, { label: e.target.value })}
                  className={styles.labelInput}
                />
                <button type="button" className={styles.removeGroup} onClick={() => removeGroup(g.key)} title="Gruppe entfernen">
                  <Trash2 size={15} strokeWidth={2} />
                </button>
              </div>

              <Input
                label="Trainer"
                placeholder="z. B. Coach Mia"
                value={g.trainerName}
                onChange={(e) => updateGroup(g.key, { trainerName: e.target.value })}
              />

              <Tabs
                items={ROUND_ITEMS}
                value={String(g.round)}
                onChange={(id) => updateGroup(g.key, { round: Number(id) as 1 | 2 })}
                size="sm"
              />
              {suggestion !== null && suggestion !== g.round && (
                <button
                  type="button"
                  className={styles.suggestion}
                  onClick={() => updateGroup(g.key, { round: suggestion as 1 | 2 })}
                >
                  Faire Empfehlung: Runde {suggestion} übernehmen
                </button>
              )}

              <div className={styles.chips}>
                {g.memberIds.map((id) => (
                  <span key={id} className={styles.chip}>
                    {nameFor(id)}
                    <button type="button" onClick={() => removeMember(g.key, id)} title="Entfernen">
                      ×
                    </button>
                  </span>
                ))}
                {g.memberIds.length === 0 && <span className={styles.chipEmpty}>Noch keine Spieler</span>}
              </div>

              {unassigned.length > 0 && (
                <Select value="" onChange={(e) => addMember(g.key, e.target.value)}>
                  <option value="">+ Spieler hinzufügen…</option>
                  {unassigned.map((p) => (
                    <option key={p.user_id} value={p.user_id}>
                      {p.name}
                    </option>
                  ))}
                </Select>
              )}
            </div>
          );
        })}
      </div>

      <Button variant="outline" size="sm" onClick={addGroup}>
        <Plus size={15} strokeWidth={2.5} style={{ marginRight: 4 }} />
        Neue Gruppe
      </Button>

      {error && <div className={styles.error}>{error}</div>}
      {savedNotice && !error && <div className={styles.saved}>Gespeichert.</div>}
      <Button variant="accent" size="sm" full onClick={save} disabled={saving || groups.length === 0}>
        Trainingsgruppen speichern
      </Button>
    </div>
  );
}
