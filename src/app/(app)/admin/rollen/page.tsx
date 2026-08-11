"use client";

import { useQueryClient } from "@tanstack/react-query";
import { AppHeader } from "@/components/layout/AppHeader";
import { PageBody } from "@/components/layout/PageBody";
import { Tabs } from "@/components/ui/Tabs";
import { AdminTabs } from "@/components/admin/AdminTabs";
import { useProfiles } from "@/lib/queries/useProfiles";
import { useGroups } from "@/lib/queries/useGroups";
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

  const members = profiles
    .filter((p) => p.role !== "owner" && p.status === "approved")
    .sort((a, b) => a.name.localeCompare(b.name));

  async function setRole(userId: string, role: "member" | "trainer" | "captain") {
    const supabase = createClient();
    await supabase.rpc("set_user_role", { p_user_id: userId, p_role: role });
    await queryClient.invalidateQueries({ queryKey: queryKeys.profiles });
  }

  return (
    <>
      <AppHeader title="Rollen" />
      <PageBody>
        <AdminTabs current="rollen" isOwner />

        <div className={styles.intro}>
          Trainer und Kapitäne sehen und verwalten wie du Termine und Anfragen, aber keine Gruppen oder Rollen. Es
          gibt immer nur einen Owner.
        </div>

        <div className={adminStyles.list}>
          {members.map((m) => (
            <div key={m.id} className={styles.card}>
              <div className={styles.info}>
                <div className={styles.name}>{m.name}</div>
                <div className={styles.meta}>
                  {m.email} · {groups.find((g) => g.id === m.group_id)?.name ?? "—"}
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
            </div>
          ))}
          {members.length === 0 && <div className={adminStyles.empty}>Noch keine anderen Spieler.</div>}
        </div>
      </PageBody>
    </>
  );
}
