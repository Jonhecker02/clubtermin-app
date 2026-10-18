"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Check, KeyRound, Pencil, Plus, StickyNote, Trash2 } from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";
import { PageBody } from "@/components/layout/PageBody";
import { IconButton } from "@/components/ui/IconButton";
import { Badge } from "@/components/ui/Badge";
import { Input, Select } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { AdminTabs } from "@/components/admin/AdminTabs";
import { PlayerNotesPanel } from "@/components/admin/PlayerNotesPanel";
import { TrainerGroupsPicker } from "@/components/admin/TrainerGroupsPicker";
import { useProfile } from "@/lib/queries/useProfile";
import { useProfiles } from "@/lib/queries/useProfiles";
import { useGroups } from "@/lib/queries/useGroups";
import { useTrainerGroups } from "@/lib/queries/useTrainerGroups";
import { usePersonalDetails } from "@/lib/queries/usePersonalDetails";
import { PersonName } from "@/components/PersonName";
import { queryKeys } from "@/lib/queries/keys";
import { createClient } from "@/lib/supabase/client";
import { displayEmail, groupLabel } from "@/lib/domain";
import type { Gender, UserRole, UserStatus } from "@/types/database";
import adminStyles from "@/components/admin/AdminList.module.css";
import styles from "./page.module.css";
import { useUnsavedChanges } from "@/lib/useUnsavedChanges";

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
  return { label: "Keine Gruppe", tone: "outline" };
}

export default function AdminAccountsPage() {
  const queryClient = useQueryClient();
  const { data: profile } = useProfile();
  const { data: profiles = [] } = useProfiles();
  const { data: groups = [] } = useGroups();
  const { data: trainerGroups = [] } = useTrainerGroups();
  const { data: details = {} } = usePersonalDetails();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editFirstName, setEditFirstName] = useState("");
  const [editLastName, setEditLastName] = useState("");
  const [editGroupId, setEditGroupId] = useState("");
  const [editRotationExcluded, setEditRotationExcluded] = useState(false);
  const [editTrainerGroupIds, setEditTrainerGroupIds] = useState<string[]>([]);
  const [editBaseline, setEditBaseline] = useState("");
  const [editBirth, setEditBirth] = useState("");
  const [editGender, setEditGender] = useState("");
  const [editError, setEditError] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [notesOpenId, setNotesOpenId] = useState<string | null>(null);
  const [confirmResetId, setConfirmResetId] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState("");
  const [resetResult, setResetResult] = useState<{ userId: string; password: string } | null>(null);
  const [resetCopied, setResetCopied] = useState(false);

  const [showCreate, setShowCreate] = useState(false);
  const [createFirstName, setCreateFirstName] = useState("");
  const [createLastName, setCreateLastName] = useState("");
  const [createGroupId, setCreateGroupId] = useState("");
  const [createRole, setCreateRole] = useState<UserRole>("member");
  const [createTrainerGroupIds, setCreateTrainerGroupIds] = useState<string[]>([]);
  const [createBirth, setCreateBirth] = useState("");
  const [createGender, setCreateGender] = useState("");
  const [createError, setCreateError] = useState("");
  const [createLoading, setCreateLoading] = useState(false);
  const [createdCredentials, setCreatedCredentials] = useState<{ name: string; password: string } | null>(null);
  const [copied, setCopied] = useState(false);

  // An open edit/create form with values that differ from where it started.
  const editSnapshot = JSON.stringify([
    editFirstName.trim(), editLastName.trim(), editGroupId, editRotationExcluded, [...editTrainerGroupIds].sort(), editBirth, editGender,
  ]);
  const createDirty =
    showCreate &&
    !createdCredentials &&
    (createFirstName.trim() !== "" || createLastName.trim() !== "" || createGroupId !== "" || createRole !== "member" || createTrainerGroupIds.length > 0 || createBirth !== "" || createGender !== "");
  useUnsavedChanges((editingId !== null && editSnapshot !== editBaseline) || createDirty);

  const sorted = [...profiles].sort((a, b) => a.name.localeCompare(b.name));

  function trainerGroupNames(userId: string): string {
    return trainerGroups
      .filter((t) => t.user_id === userId)
      .map((t) => groups.find((g) => g.id === t.group_id))
      .filter((g): g is NonNullable<typeof g> => !!g)
      .map((g) => g.short_code || g.name)
      .join(", ");
  }

  function resetCreateForm() {
    setShowCreate(false);
    setCreateFirstName("");
    setCreateLastName("");
    setCreateGroupId("");
    setCreateRole("member");
    setCreateTrainerGroupIds([]);
    setCreateBirth("");
    setCreateGender("");
    setCreateError("");
    setCreatedCredentials(null);
    setCopied(false);
  }

  async function createUser() {
    if (!createFirstName.trim() || !createLastName.trim()) {
      setCreateError("Bitte gib Vor- und Nachname ein.");
      return;
    }
    // Trainer sind nicht an eine Mannschaft gebunden (anders als Spieler und
    // Kapitän) — sie bekommen stattdessen beliebig viele "Trainer von"-Gruppen.
    if (createRole !== "trainer" && !createGroupId) {
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
        group_id: createRole === "trainer" ? null : createGroupId || null,
        role: createRole,
        trainer_group_ids: createRole === "trainer" ? createTrainerGroupIds : [],
        birth_date: createBirth || null,
        gender: createGender || null,
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
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.profiles }),
      queryClient.invalidateQueries({ queryKey: queryKeys.trainerGroups }),
    ]);
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
    const initialTrainerGroups = trainerGroups.filter((t) => t.user_id === id).map((t) => t.group_id);
    setEditTrainerGroupIds(initialTrainerGroups);
    const initialBirth = details[id]?.birth_date ?? "";
    const initialGender = details[id]?.gender ?? "";
    setEditBirth(initialBirth);
    setEditGender(initialGender);
    setEditBaseline(
      JSON.stringify([first ?? "", rest.join(" "), groupId ?? "", rotationExcluded, [...initialTrainerGroups].sort(), initialBirth, initialGender]),
    );
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
    if (editBirth !== (details[editingId!]?.birth_date ?? "") || editGender !== (details[editingId!]?.gender ?? "")) {
      const { error: detailsError } = await supabase.rpc("admin_set_personal_details", {
        p_user_id: editingId!,
        p_birth_date: editBirth || null,
        p_gender: (editGender || null) as Gender | null,
      });
      if (detailsError) {
        setEditError("Geburtsdatum / Geschlecht konnte nicht gespeichert werden.");
        return;
      }
    }
    if (profiles.find((p) => p.id === editingId)?.role === "trainer") {
      await supabase.rpc("set_trainer_groups", { p_user_id: editingId!, p_group_ids: editTrainerGroupIds });
    }
    setEditingId(null);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.trainerGroups }),
      queryClient.invalidateQueries({ queryKey: ["personalDetails"] }),
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

  async function resetPassword(id: string) {
    setResetting(true);
    setResetError("");
    const res = await fetch("/api/admin/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: id }),
    });
    const data = await res.json();
    setResetting(false);
    if (!res.ok) {
      setResetError("Zurücksetzen fehlgeschlagen.");
      return;
    }
    setConfirmResetId(null);
    setResetCopied(false);
    setResetResult({ userId: id, password: data.password });
  }

  return (
    <>
      <AppHeader title="Accounts" />
      <PageBody>
        <AdminTabs current="accounts" />

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
                <Input
                  label="Geburtsdatum (optional)"
                  type="date"
                  value={createBirth}
                  onChange={(e) => setCreateBirth(e.target.value)}
                  max={new Date().toISOString().slice(0, 10)}
                />
                <Select label="Geschlecht (optional)" value={createGender} onChange={(e) => setCreateGender(e.target.value)}>
                  <option value="">—</option>
                  <option value="m">Herr</option>
                  <option value="w">Dame</option>
                </Select>
                <Select label="Rolle" value={createRole} onChange={(e) => setCreateRole(e.target.value as UserRole)}>
                  <option value="member">Spieler</option>
                  <option value="captain">Kapitän</option>
                  <option value="trainer">Trainer</option>
                </Select>
                {createRole === "trainer" ? (
                  <div>
                    <div className={styles.hint}>Trainer von (mehrere möglich, optional)</div>
                    <TrainerGroupsPicker groups={groups} value={createTrainerGroupIds} onChange={setCreateTrainerGroupIds} />
                  </div>
                ) : (
                  <Select label="Gruppe" value={createGroupId} onChange={(e) => setCreateGroupId(e.target.value)}>
                    <option value="">— Gruppe wählen —</option>
                    {groups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {groupLabel(g)}
                      </option>
                    ))}
                  </Select>
                )}
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
                          <PersonName className={styles.name} name={p.name} userId={p.id} />
                          {isSelf && (
                            <Badge tone="outline" size="sm">
                              Du
                            </Badge>
                          )}
                        </div>
                        {displayEmail(p.email) && <div className={styles.meta}>{displayEmail(p.email)}</div>}
                        <div className={styles.meta}>
                          {ROLE_LABELS[p.role]} ·{" "}
                          {p.role === "trainer"
                            ? trainerGroupNames(p.id) || "keine Gruppe zugeordnet"
                            : (groups.find((g) => g.id === p.group_id)?.name ?? "—")}
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
                      {confirmResetId === p.id ? (
                        <div className={styles.confirmRow}>
                          <span className={styles.confirmText}>Neues Passwort vergeben?</span>
                          <Button variant="accent" size="sm" onClick={() => resetPassword(p.id)} disabled={resetting}>
                            Ja, zurücksetzen
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setConfirmResetId(null);
                              setResetError("");
                            }}
                          >
                            Abbrechen
                          </Button>
                        </div>
                      ) : (
                        <IconButton
                          variant="ghost"
                          size="sm"
                          label="Passwort zurücksetzen"
                          onClick={() => {
                            setConfirmResetId(p.id);
                            setResetError("");
                          }}
                        >
                          <KeyRound size={15} strokeWidth={2} />
                        </IconButton>
                      )}
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
                    {confirmResetId === p.id && resetError && <div className={styles.error}>{resetError}</div>}
                    {resetResult?.userId === p.id && (
                      <>
                        <div className={styles.hint}>Neues Passwort — gib es direkt weiter, der Rest des Accounts bleibt unverändert.</div>
                        <div className={styles.passwordBox}>
                          <span className={styles.passwordValue}>{resetResult.password}</span>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              navigator.clipboard.writeText(resetResult.password);
                              setResetCopied(true);
                            }}
                          >
                            {resetCopied ? "Kopiert!" : "Kopieren"}
                          </Button>
                          <IconButton variant="ghost" size="sm" label="Fertig" onClick={() => setResetResult(null)}>
                            <Check size={15} strokeWidth={2} />
                          </IconButton>
                        </div>
                      </>
                    )}
                    {notesOpenId === p.id && <PlayerNotesPanel userId={p.id} profiles={profiles} />}
                  </>
                ) : (
                  <div className={styles.editRow}>
                    <Input label="Vorname" value={editFirstName} onChange={(e) => setEditFirstName(e.target.value)} error={editError} />
                    <Input label="Nachname" value={editLastName} onChange={(e) => setEditLastName(e.target.value)} />
                    <Input
                      label="Geburtsdatum"
                      type="date"
                      value={editBirth}
                      onChange={(e) => setEditBirth(e.target.value)}
                      max={new Date().toISOString().slice(0, 10)}
                    />
                    <Select label="Geschlecht" value={editGender} onChange={(e) => setEditGender(e.target.value)}>
                      <option value="">—</option>
                      <option value="m">Herr</option>
                      <option value="w">Dame</option>
                    </Select>
                    <Select
                      label={p.role === "trainer" ? "Gruppe als Spieler (optional)" : "Gruppe"}
                      value={editGroupId}
                      onChange={(e) => setEditGroupId(e.target.value)}
                    >
                      <option value="">— keine Gruppe —</option>
                      {groups.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.name}
                        </option>
                      ))}
                    </Select>
                    {p.role === "trainer" && (
                      <div>
                        <div className={styles.hint}>Trainer von (mehrere möglich)</div>
                        <TrainerGroupsPicker groups={groups} value={editTrainerGroupIds} onChange={setEditTrainerGroupIds} />
                      </div>
                    )}
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
