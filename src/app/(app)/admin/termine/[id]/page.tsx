"use client";

import { useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toPng } from "html-to-image";
import { ArrowLeft, Copy, ImageDown, Pencil, Plus, X } from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";
import { PageBody } from "@/components/layout/PageBody";
import { IconButton } from "@/components/ui/IconButton";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { TerminExportCard } from "@/components/admin/TerminExportCard";
import { useTermine } from "@/lib/queries/useTermine";
import { useGroups } from "@/lib/queries/useGroups";
import { useProfiles } from "@/lib/queries/useProfiles";
import { useRegistrationsForTermin } from "@/lib/queries/useRegistrations";
import { queryKeys } from "@/lib/queries/keys";
import { createClient } from "@/lib/supabase/client";
import {
  badgeInfo,
  buildTerminShareText,
  formatPrice,
  fullDateLabel,
  hhmm,
  initials,
  weekdayLabel,
  dateLabel,
  groupShortCode,
  withShortCode,
} from "@/lib/domain";
import adminStyles from "@/components/admin/AdminList.module.css";
import styles from "./page.module.css";

export default function AdminParticipantsPage() {
  const params = useParams<{ id: string }>();
  const terminId = params.id;
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: termine = [] } = useTermine();
  const { data: groups = [] } = useGroups();
  const { data: profiles = [] } = useProfiles();
  const { data: registrations = [] } = useRegistrationsForTermin(terminId);

  const termin = termine.find((t) => t.id === terminId);
  const participants = useMemo(() => registrations.filter((r) => r.status === "angemeldet"), [registrations]);
  const waitlist = useMemo(() => registrations.filter((r) => r.status === "warteliste"), [registrations]);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [addError, setAddError] = useState("");
  const [exporting, setExporting] = useState(false);
  const [copied, setCopied] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);

  const addableProfiles = useMemo(() => {
    const registeredIds = new Set(registrations.map((r) => r.user_id));
    const q = search.trim().toLowerCase();
    return profiles.filter(
      (p) => p.status === "approved" && !registeredIds.has(p.id) && (q === "" || p.name.toLowerCase().includes(q)),
    );
  }, [profiles, registrations, search]);

  async function removeParticipant(userId: string) {
    const supabase = createClient();
    await supabase.rpc("admin_remove_participant", { p_termin_id: terminId, p_user_id: userId });
    fetch("/api/notify/waitlist-promoted", { method: "POST" }).catch(() => {});
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.registrations(terminId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.termine }),
    ]);
  }

  async function addParticipant(userId: string) {
    setAddError("");
    const supabase = createClient();
    const { error } = await supabase.rpc("admin_add_participant", { p_termin_id: terminId, p_user_id: userId });
    if (error) {
      setAddError("Hinzufügen fehlgeschlagen.");
      return;
    }
    setPickerOpen(false);
    setSearch("");
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.registrations(terminId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.termine }),
    ]);
  }

  async function exportPng() {
    if (!termin || !exportRef.current) return;
    setExporting(true);
    try {
      const dataUrl = await toPng(exportRef.current, { pixelRatio: 2, cacheBust: true });
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      const file = new File([blob], `${termin.title}.png`, { type: "image/png" });

      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: termin.title });
      } else {
        const link = document.createElement("a");
        link.href = dataUrl;
        link.download = `${termin.title}.png`;
        link.click();
      }
    } catch {
      // best-effort — user can retry
    } finally {
      setExporting(false);
    }
  }

  async function copyText() {
    if (!termin) return;
    const text = buildTerminShareText({
      title: termin.title,
      shortCode: groupShortCode(termin.register_groups, groups),
      dateLabel: fullDateLabel(termin.date),
      timeLabel: `${hhmm(termin.start_time)}–${hhmm(termin.end_time)}`,
      location: termin.location,
      courts: termin.courts,
      trainer: termin.trainer,
      price: formatPrice(termin.price),
      maxTn: termin.max_tn,
      participants: participants.map((p) => p.name),
      waitlist: waitlist.map((p) => p.name),
    });
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (!termin) {
    return (
      <>
        <AppHeader title="Teilnehmer" />
        <PageBody>
          <div className={styles.empty}>Termin wird geladen…</div>
        </PageBody>
      </>
    );
  }

  const badge = badgeInfo(termin.type);
  const displayTitle = withShortCode(termin.title, groupShortCode(termin.register_groups, groups));

  return (
    <>
      <AppHeader title="Teilnehmer" />
      <PageBody>
        <div className={adminStyles.backRow}>
          <IconButton variant="soft" label="Zurück" size="sm" onClick={() => router.push("/admin/termine")}>
            <ArrowLeft size={16} strokeWidth={2.5} />
          </IconButton>
          <span className={adminStyles.backTitle}>{displayTitle}</span>
          <IconButton
            variant="soft"
            label="Termin bearbeiten"
            size="sm"
            style={{ marginLeft: "auto" }}
            onClick={() => router.push(`/admin/termine/${terminId}/bearbeiten`)}
          >
            <Pencil size={15} strokeWidth={2} />
          </IconButton>
        </div>

        <div className={styles.summaryCard}>
          <div className={styles.summaryTop}>
            <Badge tone={badge.tone}>{badge.label}</Badge>
            <span className={styles.summaryMeta}>
              {weekdayLabel(termin.date)}, {dateLabel(termin.date)}
              {new Date(`${termin.date}T00:00:00`).getFullYear()} · {hhmm(termin.start_time)}–{hhmm(termin.end_time)} Uhr
            </span>
          </div>
          <div className={styles.summaryDetails}>
            {termin.trainer} · {termin.location}
            {termin.courts ? `, ${termin.courts}` : ""}
          </div>
          {termin.reminder_enabled && <Badge tone="soft">Erinnerung 2 Std. vorher aktiv</Badge>}
        </div>

        <div className={styles.shareRow}>
          <Button variant="outline" size="sm" full onClick={exportPng} disabled={exporting}>
            <ImageDown size={15} strokeWidth={2.2} />
            {exporting ? "Erstelle Bild…" : "Als Bild"}
          </Button>
          <Button variant="outline" size="sm" full onClick={copyText}>
            <Copy size={15} strokeWidth={2.2} />
            {copied ? "Kopiert ✓" : "Text kopieren"}
          </Button>
        </div>

        <div className={styles.sectionHeadRow}>
          <div className={styles.sectionLabel}>
            Teilnehmer ({participants.length}/{termin.max_tn})
          </div>
          <IconButton
            variant="soft"
            size="sm"
            label={pickerOpen ? "Schließen" : "Teilnehmer hinzufügen"}
            onClick={() => {
              setPickerOpen((v) => !v);
              setAddError("");
              setSearch("");
            }}
          >
            <Plus size={15} strokeWidth={2.4} style={pickerOpen ? { transform: "rotate(45deg)" } : undefined} />
          </IconButton>
        </div>

        {pickerOpen && (
          <div className={styles.addPicker}>
            <Input placeholder="Name suchen…" value={search} onChange={(e) => setSearch(e.target.value)} autoFocus />
            {addError && <div className={styles.addError}>{addError}</div>}
            <div className={styles.addList}>
              {addableProfiles.map((p) => (
                <button key={p.id} type="button" className={styles.addRow} onClick={() => addParticipant(p.id)}>
                  <div className={styles.avatar}>{initials(p.name)}</div>
                  <div className={styles.rowMain}>
                    <div className={styles.rowName}>{p.name}</div>
                    <div className={styles.rowEmail}>{p.email}</div>
                  </div>
                </button>
              ))}
              {addableProfiles.length === 0 && <div className={styles.empty}>Keine passenden Spieler gefunden.</div>}
            </div>
          </div>
        )}

        <div className={styles.list}>
          {participants.map((p) => (
            <div key={p.id} className={styles.row}>
              <div className={styles.avatar}>{initials(p.name)}</div>
              <div className={styles.rowMain}>
                <div className={styles.rowName}>{p.name}</div>
                <div className={styles.rowEmail}>{p.email}</div>
              </div>
              <IconButton variant="ghost" size="sm" label="Entfernen" onClick={() => removeParticipant(p.user_id)}>
                <X size={15} strokeWidth={2.4} />
              </IconButton>
            </div>
          ))}
          {participants.length === 0 && <div className={styles.empty}>Noch keine Anmeldungen.</div>}
        </div>

        {waitlist.length > 0 && (
          <>
            <div className={styles.sectionLabelPink}>Warteliste ({waitlist.length})</div>
            <div className={styles.list}>
              {waitlist.map((p, i) => (
                <div key={p.id} className={styles.waitlistRow}>
                  <div className={styles.pos}>{i + 1}</div>
                  <div className={styles.rowMain}>
                    <div className={styles.rowName}>{p.name}</div>
                  </div>
                  <IconButton variant="ghost" size="sm" label="Entfernen" onClick={() => removeParticipant(p.user_id)}>
                    <X size={15} strokeWidth={2.4} />
                  </IconButton>
                </div>
              ))}
            </div>
          </>
        )}
      </PageBody>

      <div style={{ position: "fixed", top: 0, left: -9999, pointerEvents: "none" }}>
        <TerminExportCard
          ref={exportRef}
          termin={termin}
          shortCode={groupShortCode(termin.register_groups, groups)}
          priceLabel={formatPrice(termin.price)}
          participants={participants.map((p) => p.name)}
          waitlist={waitlist.map((p) => p.name)}
        />
      </div>
    </>
  );
}
