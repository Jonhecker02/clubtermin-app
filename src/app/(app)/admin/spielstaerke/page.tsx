"use client";

import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { NotebookPen } from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";
import { PageBody } from "@/components/layout/PageBody";
import { Input } from "@/components/ui/Input";
import { Tabs } from "@/components/ui/Tabs";
import { AdminTabs } from "@/components/admin/AdminTabs";
import { PlayerSheet, type SheetPlayer } from "@/components/admin/PlayerSheet";
import { useProfiles } from "@/lib/queries/useProfiles";
import { useGroups } from "@/lib/queries/useGroups";
import { useSkillLevels } from "@/lib/queries/useSkillLevels";
import { usePlayerNotesOverview } from "@/lib/queries/usePlayerNotesOverview";
import { usePersonalDetails } from "@/lib/queries/usePersonalDetails";
import { queryKeys } from "@/lib/queries/keys";
import { createClient } from "@/lib/supabase/client";
import {
  AGE_CLASS_MINIMUMS,
  ageBandLabel,
  ageClassLabel,
  ageInYear,
  formatLevel,
  groupLabel,
  inAgeBand,
  inAgeClass,
  initials,
  parseLevel,
  type AgeClassMin,
} from "@/lib/domain";
import { useUnsavedChanges } from "@/lib/useUnsavedChanges";
import adminStyles from "@/components/admin/AdminList.module.css";
import styles from "./page.module.css";
import { PersonName } from "@/components/PersonName";

// Trainer's player overview: find anyone fast, set the Spielstärke right in
// the row, open the notes with one tap.
export default function AdminSpielerPage() {
  const queryClient = useQueryClient();
  const { data: profiles = [] } = useProfiles();
  const { data: groups = [] } = useGroups();
  const { data: skillLevels = {} } = useSkillLevels();
  const { data: notes = {} } = usePlayerNotesOverview();
  const { data: details = {} } = usePersonalDetails();

  const [search, setSearch] = useState("");
  const [groupFilter, setGroupFilter] = useState("alle");
  // "liste" = by group; "klassen" = by age class (team planning).
  const [view, setView] = useState<"liste" | "klassen">("liste");
  const seasonNow = new Date().getFullYear();
  const [season, setSeason] = useState(seasonNow);
  // "m-0" = Herren Offen, "w-35" = Damen 35, "fehlt" = details missing
  const [klasse, setKlasse] = useState("m-0");
  const [selected, setSelected] = useState<SheetPlayer | null>(null);

  // Einspringer (guests) are listed on their own and kept out of the age-class
  // planning, which is about the actual team members.
  const approved = useMemo(() => profiles.filter((p) => p.status === "approved" && !p.is_guest), [profiles]);
  const guests = useMemo(() => profiles.filter((p) => p.status === "approved" && p.is_guest), [profiles]);

  // Head count per age class for the chosen season (eligible = may play in it).
  const classCounts = useMemo(() => {
    const counts: Record<string, { eligible: number; band: number }> = {};
    for (const g of ["m", "w"] as const) {
      for (const min of AGE_CLASS_MINIMUMS) {
        let eligible = 0;
        let band = 0;
        for (const p of approved) {
          const d = details[p.id];
          if (d?.gender !== g) continue;
          if (inAgeClass(d.birth_date, min, season)) eligible++;
          if (inAgeBand(d.birth_date, min, season)) band++;
        }
        counts[`${g}-${min}`] = { eligible, band };
      }
    }
    return counts;
  }, [approved, details, season]);
  const missingCount = approved.filter((p) => !details[p.id]?.birth_date || !details[p.id]?.gender).length;

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (view === "liste" && groupFilter === "gast") {
      return guests.filter((p) => q === "" || p.name.toLowerCase().includes(q)).sort((a, b) => a.name.localeCompare(b.name));
    }
    const base = approved.filter((p) => q === "" || p.name.toLowerCase().includes(q));
    if (view === "klassen") {
      if (klasse === "fehlt") {
        return base.filter((p) => !details[p.id]?.birth_date || !details[p.id]?.gender).sort((a, b) => a.name.localeCompare(b.name));
      }
      const [g, minText] = klasse.split("-");
      const min = Number(minText) as AgeClassMin;
      return base
        .filter((p) => details[p.id]?.gender === g && inAgeClass(details[p.id]?.birth_date, min, season))
        // oldest first: the ones who can only play in the older classes
        .sort((a, b) => (details[a.id]?.birth_date ?? "9999").localeCompare(details[b.id]?.birth_date ?? "9999") || a.name.localeCompare(b.name));
    }
    return base
      .filter((p) => groupFilter === "alle" || (groupFilter === "ohne" ? !p.group_id : p.group_id === groupFilter))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [approved, guests, search, groupFilter, view, klasse, season, details]);

  const klassenItems = [
    ...(["m", "w"] as const).flatMap((g) =>
      AGE_CLASS_MINIMUMS.map((min) => ({
        id: `${g}-${min}`,
        label: `${ageClassLabel(g, min)} (${classCounts[`${g}-${min}`]?.eligible ?? 0})`,
      })),
    ),
    ...(missingCount > 0 ? [{ id: "fehlt", label: `Angaben fehlen (${missingCount})` }] : []),
  ];
  const [activeGender, activeMinText] = klasse.split("-");
  const activeMin = Number(activeMinText) as AgeClassMin;
  const activeCount = classCounts[klasse];

  const filterItems = [
    { id: "alle", label: "Alle" },
    ...groups.map((g) => ({ id: g.id, label: g.short_code || g.name })),
    ...(approved.some((p) => !p.group_id) ? [{ id: "ohne", label: "Ohne Gruppe" }] : []),
    ...(guests.length > 0 ? [{ id: "gast", label: `Einspringer (${guests.length})` }] : []),
  ];

  // Text being typed per player, so "2," isn't reformatted under the cursor;
  // it's validated and saved when the field loses focus (or on Enter).
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  // Valid entries save themselves when the field loses focus; only a value
  // that was rejected (invalid / failed to save) is still unsaved.
  useUnsavedChanges(Object.entries(errors).some(([id, msg]) => msg && drafts[id] !== undefined));

  function shown(userId: string): string {
    if (drafts[userId] !== undefined) return drafts[userId];
    const level = skillLevels[userId];
    return level != null ? formatLevel(level) : "";
  }

  async function commit(userId: string) {
    const text = drafts[userId];
    if (text === undefined) return;
    const level = parseLevel(text);
    if (level === undefined) {
      setErrors((e) => ({ ...e, [userId]: "0 bis 5, z. B. 2,5" }));
      return;
    }
    setErrors((e) => ({ ...e, [userId]: "" }));
    const supabase = createClient();
    const { error } = await supabase.rpc("set_skill_level", { p_user_id: userId, p_skill_level: level });
    if (error) {
      setErrors((e) => ({ ...e, [userId]: "Speichern fehlgeschlagen" }));
      return;
    }
    setDrafts((d) => {
      const next = { ...d };
      delete next[userId];
      return next;
    });
    await queryClient.invalidateQueries({ queryKey: queryKeys.skillLevels });
  }

  return (
    <>
      <AppHeader title="Spieler" />
      <PageBody>
        <AdminTabs current="spielstaerke" />

        <Input placeholder="Spieler suchen…" value={search} onChange={(e) => setSearch(e.target.value)} className={styles.search} />
        <Tabs
          items={[
            { id: "liste", label: "Nach Gruppe" },
            { id: "klassen", label: "Altersklassen" },
          ]}
          value={view}
          onChange={(id) => setView(id as "liste" | "klassen")}
          size="sm"
          style={{ marginBottom: 12 }}
        />
        {view === "liste" && filterItems.length > 2 && (
          <Tabs items={filterItems} value={groupFilter} onChange={setGroupFilter} size="sm" scrollable style={{ marginBottom: 12 }} />
        )}
        {view === "klassen" && (
          <>
            <Tabs
              items={[
                { id: String(seasonNow), label: `Saison ${seasonNow}` },
                { id: String(seasonNow + 1), label: `Saison ${seasonNow + 1}` },
              ]}
              value={String(season)}
              onChange={(id) => setSeason(Number(id))}
              size="sm"
              style={{ marginBottom: 10 }}
            />
            <Tabs items={klassenItems} value={klasse} onChange={setKlasse} size="sm" scrollable style={{ marginBottom: 12 }} />
            {klasse !== "fehlt" && activeCount && (
              <div className={styles.classSummary}>
                <b>{activeCount.eligible}</b> spielberechtigt
                {activeMin > 0 && (
                  <>
                    {" "}
                    · davon <b>{activeCount.band}</b> genau in dieser Klasse ({ageBandLabel(activeMin)} J.)
                  </>
                )}
                {activeMin === 0 && activeGender && " · alle, unabhängig vom Alter"}
                <div className={styles.classNote}>
                  Nach Jahrgang: wer {season} mindestens {activeMin || "–"} Jahre alt wird, ist spielberechtigt
                  {activeMin > 0 ? ` (Jahrgang ${season - activeMin} und älter)` : ""}. Ohne Geburtsdatum oder Geschlecht
                  taucht jemand nur unter „Angaben fehlen“ auf.
                </div>
              </div>
            )}
          </>
        )}

        <p className={styles.hint}>
          Nur für Trainer/Clubmanager sichtbar. Spielstärke 0 bis 5, auch mit Komma (z. B. 2,5), leer = nicht bewertet.
          Das Notiz-Symbol öffnet alle Notizen zum Spieler.
        </p>

        <div className={styles.count}>{rows.length} Spieler</div>

        <div className={adminStyles.list}>
          {rows.map((p) => {
            const group = groups.find((g) => g.id === p.group_id);
            const summary = notes[p.id];
            return (
              <div key={p.id} className={styles.row}>
                <button
                  type="button"
                  className={styles.person}
                  onClick={() => setSelected({ id: p.id, name: p.name, subtitle: group ? groupLabel(group) : undefined })}
                >
                  <span className={styles.avatar}>{initials(p.name)}</span>
                  <span className={styles.personText}>
                    <PersonName className={styles.name} name={p.name} userId={p.id} />
                    <span className={styles.meta}>
                      {group ? groupLabel(group) : "Ohne Gruppe"}
                      {view === "klassen" && details[p.id]?.birth_date ? ` · ${ageInYear(details[p.id].birth_date!, season)} J. in ${season}` : ""}
                    </span>
                    {summary && <span className={styles.preview}>{summary.latest}</span>}
                  </span>
                </button>
                <button
                  type="button"
                  className={`${styles.noteBtn} ${summary ? styles.noteBtnFilled : ""}`}
                  aria-label={`Notizen zu ${p.name}`}
                  onClick={() => setSelected({ id: p.id, name: p.name, subtitle: group ? groupLabel(group) : undefined })}
                >
                  <NotebookPen size={16} strokeWidth={2.2} />
                  {summary && <span className={styles.noteCount}>{summary.count}</span>}
                </button>
                <Input
                  value={shown(p.id)}
                  placeholder="—"
                  inputMode="decimal"
                  aria-label={`Spielstärke ${p.name}`}
                  error={errors[p.id] || undefined}
                  onChange={(e) => setDrafts((d) => ({ ...d, [p.id]: e.target.value }))}
                  onBlur={() => commit(p.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") e.currentTarget.blur();
                  }}
                  className={styles.levelInput}
                  style={{ textAlign: "center" }}
                />
              </div>
            );
          })}
          {rows.length === 0 && <div className={adminStyles.empty}>Keine Spieler gefunden.</div>}
        </div>
      </PageBody>
      <PlayerSheet key={selected?.id ?? "none"} player={selected} onClose={() => setSelected(null)} />
    </>
  );
}
