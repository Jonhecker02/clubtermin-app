"use client";

import { useQueryClient } from "@tanstack/react-query";
import { AppHeader } from "@/components/layout/AppHeader";
import { PageBody } from "@/components/layout/PageBody";
import { Button } from "@/components/ui/Button";
import { AdminTabs } from "@/components/admin/AdminTabs";
import { useProfile } from "@/lib/queries/useProfile";
import { useProfiles } from "@/lib/queries/useProfiles";
import { useGroups } from "@/lib/queries/useGroups";
import { queryKeys } from "@/lib/queries/keys";
import { createClient } from "@/lib/supabase/client";
import adminStyles from "@/components/admin/AdminList.module.css";
import styles from "./page.module.css";

export default function AdminAnfragenPage() {
  const queryClient = useQueryClient();
  const { data: profile } = useProfile();
  const { data: profiles = [] } = useProfiles();
  const { data: groups = [] } = useGroups();

  const requests = profiles.filter((p) => p.status === "pending");

  async function respond(userId: string, approve: boolean) {
    const supabase = createClient();
    if (approve) {
      await supabase.rpc("approve_request", { p_user_id: userId });
    } else {
      await supabase.rpc("reject_request", { p_user_id: userId });
    }
    await queryClient.invalidateQueries({ queryKey: queryKeys.profiles });
  }

  return (
    <>
      <AppHeader title="Anfragen" />
      <PageBody>
        <AdminTabs current="anfragen" isOwner={profile?.role === "owner"} />

        <div className={adminStyles.list}>
          {requests.map((r) => (
            <div key={r.id} className={styles.card}>
              <div>
                <div className={styles.name}>{r.name}</div>
                <div className={styles.email}>{r.email}</div>
                <div className={styles.wants}>
                  Möchte beitreten: {groups.find((g) => g.id === r.group_id)?.name ?? "—"}
                </div>
              </div>
              <div className={styles.actions}>
                <Button variant="accent" size="sm" full onClick={() => respond(r.id, true)}>
                  Bestätigen
                </Button>
                <Button variant="outline" size="sm" full onClick={() => respond(r.id, false)}>
                  Ablehnen
                </Button>
              </div>
            </div>
          ))}
          {requests.length === 0 && <div className={adminStyles.empty}>Keine offenen Anfragen.</div>}
        </div>
      </PageBody>
    </>
  );
}
