"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Send, Trash2, Plus } from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";
import { Tabs } from "@/components/ui/Tabs";
import { Input, Textarea } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { Badge } from "@/components/ui/Badge";
import { useProfile } from "@/lib/queries/useProfile";
import { useGroups } from "@/lib/queries/useGroups";
import { useMessages } from "@/lib/queries/useMessages";
import { useAnnouncements } from "@/lib/queries/useAnnouncements";
import { queryKeys } from "@/lib/queries/keys";
import { createClient } from "@/lib/supabase/client";
import { groupLabel, initials } from "@/lib/domain";
import type { UserRole } from "@/types/database";
import adminStyles from "@/components/admin/AdminList.module.css";
import styles from "./page.module.css";

const MODE_ITEMS = [
  { id: "chat", label: "Chat" },
  { id: "ankuendigungen", label: "Ankündigungen" },
];

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

function bubbleClass(role: UserRole): string {
  if (role === "owner" || role === "trainer") return styles.bubbleTrainer;
  if (role === "captain") return styles.bubbleCaptain;
  return "";
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

export default function ChatPage() {
  const queryClient = useQueryClient();
  const { data: profile } = useProfile();
  const { data: groups = [] } = useGroups();

  const isAdmin = profile?.role === "owner" || profile?.role === "trainer" || profile?.role === "captain";
  const isOwner = profile?.role === "owner";
  const [mode, setMode] = useState<"chat" | "ankuendigungen">("chat");

  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const groupId = selectedGroupId ?? profile?.group_id ?? null;

  const { data: messages = [] } = useMessages(groupId);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const groupTabs = useMemo(() => groups.map((g) => ({ id: g.id, label: groupLabel(g) })), [groups]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, groupId]);

  async function send() {
    const content = text.trim();
    if (!content || !groupId || !profile) return;
    setSending(true);
    setText("");
    const supabase = createClient();
    const { error } = await supabase.from("messages").insert({ group_id: groupId, user_id: profile.id, content });
    setSending(false);
    if (error) {
      setText(content);
      return;
    }
    await queryClient.invalidateQueries({ queryKey: queryKeys.messages(groupId) });
  }

  async function deleteMessage(messageId: string) {
    const supabase = createClient();
    await supabase.rpc("delete_message", { p_message_id: messageId });
    if (groupId) await queryClient.invalidateQueries({ queryKey: queryKeys.messages(groupId) });
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  // --- Ankündigungen ---
  const { data: announcements = [] } = useAnnouncements();
  const [composing, setComposing] = useState(false);
  const [announceText, setAnnounceText] = useState("");
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
      <AppHeader
        title="Chat"
        right={<Tabs items={MODE_ITEMS} value={mode} onChange={(id) => setMode(id as typeof mode)} size="sm" onDark style={{ width: "auto" }} />}
      />

      {mode === "chat" ? (
        <>
          <div className={styles.body}>
            {isAdmin && groupTabs.length > 0 && (
              <Tabs items={groupTabs} value={groupId ?? ""} onChange={setSelectedGroupId} size="sm" className={styles.groupTabs} />
            )}

            <div className={styles.messages}>
              {messages.map((m) => {
                const mine = m.user_id === profile?.id;
                return (
                  <div key={m.id} className={[styles.row, mine ? styles.rowMine : ""].join(" ")}>
                    <div className={styles.avatar}>{initials(m.name)}</div>
                    <div className={styles.bubbleCol}>
                      {!mine && (
                        <span className={styles.meta}>
                          {m.name} · {ROLE_LABELS[m.role]}
                        </span>
                      )}
                      <div className={[styles.bubble, bubbleClass(m.role)].join(" ")}>{m.content}</div>
                      <span className={styles.meta}>{formatTime(m.created_at)}</span>
                    </div>
                    {isOwner && (
                      <IconButton
                        variant="ghost"
                        size="sm"
                        label="Nachricht löschen"
                        className={styles.deleteBtn}
                        onClick={() => deleteMessage(m.id)}
                      >
                        <Trash2 size={14} strokeWidth={2} />
                      </IconButton>
                    )}
                  </div>
                );
              })}
              {messages.length === 0 && <div className={styles.empty}>Noch keine Nachrichten — schreib die erste!</div>}
              <div ref={bottomRef} />
            </div>
          </div>

          <div className={styles.inputBar}>
            <Input
              className={styles.inputField}
              placeholder="Nachricht schreiben…"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={!groupId}
            />
            <IconButton variant="accent" label="Senden" onClick={send} disabled={!text.trim() || sending || !groupId}>
              <Send size={18} strokeWidth={2.2} />
            </IconButton>
          </div>
        </>
      ) : (
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
      )}
    </>
  );
}
