"use client";

import { useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AppHeader } from "@/components/layout/AppHeader";
import { PageBody } from "@/components/layout/PageBody";
import { Select } from "@/components/ui/Input";
import { AdminTabs } from "@/components/admin/AdminTabs";
import { useProfiles } from "@/lib/queries/useProfiles";
import { useGroups } from "@/lib/queries/useGroups";
import { useSkillLevels } from "@/lib/queries/useSkillLevels";
import { queryKeys } from "@/lib/queries/keys";
import { createClient } from "@/lib/supabase/client";
import { groupLabel } from "@/lib/domain";
import adminStyles from "@/components/admin/AdminList.module.css";
import styles from "../statistik/page.module.css";

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

  async function setLevel(userId: string, value: string) {
    const supabase = createClient();
    const level = value === "" ? null : Number(value);
    await supabase.rpc("set_skill_level", { p_user_id: userId, p_skill_level: level });
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
          Nur für Trainer/Clubmanager sichtbar — dient der internen Einteilung, Spieler sehen ihre Spielstärke nicht.
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
                <Select
                  value={skillLevels[p.id] != null ? String(skillLevels[p.id]) : ""}
                  onChange={(e) => setLevel(p.id, e.target.value)}
                  style={{ width: 110, flexShrink: 0 }}
                >
                  <option value="">— unbewertet —</option>
                  {[0, 1, 2, 3, 4, 5].map((lvl) => (
                    <option key={lvl} value={lvl}>
                      {lvl}
                    </option>
                  ))}
                </Select>
              </div>
            );
          })}
          {rows.length === 0 && <div className={adminStyles.empty}>Noch keine Spieler.</div>}
        </div>
      </PageBody>
    </>
  );
}
