"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, StickyNote, Trash2 } from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";
import { PageBody } from "@/components/layout/PageBody";
import { IconButton } from "@/components/ui/IconButton";
import { Badge } from "@/components/ui/Badge";
import { Input, Select } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { AdminTabs } from "@/components/admin/AdminTabs";
import { PlayerNotesPanel } from "@/components/admin/PlayerNotesPanel";
import { useProfile } from "@/lib/queries/useProfile";
import { useProfiles } from "@/lib/queries/useProfiles";
import { useGroups } from "@/lib/queries/useGroups";
import { queryKeys } from "@/lib/queries/keys";
import { createClient } from "@/lib/supabase/client";
import { groupLabel } from "@/lib/domain";
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
  const [editFirstName, setEditFirstName] = useState("");
  const [editLastName, setEditLastName] = useState("");
  const [editGroupId, setEditGroupId] = useState("");
  const [editRotationExcluded, setEditRotationExcluded] = useState(false);
  const [editError, setEditError] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [notesOpenId, setNotesOpenId] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [createFirstName, setCreateFirstName] = useState("");
  const [createLastName, setCreateLastName] = useState("");
  const [createGroupId, setCreateGroupId] = useState("");
  const [createRole, setCreateRole] = useState<UserRole>("member");
  const [createError, setCreateError] = useState("");
  const [createLoading, setCreateLoading] = useState(false);
  const [createdCredentials, setCreatedCredentials] = useState<{ name: string; password: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const sorted = [...profiles].sort((a, b) => a.name.localeCompare(b.name));

  function resetCreateForm() {
    setShowCreate(false);
    setCreateFirstName("");
    setCreateLastName("");
    setCreateGroupId("");
    setCreateRole("member");
    setCreateError("");
    setCreatedCredentials(null);
    setCopied(false);
  }

  async function createUser() {
    if (!createFirstName.trim() || !createLastName.trim()) {
      setCreateError("Bitte gib Vor- und Nachname ein.");
      return;
    }
    if (!createGroupId) {
      setCreateError("Bitte wähle eine Gruppe.");
      return;
    }
    setCreateLoading(true);
    setCreateError("");
    const res = await fetch("/api/admin/create-user", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: `${createFirstName.trim()} ${createLastName.trim()}`,
        group_id: createGroupId,
        role: createRole,
      }),
    });
    const data = await res.json();
    setCreateLoading(false);
    if (!res.ok) {
      if (data.error === "name_taken") setCreateError("Dieser Name ist schon vergeben — bitte eindeutig machen.");
      else if (data.error === "group_missing_short_code")
        setCreateError("Diese Gruppe hat noch kein Kürzel — erst in Admin → Gruppen ein Kürzel vergeben.");
      else setCreateError("Anlegen fehlgeschlagen.");
      return;
    }
    setCreatedCredentials({ name: data.name, password: data.password });
    await queryClient.invalidateQueries({ queryKey: queryKeys.profiles });
  }

  function startEdit(id: string, name: string, groupId: string | null, rotationExcluded: boolean) {
    // Splits on the first space only, so a multi-word last name ("van der
    // Berg") stays intact in the Nachname box instead of losing everything
    // after the second word.
    const [first, ...rest] = name.trim().split(/\s+/);
    setEditingId(id);
    setEditFirstName(first ?? "");
    setEditLastName(rest.join(" "));
    setEditGroupId(groupId ?? "");
    setEditRotationExcluded(rotationExcluded);
    setEditError("");
  }

  async function saveEdit() {
    if (!editFirstName.trim() || !editLastName.trim()) {
      setEditError("Bitte gib Vor- und Nachname ein.");
      return;
    }
    const supabase = createClient();
    const { error } = await supabase.rpc("admin_update_profile", {
      p_user_id: editingId!,
      p_name: `${editFirstName.trim()} ${editLastName.trim()}`,
      p_group_id: editGroupId || null,
    });
    if (error) {
      setEditError("Speichern fehlgeschlagen.");
      return;
    }
    await supabase.rpc("admin_set_rotation_excluded", { p_user_id: editingId!, p_excluded: editRotationExcluded });
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
          {profile?.role === "owner" && (
            <IconButton
              variant="accent"
              label="Nutzer anlegen"
              onClick={() => (showCreate ? resetCreateForm() : setShowCreate(true))}
            >
              <Plus size={20} strokeWidth={2.5} />
            </IconButton>
          )}
        </div>

        {showCreate && (
          <div className={styles.card} style={{ marginBottom: 14 }}>
            {createdCredentials ? (
              <>
                <div className={styles.name}>Zugangsdaten für {createdCredentials.name}</div>
                <div className={styles.hint}>Gib diese Daten direkt weiter (z. B. persönlich oder per Chat) — es wird keine E-Mail verschickt.</div>
                <div className={styles.passwordBox}>
                  <span className={styles.passwordValue}>{createdCredentials.password}</span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      navigator.clipboard.writeText(createdCredentials.password);
                      setCopied(true);
                    }}
                  >
                    {copied ? "Kopiert!" : "Kopieren"}
                  </Button>
                </div>
                <Button variant="accent" size="sm" full onClick={resetCreateForm}>
                  Fertig
                </Button>
              </>
            ) : (
              <div className={styles.editRow}>
                <Input label="Vorname" placeholder="Max" value={createFirstName} onChange={(e) => setCreateFirstName(e.target.value)} />
                <Input
                  label="Nachname"
                  placeholder="Mustermann"
                  value={createLastName}
                  onChange={(e) => setCreateLastName(e.target.value)}
                />
                <Select label="Gruppe" value={createGroupId} onChange={(e) => setCreateGroupId(e.target.value)}>
                  <option value="">— Gruppe wählen —</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {groupLabel(g)}
                    </option>
                  ))}
                </Select>
                <Select label="Rolle" value={createRole} onChange={(e) => setCreateRole(e.target.value as UserRole)}>
                  <option value="member">Spieler</option>
                  <option value="captain">Kapitän</option>
                  <option value="trainer">Trainer</option>
                </Select>
                {createError && <div className={styles.error}>{createError}</div>}
                <div className={styles.editActions}>
                  <Button variant="accent" size="sm" full onClick={createUser} disabled={createLoading}>
                    Anlegen
                  </Button>
                  <Button variant="outline" size="sm" full onClick={resetCreateForm}>
                    Abbrechen
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

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
                      <IconButton
                        variant="soft"
                        size="sm"
                        label="Bearbeiten"
                        onClick={() => startEdit(p.id, p.name, p.group_id, p.rotation_excluded)}
                      >
                        <Pencil size={15} strokeWidth={2} />
                      </IconButton>
                      <IconButton
                        variant={notesOpenId === p.id ? "accent" : "soft"}
                        size="sm"
                        label="Notizen"
                        onClick={() => setNotesOpenId(notesOpenId === p.id ? null : p.id)}
                      >
                        <StickyNote size={15} strokeWidth={2} />
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
                    {notesOpenId === p.id && <PlayerNotesPanel userId={p.id} profiles={profiles} />}
                  </>
                ) : (
                  <div className={styles.editRow}>
                    <Input label="Vorname" value={editFirstName} onChange={(e) => setEditFirstName(e.target.value)} error={editError} />
                    <Input label="Nachname" value={editLastName} onChange={(e) => setEditLastName(e.target.value)} />
                    <Select label="Gruppe" value={editGroupId} onChange={(e) => setEditGroupId(e.target.value)}>
                      <option value="">— keine Gruppe —</option>
                      {groups.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.name}
                        </option>
                      ))}
                    </Select>
                    <label className={adminStyles.checkboxLabel}>
                      <input
                        type="checkbox"
                        checked={editRotationExcluded}
                        onChange={(e) => setEditRotationExcluded(e.target.checked)}
                      />
                      Von fairer Rotation ausgeschlossen (bekommt Platz garantiert)
                    </label>
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
