"use client";

import { useQueryClient } from "@tanstack/react-query";
import { AppHeader } from "@/components/layout/AppHeader";
import { PageBody } from "@/components/layout/PageBody";
import { Tabs } from "@/components/ui/Tabs";
import { AdminTabs } from "@/components/admin/AdminTabs";
import { useProfiles } from "@/lib/queries/useProfiles";
import { useGroups } from "@/lib/queries/useGroups";
import { useTrainerGroups } from "@/lib/queries/useTrainerGroups";
import { TrainerGroupsPicker } from "@/components/admin/TrainerGroupsPicker";
import { displayEmail } from "@/lib/domain";
import { queryKeys } from "@/lib/queries/keys";
import { createClient } from "@/lib/supabase/client";
import adminStyles from "@/components/admin/AdminList.module.css";
import styles from "./page.module.css";

const ROLE_ITEMS = [
  { id: "member", label: "Spieler" },
  { id: "captain", label: "Kapitän" },
  { id: "trainer", label: "Trainer" },
];

export default function AdminRollenPage() {
  const queryClient = useQueryClient();
  const { data: profiles = [] } = useProfiles();
  const { data: groups = [] } = useGroups();
  const { data: trainerGroups = [] } = useTrainerGroups();

  const members = profiles
    .filter((p) => p.role !== "owner" && p.status === "approved")
    .sort((a, b) => a.name.localeCompare(b.name));

  async function setRole(userId: string, role: "member" | "trainer" | "captain") {
    const supabase = createClient();
    await supabase.rpc("set_user_role", { p_user_id: userId, p_role: role });
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.profiles }),
      queryClient.invalidateQueries({ queryKey: queryKeys.trainerGroups }),
    ]);
  }

  async function setTrainerGroups(userId: string, groupIds: string[]) {
    const supabase = createClient();
    await supabase.rpc("set_trainer_groups", { p_user_id: userId, p_group_ids: groupIds });
    await queryClient.invalidateQueries({ queryKey: queryKeys.trainerGroups });
  }

  return (
    <>
      <AppHeader title="Rollen" />
      <PageBody>
        <AdminTabs current="rollen" />

        <div className={styles.intro}>
          Trainer und Kapitäne sehen und verwalten wie du Termine und Anfragen, aber keine Gruppen oder Rollen. Es
          gibt immer nur einen Owner. Einem Trainer kannst du mehrere Gruppen zuordnen — er sieht dann standardmäßig
          die Termine dieser Gruppen.
        </div>

        <div className={adminStyles.list}>
          {members.map((m) => (
            <div key={m.id} className={styles.card}>
              <div className={styles.info}>
                <div className={styles.name}>{m.name}</div>
                <div className={styles.meta}>
                  {[displayEmail(m.email), groups.find((g) => g.id === m.group_id)?.name ?? "—"].filter(Boolean).join(" · ")}
                </div>
              </div>
              <div className={styles.toggle}>
                <Tabs
                  items={ROLE_ITEMS}
                  value={m.role}
                  onChange={(id) => setRole(m.id, id as "member" | "trainer" | "captain")}
                  size="sm"
                />
              </div>
              {m.role === "trainer" && (
                <div className={styles.trainerGroups}>
                  <div className={styles.trainerGroupsTitle}>Trainer von</div>
                  <TrainerGroupsPicker
                    groups={groups}
                    value={trainerGroups.filter((t) => t.user_id === m.id).map((t) => t.group_id)}
                    onChange={(ids) => setTrainerGroups(m.id, ids)}
                  />
                  {!trainerGroups.some((t) => t.user_id === m.id) && (
                    <div className={styles.trainerGroupsHint}>Noch keine Gruppe gewählt — sieht alle Termine.</div>
                  )}
                </div>
              )}
            </div>
          ))}
          {members.length === 0 && <div className={adminStyles.empty}>Noch keine anderen Spieler.</div>}
        </div>
      </PageBody>
    </>
  );
}
