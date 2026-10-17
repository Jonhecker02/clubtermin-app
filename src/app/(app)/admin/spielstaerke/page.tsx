"use client";

import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AppHeader } from "@/components/layout/AppHeader";
import { PageBody } from "@/components/layout/PageBody";
import { Input } from "@/components/ui/Input";
import { AdminTabs } from "@/components/admin/AdminTabs";
import { useProfiles } from "@/lib/queries/useProfiles";
import { useGroups } from "@/lib/queries/useGroups";
import { useSkillLevels } from "@/lib/queries/useSkillLevels";
import { queryKeys } from "@/lib/queries/keys";
import { createClient } from "@/lib/supabase/client";
import { formatLevel, groupLabel, parseLevel } from "@/lib/domain";
import adminStyles from "@/components/admin/AdminList.module.css";
import styles from "../statistik/page.module.css";
import { useUnsavedChanges } from "@/lib/useUnsavedChanges";

export default function AdminSpielstaerkePage() {
  const queryClient = useQueryClient();
  const { data: profiles = [] } = useProfiles();
  const { data: groups = [] } = useGroups();
  const { data: skillLevels = {} } = useSkillLevels();

  const rows = useMemo(
    () =>
      profiles
        .filter((p) => p.status === "approved")
        .sort((a, b) => a.name.localeCompare(b.name)),
    [profiles],
  );

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
      <AppHeader title="Spielstärke" />
      <PageBody>
        <AdminTabs current="spielstaerke" />

        <div className={adminStyles.countRow}>
          <span className={adminStyles.count}>{rows.length} Spieler</span>
        </div>
        <p className={styles.count} style={{ marginBottom: 14 }}>
          Nur für Trainer/Clubmanager sichtbar — dient der internen Einteilung, Spieler sehen ihre Spielstärke nicht. Werte von 0 bis 5, auch mit Komma (z. B. 2,5); leer = nicht bewertet.
        </p>

        <div className={adminStyles.list}>
          {rows.map((p) => {
            const group = groups.find((g) => g.id === p.group_id);
            return (
              <div key={p.id} className={styles.card}>
                <div className={styles.info}>
                  <span className={styles.name}>{p.name}</span>
                  <span className={styles.meta}>{group ? groupLabel(group) : "—"}</span>
                </div>
                <Input
                  value={shown(p.id)}
                  placeholder="—"
                  inputMode="decimal"
                  error={errors[p.id] || undefined}
                  onChange={(e) => setDrafts((d) => ({ ...d, [p.id]: e.target.value }))}
                  onBlur={() => commit(p.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") e.currentTarget.blur();
                  }}
                  style={{ width: 96, textAlign: "center" }}
                />
              </div>
            );
          })}
          {rows.length === 0 && <div className={adminStyles.empty}>Noch keine Spieler.</div>}
        </div>
      </PageBody>
    </>
  );
}
