"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil } from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";
import { PageBody } from "@/components/layout/PageBody";
import { IconButton } from "@/components/ui/IconButton";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { AdminTabs } from "@/components/admin/AdminTabs";
import { useProfile } from "@/lib/queries/useProfile";
import { useGroups } from "@/lib/queries/useGroups";
import { useProfiles } from "@/lib/queries/useProfiles";
import { queryKeys } from "@/lib/queries/keys";
import { createClient } from "@/lib/supabase/client";
import adminStyles from "@/components/admin/AdminList.module.css";
import styles from "./page.module.css";

export default function AdminGruppenPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: profile } = useProfile();
  const { data: groups = [] } = useGroups();
  const { data: profiles = [] } = useProfiles();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editShortCode, setEditShortCode] = useState("");
  const [editError, setEditError] = useState("");
  const [confirmKick, setConfirmKick] = useState<string | null>(null);

  function startEdit(id: string, name: string, shortCode: string | null) {
    setEditingId(id);
    setEditName(name);
    setEditShortCode(shortCode ?? "");
    setEditError("");
  }

  async function saveEdit() {
    if (!editName.trim()) {
      setEditError("Bitte gib einen Namen ein.");
      return;
    }
    const supabase = createClient();
    const { error } = await supabase.rpc("rename_group", {
      p_group_id: editingId!,
      p_name: editName.trim(),
      p_short_code: editShortCode.trim() || null,
    });
    if (error) {
      setEditError("Speichern fehlgeschlagen.");
      return;
    }
    setEditingId(null);
    await queryClient.invalidateQueries({ queryKey: queryKeys.groups });
  }

  async function kickMember(userId: string) {
    const supabase = createClient();
    await supabase.rpc("remove_group_member", { p_user_id: userId });
    fetch("/api/notify/waitlist-promoted", { method: "POST" }).catch(() => {});
    setConfirmKick(null);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.profiles }),
      queryClient.invalidateQueries({ queryKey: ["registrations"] }),
    ]);
  }

  return (
    <>
      <AppHeader title="Gruppen" />
      <PageBody>
        <AdminTabs current="gruppen" isOwner={profile?.role === "owner"} />

        <div className={adminStyles.countRow}>
          <span className={adminStyles.count}>{groups.length} Gruppen</span>
          <IconButton variant="accent" label="Neue Gruppe" onClick={() => router.push("/admin/gruppen/neu")}>
            <Plus size={20} strokeWidth={2.5} />
          </IconButton>
        </div>

        <div className={adminStyles.list}>
          {groups.map((g) => {
            const members = profiles
              .filter((p) => p.group_id === g.id && p.status === "approved")
              .sort((a, b) => a.name.localeCompare(b.name));
            const isEditing = editingId === g.id;

            return (
              <div key={g.id} className={styles.groupCard}>
                {!isEditing ? (
                  <div className={styles.headRow}>
                    <div className={styles.nameCol}>
                      <span className={styles.groupName}>
                        {g.short_code && <span className={styles.shortCode}>{g.short_code} - </span>}
                        {g.name}
                      </span>
                      <span className={styles.groupCode}>{g.code}</span>
                    </div>
                    <IconButton
                      variant="soft"
                      size="sm"
                      label="Gruppe bearbeiten"
                      onClick={() => startEdit(g.id, g.name, g.short_code)}
                    >
                      <Pencil size={15} strokeWidth={2} />
                    </IconButton>
                  </div>
                ) : (
                  <div className={styles.editRow}>
                    <div className={styles.editFieldRow}>
                      <Input label="Gruppenname" value={editName} onChange={(e) => setEditName(e.target.value)} error={editError} />
                      <Input label="Kürzel" placeholder="z. B. H00" value={editShortCode} onChange={(e) => setEditShortCode(e.target.value)} />
                    </div>
                    <div className={styles.editActions}>
                      <Button variant="accent" size="sm" full onClick={saveEdit}>
                        Speichern
                      </Button>
                      <Button variant="outline" size="sm" full onClick={() => setEditingId(null)}>
                        Abbrechen
                      </Button>
                    </div>
                  </div>
                )}

                <div className={styles.divider} />
                <div className={styles.memberCount}>{members.length} Teilnehmer</div>
                <div className={styles.chips}>
                  {members.map((m) =>
                    confirmKick === m.id ? (
                      <span key={m.id} className={styles.chipConfirm}>
                        {m.name} entfernen?
                        <button type="button" className={styles.chipConfirmBtn} onClick={() => kickMember(m.id)}>
                          Ja
                        </button>
                        <button type="button" className={styles.chipCancelBtn} onClick={() => setConfirmKick(null)}>
                          Abbrechen
                        </button>
                      </span>
                    ) : (
                      <span key={m.id} className={styles.chip}>
                        {m.name}
                        <button
                          type="button"
                          className={styles.chipRemove}
                          title="Aus Gruppe entfernen"
                          onClick={() => setConfirmKick(m.id)}
                        >
                          ×
                        </button>
                      </span>
                    ),
                  )}
                </div>
                {members.length === 0 && (
                  <div className={styles.noMembers}>Noch keine Teilnehmer für diese Gruppe angemeldet.</div>
                )}
              </div>
            );
          })}
        </div>
      </PageBody>
    </>
  );
}
