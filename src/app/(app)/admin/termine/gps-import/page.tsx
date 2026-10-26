"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "@/lib/useGuardedRouter";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, FileUp, Pencil, Plus, Trash2 } from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";
import { PageBody } from "@/components/layout/PageBody";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { Input, Select, Textarea } from "@/components/ui/Input";
import { useTermine } from "@/lib/queries/useTermine";
import { queryKeys } from "@/lib/queries/keys";
import { createClient } from "@/lib/supabase/client";
import { loadFlyer } from "@/lib/flyerImage";
import { decodeQr } from "@/lib/qrScan";
import { useUnsavedChanges } from "@/lib/useUnsavedChanges";
import { fullDateLabel, hhmm } from "@/lib/domain";
import {
  GPS_DEFAULT_DESCRIPTION,
  GPS_DEFAULT_DURATION_HOURS,
  GPS_DEFAULT_HINT,
  GPS_DEFAULT_LINK,
  GPS_DEFAULT_LOCATION,
  addHours,
  inferYear,
  isValidLink,
  isoDate,
  normalizeTime,
} from "@/lib/gps";
import adminStyles from "@/components/admin/AdminList.module.css";
import styles from "./page.module.css";

interface Row {
  id: string;
  include: boolean;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  title: string;
  duplicate: boolean;
  // The printed weekday does not fit the date — worth a look.
  check: boolean;
  // The start time could not be read; 10:00 is only a placeholder.
  timeMissing: boolean;
}

const DURATION_OPTIONS = [3, 4, 5, 6, 8];

let rowCounter = 0;
const nextId = () => `row-${++rowCounter}`;

export default function GpsImportPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: termine = [] } = useTermine();
  const fileInput = useRef<HTMLInputElement>(null);

  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [link, setLink] = useState("");
  const [linkFromQr, setLinkFromQr] = useState(false);
  const [hint, setHint] = useState(GPS_DEFAULT_HINT);
  const [description, setDescription] = useState(GPS_DEFAULT_DESCRIPTION);
  const [duration, setDuration] = useState(GPS_DEFAULT_DURATION_HOURS);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Termine already in the app (same day, start and title) are recognised so a
  // second upload of the same flyer does not create everything twice.
  const existing = useMemo(
    () => new Set(termine.filter((t) => t.type === "turnier").map((t) => `${t.date}|${hhmm(t.start_time)}|${t.title.trim().toLowerCase()}`)),
    [termine],
  );
  const isDuplicate = (r: Pick<Row, "date" | "time" | "title">) => existing.has(`${r.date}|${r.time}|${r.title.trim().toLowerCase()}`);

  useUnsavedChanges(rows !== null && rows.some((r) => r.include) && !saving);

  async function handleFile(file: File) {
    setError("");
    setRows(null);
    try {
      setBusy("Datei wird geöffnet …");
      const flyer = await loadFlyer(file);

      setBusy("QR-Code wird gesucht …");
      const qr = await decodeQr(flyer.imageData);
      const code = qr && isValidLink(qr) ? qr : "";
      // No (readable) QR code: fall back to the club's standard link.
      setLink(code || GPS_DEFAULT_LINK);
      setLinkFromQr(!!code);

      const entries = flyer.entries;
      if (!entries) {
        setError("Dieser Plan konnte nicht gelesen werden. Es wird das PDF des Monatsplans erwartet. Du kannst die Termine unten von Hand anlegen (Plus).");
        setRows([]);
        return;
      }
      const built = entries.map((e): Row => {
        const { year, matched } = inferYear(e);
        const time = normalizeTime(e.time);
        const base = { date: isoDate(year, e.month, e.day), time: time ?? "10:00", title: e.title.trim() };
        const duplicate = isDuplicate(base);
        return { id: nextId(), include: !duplicate, ...base, duplicate, check: !matched, timeMissing: time === null };
      });
      setRows(built);
      if (built.length === 0) setError("Auf dem Bild wurden keine Termine erkannt.");
    } catch {
      setError("Die Datei konnte nicht geöffnet werden. Bitte wähle das PDF des Monatsplans.");
    } finally {
      setBusy("");
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  function patch(id: string, change: Partial<Row>) {
    setRows((list) =>
      (list ?? []).map((r) => {
        if (r.id !== id) return r;
        const next = { ...r, ...change };
        return { ...next, duplicate: isDuplicate(next), check: change.date ? false : r.check, timeMissing: change.time ? false : r.timeMissing };
      }),
    );
  }

  function addRow() {
    const id = nextId();
    setRows((list) => [...(list ?? []), { id, include: true, date: "", time: "10:00", title: "GPS ", duplicate: false, check: false, timeMissing: false }]);
    setEditingId(id);
  }

  const chosen = (rows ?? []).filter((r) => r.include);
  const incomplete = chosen.some((r) => !r.date || !r.title.trim() || !normalizeTime(r.time));
  const canCreate = chosen.length > 0 && !incomplete && isValidLink(link) && !saving;

  async function create() {
    if (!isValidLink(link)) {
      setError("Bitte gib einen gültigen Anmelde-Link an (beginnt mit https://).");
      return;
    }
    setSaving(true);
    setError("");
    const supabase = createClient();
    const { error: insertError } = await supabase.from("termine").insert(
      chosen.map((r) => ({
        type: "turnier" as const,
        title: r.title.trim(),
        trainer: "—",
        trainer_id: null,
        location: GPS_DEFAULT_LOCATION,
        courts: "",
        date: r.date,
        start_time: r.time,
        end_time: addHours(r.time, duration),
        description: description.trim(),
        max_tn: 1,
        price: null,
        visible_groups: ["all"],
        register_groups: ["all"],
        notify_create: false,
        reminder_enabled: false,
        registration_opens_date: null,
        registration_opens_time: null,
        registration_opens_hidden: false,
        registration_closes_date: null,
        registration_closes_time: null,
        external_url: link.trim(),
        external_hint: hint.trim() || null,
      })),
    );
    if (insertError) {
      setSaving(false);
      setError("Die Termine konnten nicht angelegt werden. Bitte versuche es erneut.");
      return;
    }
    await queryClient.invalidateQueries({ queryKey: queryKeys.termine });
    router.push(`/admin/termine?created=${encodeURIComponent(`${chosen.length} GPS-Turniere`)}&notified=0`);
  }

  return (
    <>
      <AppHeader title="GPS importieren" />
      <PageBody>
        <div className={adminStyles.backRow}>
          <IconButton variant="soft" label="Zurück" size="sm" onClick={() => router.push("/admin/termine")}>
            <ArrowLeft size={16} strokeWidth={2.5} />
          </IconButton>
          <span className={adminStyles.backTitle}>GPS-Turniere importieren</span>
        </div>

        <div className={styles.intro}>
          Lade das PDF des Monatsplans hoch. Alle Turniere werden erkannt, der Anmelde-Link kommt aus dem QR-Code.
          Du siehst vorher eine Vorschau.
        </div>

        <input
          ref={fileInput}
          type="file"
          accept="application/pdf"
          className={styles.hiddenInput}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFile(file);
          }}
        />
        <Button variant={rows ? "outline" : "accent"} size="lg" full disabled={!!busy || saving} onClick={() => fileInput.current?.click()}>
          <FileUp size={18} strokeWidth={2.2} style={{ marginRight: 8 }} />
          {rows ? "Andere Datei wählen" : "PDF auswählen"}
        </Button>

        {busy && <div className={styles.busy}>{busy}</div>}
        {error && <div className={styles.error}>{error}</div>}

        {rows && (
          <>
            <div className={styles.section}>
              <div className={styles.sectionLabel}>Anmelde-Link</div>
              <Input
                type="url"
                inputMode="url"
                autoCapitalize="none"
                autoCorrect="off"
                placeholder="https://…"
                value={link}
                onChange={(e) => {
                  setLink(e.target.value);
                  setLinkFromQr(false);
                }}
              />
              <div className={isValidLink(link) ? styles.okNote : styles.warnNote}>
                {linkFromQr
                  ? "Aus dem QR-Code gelesen ✓"
                  : isValidLink(link)
                    ? link === GPS_DEFAULT_LINK
                      ? "Standard-Link (im PDF wurde kein QR-Code gefunden)."
                      : "Von dir eingetragen."
                    : "Bitte einen gültigen Link eintragen."}
              </div>
            </div>

            <div className={styles.section}>
              <div className={styles.sectionHead}>
                <div className={styles.sectionLabel}>
                  Termine · {chosen.length} von {rows.length} ausgewählt
                </div>
                <IconButton variant="soft" size="sm" label="Termin hinzufügen" onClick={addRow}>
                  <Plus size={15} strokeWidth={2.4} />
                </IconButton>
              </div>

              {rows.map((r) => (
                <div key={r.id} className={`${styles.row} ${r.include ? "" : styles.rowOff}`}>
                  <div className={styles.rowMain}>
                    <input
                      type="checkbox"
                      className={styles.check}
                      checked={r.include}
                      aria-label="Termin anlegen"
                      onChange={(e) => patch(r.id, { include: e.target.checked })}
                    />
                    <div className={styles.rowText}>
                      <div className={styles.rowTitle}>{r.title || "—"}</div>
                      <div className={styles.rowMeta}>
                        {r.date ? fullDateLabel(r.date) : "Datum fehlt"} · {r.time} Uhr
                      </div>
                      {r.duplicate && <div className={styles.warnNote}>Gibt es schon in der App</div>}
                      {r.check && !r.duplicate && <div className={styles.warnNote}>Bitte prüfen: Wochentag passt nicht zum Datum</div>}
                      {r.timeMissing && <div className={styles.warnNote}>Bitte prüfen: Uhrzeit wurde nicht erkannt</div>}
                    </div>
                    <IconButton
                      variant="ghost"
                      size="sm"
                      label={editingId === r.id ? "Fertig" : "Bearbeiten"}
                      onClick={() => setEditingId(editingId === r.id ? null : r.id)}
                    >
                      {editingId === r.id ? <Check size={15} strokeWidth={2.6} /> : <Pencil size={14} strokeWidth={2} />}
                    </IconButton>
                  </div>
                  {editingId === r.id && (
                    <div className={styles.editBox}>
                      <Input label="Titel" value={r.title} onChange={(e) => patch(r.id, { title: e.target.value })} maxLength={80} />
                      <div className={adminStyles.timeRow}>
                        <Input label="Datum" type="date" value={r.date} onChange={(e) => patch(r.id, { date: e.target.value })} />
                        <Input label="Start" type="time" value={r.time} onChange={(e) => patch(r.id, { time: e.target.value })} />
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => setRows((list) => (list ?? []).filter((x) => x.id !== r.id))}>
                        <Trash2 size={14} strokeWidth={2.2} style={{ marginRight: 4 }} />
                        Zeile entfernen
                      </Button>
                    </div>
                  )}
                </div>
              ))}
              {rows.length === 0 && <div className={styles.rowMeta}>Noch keine Termine. Über das Plus kannst du Termine von Hand hinzufügen.</div>}
            </div>

            <div className={styles.section}>
              <div className={styles.sectionLabel}>Texte für alle Termine</div>
              <Textarea label="Hinweis zur Anmeldung" value={hint} onChange={(e) => setHint(e.target.value)} />
              <Textarea label="Beschreibung" value={description} onChange={(e) => setDescription(e.target.value)} />
              <Select label="Dauer (die Pläne nennen nur den Start)" value={String(duration)} onChange={(e) => setDuration(Number(e.target.value))}>
                {DURATION_OPTIONS.map((h) => (
                  <option key={h} value={h}>
                    {h} Stunden
                  </option>
                ))}
              </Select>
            </div>

            <Button variant="accent" size="lg" full onClick={create} disabled={!canCreate}>
              {saving ? "Wird angelegt …" : `${chosen.length} GPS-Turnier${chosen.length === 1 ? "" : "e"} anlegen`}
            </Button>
            {incomplete && <div className={styles.warnNote}>Bei einem ausgewählten Termin fehlen Datum, Titel oder Uhrzeit.</div>}
          </>
        )}
      </PageBody>
    </>
  );
}
