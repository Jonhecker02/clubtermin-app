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
  publishedAt,
}: {
  terminId: string;
  clubGroupId: string | null;
  participants: Participant[];
  publishedAt: string | null;
}) {
  const queryClient = useQueryClient();
  const { data: saved, isLoading } = useTerminCourtGroups(terminId);

  const [groups, setGroups] = useState<DraftGroup[]>([]);
  const [quotes, setQuotes] = useState<Record<string, number>>({});
  // partnerCounts[a][b] = how many recent shared court groups a and b have.
  const [partnerCounts, setPartnerCounts] = useState<Record<string, Record<string, number>>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [savedNotice, setSavedNotice] = useState(false);
  const [publishing, setPublishing] = useState(false);

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
    const userIds = participants.map((p) => p.user_id);
    supabase.rpc("get_round1_quotes", { p_club_group_id: clubGroupId, p_user_ids: userIds }).then(({ data }) => {
      if (!data) return;
      const map: Record<string, number> = {};
      for (const row of data) map[row.user_id] = row.quote;
      setQuotes(map);
    });
    supabase.rpc("get_recent_partners", { p_club_group_id: clubGroupId, p_user_ids: userIds }).then(({ data }) => {
      if (!data) return;
      const map: Record<string, Record<string, number>> = {};
      for (const row of data) {
        (map[row.user_id] ??= {})[row.partner_id] = row.times_together;
      }
      setPartnerCounts(map);
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

  // Majority vote across the group's current members, not a group-level
  // average — a group is a fresh, ad-hoc combination of whoever's placed in
  // it right now, so "what does most of this specific mix of people need"
  // is the more honest question than averaging quotes that can be skewed by
  // one extreme value.
  function suggestedRound(memberIds: string[]): number | null {
    const known = memberIds.filter((id) => quotes[id] !== undefined);
    if (known.length === 0) return null;
    let wantsRound1 = 0;
    let wantsRound2 = 0;
    for (const id of known) {
      if (quotes[id] > 0.5) wantsRound2++;
      else if (quotes[id] < 0.5) wantsRound1++;
    }
    if (wantsRound1 === wantsRound2) return null;
    return wantsRound1 > wantsRound2 ? 1 : 2;
  }

  function nameFor(userId: string): string {
    return participants.find((p) => p.user_id === userId)?.name ?? "—";
  }

  function partnersOf(userId: string): { name: string; count: number }[] {
    const row = partnerCounts[userId];
    if (!row) return [];
    return Object.entries(row)
      .map(([partnerId, count]) => ({ name: nameFor(partnerId), count }))
      .sort((a, b) => b.count - a.count);
  }

  // Flags pairs already placed together in this draft group who've recently
  // shared a court a lot — the actual "make sure other people train
  // together too" moment.
  function groupPairWarnings(memberIds: string[]): string {
    const parts: string[] = [];
    for (let i = 0; i < memberIds.length; i++) {
      for (let j = i + 1; j < memberIds.length; j++) {
        const count = partnerCounts[memberIds[i]]?.[memberIds[j]] ?? 0;
        if (count > 0) parts.push(`${nameFor(memberIds[i])} & ${nameFor(memberIds[j])} (${count}×)`);
      }
    }
    return parts.join(", ");
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

  async function togglePublish() {
    setPublishing(true);
    const supabase = createClient();
    const { error: rpcError } = await supabase.rpc("set_court_groups_published", {
      p_termin_id: terminId,
      p_published: !publishedAt,
    });
    setPublishing(false);
    if (!rpcError) {
      await queryClient.invalidateQueries({ queryKey: queryKeys.termine });
    }
  }

  if (isLoading && !loadedOnce) {
    return <div className={styles.empty}>Trainingsgruppen werden geladen…</div>;
  }

  return (
    <div className={styles.wrap}>
      {unassigned.length > 0 && (
        <div className={styles.unassigned}>
          <span className={styles.unassignedLabel}>Nicht zugeteilt ({unassigned.length})</span>
          <div className={styles.unassignedList}>
            {unassigned.map((p) => {
              const partners = partnersOf(p.user_id);
              return (
                <div key={p.user_id} className={styles.unassignedRow}>
                  <span>{p.name}</span>
                  {partners.length > 0 && (
                    <span className={styles.partnerHint}>
                      zuletzt mit: {partners.map((x) => `${x.name} (${x.count}×)`).join(", ")}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className={styles.groupList}>
        {groups.map((g) => {
          const suggestion = suggestedRound(g.memberIds);
          const pairWarning = groupPairWarnings(g.memberIds);
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
              {pairWarning && <div className={styles.pairWarning}>Zuletzt schon zusammen: {pairWarning}</div>}

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

      {groups.length > 0 && (
        <Button variant="outline" size="sm" full onClick={togglePublish} disabled={publishing}>
          {publishedAt ? "Für Spieler verbergen" : "Für Spieler veröffentlichen"}
        </Button>
      )}
      {publishedAt && <div className={styles.saved}>Sichtbar für die Teilnehmer dieses Termins.</div>}
    </div>
  );
}
