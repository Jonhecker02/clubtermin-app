"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Trash2, Plus } from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";
import { Tabs } from "@/components/ui/Tabs";
import { Textarea } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { Badge } from "@/components/ui/Badge";
import { useProfile } from "@/lib/queries/useProfile";
import { useGroups } from "@/lib/queries/useGroups";
import { useAnnouncements } from "@/lib/queries/useAnnouncements";
import { queryKeys } from "@/lib/queries/keys";
import { createClient } from "@/lib/supabase/client";
import { groupLabel } from "@/lib/domain";
import type { UserRole } from "@/types/database";
import adminStyles from "@/components/admin/AdminList.module.css";
import styles from "./page.module.css";
import { useUnsavedChanges } from "@/lib/useUnsavedChanges";

const GROUP_MODE_ITEMS = [
  { id: "alle", label: "Alle Gruppen" },
  { id: "ausgewaehlt", label: "Bestimmte Gruppen" },
];

function formatTime(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}. · ${formatTime(iso)} Uhr`;
}

function roleBadgeTone(role: UserRole): "navy" | "pink" | "amber" | "soft" {
  if (role === "owner" || role === "trainer") return "pink";
  if (role === "captain") return "amber";
  return "soft";
}

const ROLE_LABELS: Record<UserRole, string> = {
  owner: "Clubmanager",
  trainer: "Trainer",
  captain: "Kapitän",
  member: "Spieler",
};

export default function AnkuendigungenPage() {
  const queryClient = useQueryClient();
  const { data: profile } = useProfile();
  const { data: groups = [] } = useGroups();

  const isAdmin = profile?.role === "owner" || profile?.role === "trainer" || profile?.role === "captain";
  const isOwner = profile?.role === "owner";

  const { data: announcements = [] } = useAnnouncements();
  const [composing, setComposing] = useState(false);
  const [announceText, setAnnounceText] = useState("");
  // An announcement being written but not posted yet.
  useUnsavedChanges(composing && announceText.trim() !== "");
  const [visMode, setVisMode] = useState<"alle" | "ausgewaehlt">("alle");
  const [visGroups, setVisGroups] = useState<string[]>([]);
  const [announceError, setAnnounceError] = useState("");
  const [posting, setPosting] = useState(false);

  function toggleGroup(id: string) {
    setVisGroups((list) => (list.includes(id) ? list.filter((g) => g !== id) : [...list, id]));
  }

  function openCompose() {
    setComposing(true);
    setAnnounceText("");
    setVisMode("alle");
    setVisGroups([]);
    setAnnounceError("");
  }

  async function postAnnouncement() {
    const content = announceText.trim();
    if (!content) {
      setAnnounceError("Bitte gib einen Text ein.");
      return;
    }
    if (visMode === "ausgewaehlt" && visGroups.length === 0) {
      setAnnounceError("Bitte wähle mindestens eine Gruppe.");
      return;
    }
    if (!profile) return;

    setPosting(true);
    setAnnounceError("");
    const supabase = createClient();
    const { data, error } = await supabase
      .from("announcements")
      .insert({
        content,
        visible_groups: visMode === "alle" ? ["all"] : visGroups,
        created_by: profile.id,
      })
      .select("id")
      .single();
    setPosting(false);
    if (error) {
      setAnnounceError("Senden fehlgeschlagen.");
      return;
    }

    fetch("/api/notify/announcement-created", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ announcement_id: data.id }),
    }).catch(() => {});

    setComposing(false);
    await queryClient.invalidateQueries({ queryKey: queryKeys.announcements });
  }

  async function deleteAnnouncement(id: string) {
    const supabase = createClient();
    await supabase.rpc("delete_announcement", { p_id: id });
    await queryClient.invalidateQueries({ queryKey: queryKeys.announcements });
  }

  return (
    <>
      <AppHeader title="Ankündigungen" />

      <div className={styles.body}>
        {isAdmin && (
          <div className={adminStyles.countRow}>
            <span className={adminStyles.count}>{announcements.length} Ankündigungen</span>
            <IconButton variant="accent" label="Neue Ankündigung" onClick={openCompose}>
              <Plus size={20} strokeWidth={2.5} />
            </IconButton>
          </div>
        )}

        {composing && (
          <div className={styles.composeCard}>
            <Textarea placeholder="Was möchtest du ankündigen?" value={announceText} onChange={(e) => setAnnounceText(e.target.value)} />
            <div className={adminStyles.fieldGroup}>
              <span className={adminStyles.fieldGroupLabel}>Sichtbar für</span>
              <Tabs items={GROUP_MODE_ITEMS} value={visMode} onChange={(id) => setVisMode(id as typeof visMode)} size="sm" />
              {visMode === "ausgewaehlt" && (
                <div className={adminStyles.checkboxList}>
                  {groups.map((g) => (
                    <label key={g.id} className={adminStyles.checkboxLabel}>
                      <input type="checkbox" checked={visGroups.includes(g.id)} onChange={() => toggleGroup(g.id)} />
                      {groupLabel(g)}
                    </label>
                  ))}
                </div>
              )}
            </div>
            {announceError && <div className={adminStyles.error}>{announceError}</div>}
            <div className={styles.composeActions}>
              <Button variant="accent" size="sm" full onClick={postAnnouncement} disabled={posting}>
                Senden
              </Button>
              <Button variant="outline" size="sm" full onClick={() => setComposing(false)}>
                Abbrechen
              </Button>
            </div>
          </div>
        )}

        <div className={styles.announcementList}>
          {announcements.map((a) => (
            <div key={a.id} className={styles.announcementCard}>
              <div className={styles.announcementHead}>
                <div className={styles.announcementAuthor}>
                  <span className={styles.announcementName}>{a.authorName}</span>
                  <Badge tone={roleBadgeTone(a.authorRole)} size="sm">
                    {ROLE_LABELS[a.authorRole]}
                  </Badge>
                </div>
                {isOwner && (
                  <IconButton variant="ghost" size="sm" label="Ankündigung löschen" onClick={() => deleteAnnouncement(a.id)}>
                    <Trash2 size={14} strokeWidth={2} />
                  </IconButton>
                )}
              </div>
              <div className={styles.announcementContent}>{a.content}</div>
              <span className={styles.announcementTime}>{formatDateTime(a.created_at)}</span>
            </div>
          ))}
          {announcements.length === 0 && <div className={styles.empty}>Noch keine Ankündigungen.</div>}
        </div>
      </div>
    </>
  );
}
