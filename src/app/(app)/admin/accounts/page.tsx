"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Pencil, Trash2 } from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";
import { PageBody } from "@/components/layout/PageBody";
import { IconButton } from "@/components/ui/IconButton";
import { Badge } from "@/components/ui/Badge";
import { Input, Select } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { AdminTabs } from "@/components/admin/AdminTabs";
import { useProfile } from "@/lib/queries/useProfile";
import { useProfiles } from "@/lib/queries/useProfiles";
import { useGroups } from "@/lib/queries/useGroups";
import { queryKeys } from "@/lib/queries/keys";
import { createClient } from "@/lib/supabase/client";
import type { UserRole, UserStatus } from "@/types/database";
import adminStyles from "@/components/admin/AdminList.module.css";
import styles from "./page.module.css";

const ROLE_LABELS: Record<UserRole, string> = {
  owner: "Clubmanager",
  trainer: "Trainer",
  captain: "Kapitän",
  member: "Spieler",
};

function statusInfo(status: UserStatus | null): { label: string; tone: "soft" | "amber" | "outline" } {
  if (status === "approved") return { label: "Aktiv", tone: "soft" };
  if (status === "pending") return { label: "Anfrage offen", tone: "amber" };
  if (status === "rejected") return { label: "Abgelehnt", tone: "outline" };
  return { label: "Kein Teamcode", tone: "outline" };
}

export default function AdminAccountsPage() {
  const queryClient = useQueryClient();
  const { data: profile } = useProfile();
  const { data: profiles = [] } = useProfiles();
  const { data: groups = [] } = useGroups();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editGroupId, setEditGroupId] = useState("");
  const [editError, setEditError] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const [deleting, setDeleting] = useState(false);

  const sorted = [...profiles].sort((a, b) => a.name.localeCompare(b.name));

  function startEdit(id: string, name: string, groupId: string | null) {
    setEditingId(id);
    setEditName(name);
    setEditGroupId(groupId ?? "");
    setEditError("");
  }

  async function saveEdit() {
    if (!editName.trim()) {
      setEditError("Bitte gib einen Namen ein.");
      return;
    }
    const supabase = createClient();
    const { error } = await supabase.rpc("admin_update_profile", {
      p_user_id: editingId!,
      p_name: editName.trim(),
      p_group_id: editGroupId || null,
    });
    if (error) {
      setEditError("Speichern fehlgeschlagen.");
      return;
    }
    setEditingId(null);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.profiles }),
      queryClient.invalidateQueries({ queryKey: ["registrations"] }),
    ]);
  }

  async function deleteAccount(id: string) {
    setDeleting(true);
    setDeleteError("");
    const res = await fetch("/api/admin/delete-account", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: id }),
    });
    setDeleting(false);
    if (!res.ok) {
      setDeleteError("Löschen fehlgeschlagen.");
      return;
    }
    setConfirmDeleteId(null);
    await queryClient.invalidateQueries({ queryKey: queryKeys.profiles });
  }

  return (
    <>
      <AppHeader title="Accounts" />
      <PageBody>
        <AdminTabs current="accounts" isOwner={profile?.role === "owner"} />

        <div className={adminStyles.countRow}>
          <span className={adminStyles.count}>{sorted.length} Accounts</span>
        </div>

        <div className={adminStyles.list}>
          {sorted.map((p) => {
            const isEditing = editingId === p.id;
            const isSelf = p.id === profile?.id;
            const isOwnerAccount = p.role === "owner";
            const status = statusInfo(p.status);

            return (
              <div key={p.id} className={styles.card}>
                {!isEditing ? (
                  <>
                    <div className={styles.headRow}>
                      <div className={styles.info}>
                        <div className={styles.nameRow}>
                          <span className={styles.name}>{p.name}</span>
                          {isSelf && (
                            <Badge tone="outline" size="sm">
                              Du
                            </Badge>
                          )}
                        </div>
                        <div className={styles.meta}>{p.email}</div>
                        <div className={styles.meta}>
                          {ROLE_LABELS[p.role]} · {groups.find((g) => g.id === p.group_id)?.name ?? "—"}
                        </div>
                      </div>
                      <Badge tone={status.tone} size="sm">
                        {status.label}
                      </Badge>
                    </div>
                    <div className={styles.actions}>
                      <IconButton variant="soft" size="sm" label="Bearbeiten" onClick={() => startEdit(p.id, p.name, p.group_id)}>
                        <Pencil size={15} strokeWidth={2} />
                      </IconButton>
                      {!isOwnerAccount &&
                        !isSelf &&
                        (confirmDeleteId === p.id ? (
                          <div className={styles.confirmRow}>
                            <span className={styles.confirmText}>Account wirklich löschen?</span>
                            <Button variant="accent" size="sm" onClick={() => deleteAccount(p.id)} disabled={deleting}>
                              Ja, löschen
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setConfirmDeleteId(null);
                                setDeleteError("");
                              }}
                            >
                              Abbrechen
                            </Button>
                          </div>
                        ) : (
                          <IconButton
                            variant="ghost"
                            size="sm"
                            label="Account löschen"
                            onClick={() => {
                              setConfirmDeleteId(p.id);
                              setDeleteError("");
                            }}
                          >
                            <Trash2 size={15} strokeWidth={2} />
                          </IconButton>
                        ))}
                    </div>
                    {confirmDeleteId === p.id && deleteError && <div className={styles.error}>{deleteError}</div>}
                  </>
                ) : (
                  <div className={styles.editRow}>
                    <Input label="Name" value={editName} onChange={(e) => setEditName(e.target.value)} error={editError} />
                    <Select label="Gruppe" value={editGroupId} onChange={(e) => setEditGroupId(e.target.value)}>
                      <option value="">— keine Gruppe —</option>
                      {groups.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.name}
                        </option>
                      ))}
                    </Select>
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
              </div>
            );
          })}
          {sorted.length === 0 && <div className={adminStyles.empty}>Noch keine Accounts.</div>}
        </div>
      </PageBody>
    </>
  );
}
