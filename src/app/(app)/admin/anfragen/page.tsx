"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AppHeader } from "@/components/layout/AppHeader";
import { PageBody } from "@/components/layout/PageBody";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Input";
import { AdminTabs } from "@/components/admin/AdminTabs";
import { useProfiles } from "@/lib/queries/useProfiles";
import { useGroups } from "@/lib/queries/useGroups";
import { queryKeys } from "@/lib/queries/keys";
import { createClient } from "@/lib/supabase/client";
import { groupLabel } from "@/lib/domain";
import adminStyles from "@/components/admin/AdminList.module.css";
import styles from "./page.module.css";

export default function AdminAnfragenPage() {
  const queryClient = useQueryClient();
  const { data: profiles = [] } = useProfiles();
  const { data: groups = [] } = useGroups();
  // Self-registration no longer picks a group up front (the teamcode step
  // is gone) — the admin assigns a Mannschaft right here, as part of
  // approving, instead of it having been chosen at signup.
  const [pickedGroup, setPickedGroup] = useState<Record<string, string>>({});
  const [error, setError] = useState<Record<string, string>>({});

  const requests = profiles.filter((p) => p.status === "pending");

  async function approve(userId: string) {
    const groupId = pickedGroup[userId];
    if (!groupId) {
      setError((e) => ({ ...e, [userId]: "Bitte wähle eine Gruppe." }));
      return;
    }
    const supabase = createClient();
    const { error: rpcError } = await supabase.rpc("approve_request", { p_user_id: userId, p_group_id: groupId });
    if (rpcError) {
      setError((e) => ({ ...e, [userId]: "Bestätigen fehlgeschlagen." }));
      return;
    }
    await queryClient.invalidateQueries({ queryKey: queryKeys.profiles });
  }

  async function reject(userId: string) {
    const supabase = createClient();
    await supabase.rpc("reject_request", { p_user_id: userId });
    await queryClient.invalidateQueries({ queryKey: queryKeys.profiles });
  }

  return (
    <>
      <AppHeader title="Anfragen" />
      <PageBody>
        <AdminTabs current="anfragen" />

        <div className={adminStyles.list}>
          {requests.map((r) => (
            <div key={r.id} className={styles.card}>
              <div>
                <div className={styles.name}>{r.name}</div>
                <div className={styles.email}>{r.email}</div>
              </div>
              <Select
                label="Gruppe"
                value={pickedGroup[r.id] ?? ""}
                onChange={(e) => setPickedGroup((g) => ({ ...g, [r.id]: e.target.value }))}
              >
                <option value="">— Gruppe wählen —</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {groupLabel(g)}
                  </option>
                ))}
              </Select>
              {error[r.id] && <div className={adminStyles.error}>{error[r.id]}</div>}
              <div className={styles.actions}>
                <Button variant="accent" size="sm" full onClick={() => approve(r.id)}>
                  Bestätigen
                </Button>
                <Button variant="outline" size="sm" full onClick={() => reject(r.id)}>
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
