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
import { queryKeys } from "@/lib/queries/keys";
import { createClient } from "@/lib/supabase/client";
import { formatLevel, groupLabel, initials, parseLevel } from "@/lib/domain";
import { useUnsavedChanges } from "@/lib/useUnsavedChanges";
import adminStyles from "@/components/admin/AdminList.module.css";
import styles from "./page.module.css";

// Trainer's player overview: find anyone fast, set the Spielstärke right in
// the row, open the notes with one tap.
export default function AdminSpielerPage() {
  const queryClient = useQueryClient();
  const { data: profiles = [] } = useProfiles();
  const { data: groups = [] } = useGroups();
  const { data: skillLevels = {} } = useSkillLevels();
  const { data: notes = {} } = usePlayerNotesOverview();

  const [search, setSearch] = useState("");
  const [groupFilter, setGroupFilter] = useState("alle");
  const [selected, setSelected] = useState<SheetPlayer | null>(null);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return profiles
      .filter((p) => p.status === "approved")
      .filter((p) => groupFilter === "alle" || (groupFilter === "ohne" ? !p.group_id : p.group_id === groupFilter))
      .filter((p) => q === "" || p.name.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [profiles, search, groupFilter]);

  const filterItems = [
    { id: "alle", label: "Alle" },
    ...groups.map((g) => ({ id: g.id, label: g.short_code || g.name })),
    ...(profiles.some((p) => p.status === "approved" && !p.group_id) ? [{ id: "ohne", label: "Ohne Gruppe" }] : []),
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
        {filterItems.length > 2 && (
          <Tabs items={filterItems} value={groupFilter} onChange={setGroupFilter} size="sm" scrollable style={{ marginBottom: 12 }} />
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
                    <span className={styles.name}>{p.name}</span>
                    <span className={styles.meta}>
                      {group ? groupLabel(group) : "Ohne Gruppe"}
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
