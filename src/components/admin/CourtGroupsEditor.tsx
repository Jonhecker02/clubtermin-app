"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toPng } from "html-to-image";
import { Copy, ImageDown, Minus, Plus, Shuffle, Trash2, WandSparkles } from "lucide-react";
import { Input, Select } from "@/components/ui/Input";
import { Tabs } from "@/components/ui/Tabs";
import { Button } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/queries/keys";
import { useTerminCourtGroups } from "@/lib/queries/useTerminCourtGroups";
import { useSkillLevels } from "@/lib/queries/useSkillLevels";
import { assignRounds, autoAssign, courtSizes, hashSeed, minCourts } from "@/lib/courtAssign";
import { CourtGroupsExportCard } from "./CourtGroupsExportCard";
import { buildCourtGroupsShareText, courtGroupRoundRange, courtGroupSwitchMinutes } from "@/lib/domain";
import type { Termin } from "@/types/database";
import styles from "./CourtGroupsEditor.module.css";

// A court always seats 4 — caps each group at that so nobody accidentally
// overfills one, though nothing blocks saving an intentionally smaller
// last group when the confirmed count isn't a multiple of 4.
const GROUP_SIZE = 4;

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
  termin,
}: {
  terminId: string;
  clubGroupId: string | null;
  participants: Participant[];
  publishedAt: string | null;
  termin: Termin;
}) {
  const queryClient = useQueryClient();
  const { data: saved, isLoading } = useTerminCourtGroups(terminId);
  const exportRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);

  // Derived straight from termin (not local state) so a realtime update from
  // another admin editing the same switch time is reflected immediately.
  const switchMinutes = courtGroupSwitchMinutes(termin);
  const switchTime = `${String(Math.floor(switchMinutes / 60)).padStart(2, "0")}:${String(switchMinutes % 60).padStart(2, "0")}`;
  const roundItems = [
    { id: "1", label: `Trainiert Runde 1 (${courtGroupRoundRange(1, termin)})` },
    { id: "2", label: `Trainiert Runde 2 (${courtGroupRoundRange(2, termin)})` },
  ];

  async function saveSwitchTime(value: string) {
    const supabase = createClient();
    await supabase
      .from("termine")
      .update({ court_groups_switch_time: value ? `${value}:00` : null })
      .eq("id", terminId);
    await queryClient.invalidateQueries({ queryKey: queryKeys.termine });
  }

  const [groups, setGroups] = useState<DraftGroup[]>([]);
  const [quotes, setQuotes] = useState<Record<string, number>>({});
  // partnerCounts[a][b] = how many recent shared court groups a and b have.
  const [partnerCounts, setPartnerCounts] = useState<Record<string, Record<string, number>>>({});
  const [historyLoaded, setHistoryLoaded] = useState(!clubGroupId);
  const [courtsWanted, setCourtsWanted] = useState<number | null>(null);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [shuffleCount, setShuffleCount] = useState(0);
  const [autoInfo, setAutoInfo] = useState<{ unrated: number; repeats: number } | null>(null);
  const [textCopied, setTextCopied] = useState(false);
  // Spielstärke is trainer/owner-only; a captain just gets no levels back.
  const { data: levels } = useSkillLevels();
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
    Promise.allSettled([
      supabase.rpc("get_round1_quotes", { p_club_group_id: clubGroupId, p_user_ids: userIds }).then(({ data }) => {
        if (!data) return;
        const map: Record<string, number> = {};
        for (const row of data) map[row.user_id] = row.quote;
        setQuotes(map);
      }),
      supabase.rpc("get_recent_partners", { p_club_group_id: clubGroupId, p_user_ids: userIds }).then(({ data }) => {
        if (!data) return;
        const map: Record<string, Record<string, number>> = {};
        for (const row of data) {
          (map[row.user_id] ??= {})[row.partner_id] = row.times_together;
        }
        setPartnerCounts(map);
      }),
    ]).then(() => setHistoryLoaded(true));
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
    setGroups((gs) =>
      gs.map((g) => (g.key === key && g.memberIds.length < GROUP_SIZE ? { ...g, memberIds: [...g.memberIds, userId] } : g)),
    );
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

  const minCourtCount = minCourts(participants.length);
  const courtCount = Math.max(courtsWanted ?? minCourtCount, minCourtCount);
  const sizes = courtSizes(participants.length, courtCount);
  const sizeSummary = sizes.every((x) => x === sizes[0]) ? `à ${sizes[0]}` : sizes.join("/");
  const hasLevels = !!levels && participants.some((p) => levels[p.user_id] != null);

  function levelOf(userId: string): number | null {
    return levels?.[userId] ?? null;
  }

  function averageLevel(memberIds: string[]): string | null {
    const known = memberIds.map(levelOf).filter((l): l is number => l !== null);
    if (known.length === 0) return null;
    return (known.reduce((s, l) => s + l, 0) / known.length).toFixed(1).replace(".", ",");
  }

  function runAutoAssign(bump: number) {
    const result = autoAssign({
      players: participants.map((p) => ({ id: p.user_id, level: levelOf(p.user_id) })),
      partnerCounts,
      courts: courtCount,
      seed: hashSeed(terminId) + bump * 104729,
    });
    const rounds = assignRounds(result.courts, quotes);
    setGroups((previous) =>
      result.courts.map((ids, i) => ({
        key: crypto.randomUUID(),
        label: `Court ${i + 1}`,
        // Trainers were typed in by hand — keep them on the same court number.
        trainerName: previous[i]?.trainerName ?? "",
        round: rounds[i],
        memberIds: ids,
      })),
    );
    setAutoInfo({ unrated: result.unrated, repeats: result.repeatedPairs });
    setSavedNotice(false);
    setConfirmReplace(false);
  }

  function startAutoAssign() {
    if (groups.some((g) => g.memberIds.length > 0) && !confirmReplace) {
      setConfirmReplace(true);
      return;
    }
    setShuffleCount(0);
    runAutoAssign(0);
  }

  function reshuffle() {
    const next = shuffleCount + 1;
    setShuffleCount(next);
    runAutoAssign(next);
  }

  async function copyText() {
    const filled = groups.filter((g) => g.memberIds.length > 0);
    const text = buildCourtGroupsShareText({
      termin,
      groups: filled.map((g) => ({
        label: g.label,
        trainerName: g.trainerName,
        round: g.round,
        memberNames: g.memberIds.map((id) => nameFor(id)),
      })),
    });
    await navigator.clipboard.writeText(text);
    setTextCopied(true);
    setTimeout(() => setTextCopied(false), 2000);
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

  async function exportPng() {
    if (!exportRef.current) return;
    setExporting(true);
    try {
      const dataUrl = await toPng(exportRef.current, { pixelRatio: 2, cacheBust: true });
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      const file = new File([blob], `${termin.title} - Trainingsgruppen.png`, { type: "image/png" });

      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: `${termin.title} — Trainingsgruppen` });
      } else {
        const link = document.createElement("a");
        link.href = dataUrl;
        link.download = `${termin.title} - Trainingsgruppen.png`;
        link.click();
      }
    } catch {
      // best-effort — admin can retry
    } finally {
      setExporting(false);
    }
  }

  if (isLoading && !loadedOnce) {
    return <div className={styles.empty}>Trainingsgruppen werden geladen…</div>;
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.autoCard}>
        <div className={styles.autoTitle}>Automatische Einteilung</div>
        <div className={styles.autoText}>
          {participants.length} Spieler → <b>{courtCount} Courts</b> ({sizeSummary}). Gleich starke Spieler kommen auf einen
          Court, wer zuletzt oft zusammen trainiert hat, wird getrennt.
        </div>
        <div className={styles.stepperRow}>
          <span className={styles.stepperLabel}>Anzahl Courts</span>
          <div className={styles.stepper}>
            <button type="button" onClick={() => setCourtsWanted(Math.max(courtCount - 1, minCourtCount))} disabled={courtCount <= minCourtCount} title="Weniger Courts">
              <Minus size={15} strokeWidth={2.5} />
            </button>
            <span className={styles.stepperValue}>{courtCount}</span>
            <button type="button" onClick={() => setCourtsWanted(Math.min(courtCount + 1, participants.length))} disabled={courtCount >= participants.length} title="Mehr Courts">
              <Plus size={15} strokeWidth={2.5} />
            </button>
          </div>
        </div>
        <Button variant="accent" size="sm" full onClick={startAutoAssign} disabled={!historyLoaded}>
          <WandSparkles size={15} strokeWidth={2.2} style={{ marginRight: 4 }} />
          {confirmReplace ? "Bestehende Einteilung ersetzen? Nochmal tippen" : "Automatisch einteilen"}
        </Button>
        {autoInfo && (
          <Button variant="outline" size="sm" full onClick={reshuffle}>
            <Shuffle size={15} strokeWidth={2.2} style={{ marginRight: 4 }} />
            Neu mischen
          </Button>
        )}
        {!levels && <div className={styles.autoHint}>Spielstärken sehen nur Trainer und Clubmanager — ohne Level wird nur durchgewechselt.</div>}
        {levels && !hasLevels && <div className={styles.autoHint}>Noch keine Spielstärken eingetragen (Admin → Spielstärke) — es wird nur durchgewechselt.</div>}
        {!clubGroupId && <div className={styles.autoHint}>Dieser Termin gehört nicht genau einer Mannschaft — dafür gibt es keine Partner-Historie.</div>}
        {autoInfo && autoInfo.unrated > 0 && hasLevels && (
          <div className={styles.autoHint}>{autoInfo.unrated} Spieler ohne Level wurden mittig einsortiert.</div>
        )}
        {autoInfo && (
          <div className={styles.autoHint}>
            {autoInfo.repeats === 0
              ? "Niemand trainiert mit jemandem zusammen, mit dem er zuletzt schon auf einem Court war."
              : `Gleich starke Spieler wurden bestmöglich neu gemischt. ${autoInfo.repeats} Paarung${autoInfo.repeats === 1 ? "" : "en"} waren trotzdem zuletzt schon zusammen.`}
          </div>
        )}
      </div>

      <Input
        label="Wechsel zwischen Training und Spiel"
        type="time"
        value={switchTime}
        onChange={(e) => saveSwitchTime(e.target.value)}
        helper="Standardmäßig 1 Std. nach Beginn — bei Bedarf anpassen."
      />

      {unassigned.length > 0 && (
        <div className={styles.unassigned}>
          <span className={styles.unassignedLabel}>Nicht zugeteilt ({unassigned.length})</span>
          <div className={styles.unassignedList}>
            {unassigned.map((p) => {
              const partners = partnersOf(p.user_id);
              return (
                <div key={p.user_id} className={styles.unassignedRow}>
                  <span>
                    {p.name}
                    {levelOf(p.user_id) !== null && <span className={styles.levelTag}>{levelOf(p.user_id)}</span>}
                  </span>
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
                {averageLevel(g.memberIds) && <span className={styles.levelAvg}>Ø {averageLevel(g.memberIds)}</span>}
                <span className={g.memberIds.length >= GROUP_SIZE ? styles.sizeBadgeFull : styles.sizeBadge}>
                  {g.memberIds.length}/{GROUP_SIZE}
                </span>
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
                items={roundItems}
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
                    {levelOf(id) !== null && <span className={styles.levelTag}>{levelOf(id)}</span>}
                    <button type="button" onClick={() => removeMember(g.key, id)} title="Entfernen">
                      ×
                    </button>
                  </span>
                ))}
                {g.memberIds.length === 0 && <span className={styles.chipEmpty}>Noch keine Spieler</span>}
              </div>
              {pairWarning && <div className={styles.pairWarning}>Zuletzt schon zusammen: {pairWarning}</div>}

              {unassigned.length > 0 && g.memberIds.length < GROUP_SIZE && (
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

      {groups.some((g) => g.memberIds.length > 0) && (
        <>
          <Button variant="outline" size="sm" full onClick={exportPng} disabled={exporting}>
            <ImageDown size={15} strokeWidth={2.2} style={{ marginRight: 4 }} />
            {exporting ? "Erstelle Bild…" : "Als Bild exportieren (für Trainer)"}
          </Button>
          <Button variant="outline" size="sm" full onClick={copyText}>
            <Copy size={15} strokeWidth={2.2} style={{ marginRight: 4 }} />
            {textCopied ? "Kopiert!" : "Als Text kopieren (für Trainer)"}
          </Button>
        </>
      )}

      <div style={{ position: "fixed", top: 0, left: -9999, pointerEvents: "none" }}>
        <CourtGroupsExportCard
          ref={exportRef}
          termin={termin}
          groups={groups
            .filter((g) => g.memberIds.length > 0)
            .map((g) => ({
              label: g.label,
              trainerName: g.trainerName,
              round: g.round,
              memberNames: g.memberIds.map((id) => nameFor(id)),
            }))}
        />
      </div>
    </div>
  );
}
