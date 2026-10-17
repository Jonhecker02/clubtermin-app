"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Input";
import { usePlayerNotes } from "@/lib/queries/usePlayerNotes";
import { queryKeys } from "@/lib/queries/keys";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/types/database";
import styles from "./PlayerNotesPanel.module.css";
import { useUnsavedChanges } from "@/lib/useUnsavedChanges";

function formatNoteDate(iso: string): string {
  return new Date(iso).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function PlayerNotesPanel({
  userId,
  profiles,
  composerFirst = false,
  autoFocus = false,
  bare = false,
}: {
  userId: string;
  profiles: Pick<Profile, "id" | "name">[];
  // Sheet layout: write a new note first, earlier notes below.
  composerFirst?: boolean;
  autoFocus?: boolean;
  // No top border/margin (used inside a sheet).
  bare?: boolean;
}) {
  const queryClient = useQueryClient();
  const { data: notes = [], isLoading } = usePlayerNotes(userId);
  const [draft, setDraft] = useState("");
  // A note typed but not saved yet.
  useUnsavedChanges(draft.trim() !== "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function authorName(authorId: string | null): string {
    if (!authorId) return "Unbekannt";
    return profiles.find((p) => p.id === authorId)?.name ?? "Ehemaliger Admin";
  }

  async function addNote() {
    if (!draft.trim()) return;
    setSaving(true);
    setError("");
    const supabase = createClient();
    const { error: rpcError } = await supabase.rpc("add_player_note", { p_user_id: userId, p_note: draft.trim() });
    setSaving(false);
    if (rpcError) {
      setError("Notiz konnte nicht gespeichert werden.");
      return;
    }
    setDraft("");
    await queryClient.invalidateQueries({ queryKey: queryKeys.playerNotes(userId) });
  }

  async function deleteNote(noteId: string) {
    const supabase = createClient();
    await supabase.from("player_notes").delete().eq("id", noteId);
    await queryClient.invalidateQueries({ queryKey: queryKeys.playerNotes(userId) });
  }

  const composer = (
    <div className={styles.addRow}>
      <Textarea
        autoFocus={autoFocus}
        placeholder="z. B. Arbeitet aktuell an der Rückhand …"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
      />
      {error && <div className={styles.error}>{error}</div>}
      <Button
        variant={composerFirst ? "accent" : "outline"}
        size={composerFirst ? "md" : "sm"}
        full={composerFirst}
        onClick={addNote}
        disabled={saving || !draft.trim()}
      >
        {composerFirst ? "Notiz speichern" : "Notiz hinzufügen"}
      </Button>
    </div>
  );

  return (
    <div className={`${styles.panel} ${bare ? styles.bare : ""}`}>
      {composerFirst && composer}
      {isLoading && <div className={styles.empty}>Notizen werden geladen…</div>}
      {!isLoading && notes.length === 0 && <div className={styles.empty}>Noch keine Notizen.</div>}
      {notes.length > 0 && (
        <ul className={styles.list}>
          {notes.map((n) => (
            <li key={n.id} className={styles.note}>
              <div className={styles.noteText}>{n.note}</div>
              <div className={styles.noteMeta}>
                <span>
                  {authorName(n.author_id)} · {formatNoteDate(n.created_at)}
                </span>
                <button type="button" className={styles.noteDelete} title="Notiz löschen" onClick={() => deleteNote(n.id)}>
                  <Trash2 size={13} strokeWidth={2} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {!composerFirst && composer}
    </div>
  );
}
