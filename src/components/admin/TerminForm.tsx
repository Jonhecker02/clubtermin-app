"use client";

import { useState } from "react";
import { Input, Select, Textarea } from "@/components/ui/Input";
import { Tabs } from "@/components/ui/Tabs";
import { FormSection } from "./FormSection";
import { useUnsavedChanges } from "@/lib/useUnsavedChanges";
import { Button } from "@/components/ui/Button";
import { useGroups } from "@/lib/queries/useGroups";
import { useProfiles } from "@/lib/queries/useProfiles";
import { dateLabel, formatCourts, groupLabel, hhmm, parseCourts, sessionFormatOf, suggestedRegistrationCloses } from "@/lib/domain";
import { CourtPicker } from "./CourtPicker";
import { GPS_DEFAULT_DESCRIPTION, GPS_DEFAULT_HINT, GPS_LABEL } from "@/lib/gps";
import type { SessionFormat, Termin, TerminType } from "@/types/database";
import styles from "./AdminList.module.css";

const TYPE_ITEMS = [
  { id: "training", label: "Training" },
  { id: "event", label: "Event" },
  { id: "spieltag", label: "Spieltag" },
  { id: "turnier", label: GPS_LABEL },
];

const SESSION_FORMAT_OPTIONS: { id: SessionFormat; label: string; hint: string }[] = [
  { id: "training_spiel", label: "Training & Spiel", hint: "Erst Training, dann Spiel (oder andersherum) — mit Wechsel" },
  { id: "nur_spiel", label: "Nur Spiel", hint: "Alle spielen die ganze Zeit — kein Trainer, kein Wechsel" },
  { id: "nur_training", label: "Nur Training", hint: "Alle trainieren die ganze Zeit — kein Wechsel" },
];

const GROUP_MODE_ITEMS = [
  { id: "alle", label: "Alle Gruppen" },
  { id: "ausgewaehlt", label: "Bestimmte Gruppen" },
];

const REG_OPEN_ITEMS = [
  { id: "sofort", label: "Sofort" },
  { id: "geplant", label: "Geplant" },
];

export interface TerminFormValues {
  type: TerminType;
  title: string;
  trainer: string;
  trainer_id: string | null;
  location: string;
  courts: string;
  session_format: SessionFormat;
  date: string;
  start_time: string;
  end_time: string;
  description: string;
  max_tn: number;
  price: number | null;
  visible_groups: string[];
  register_groups: string[];
  notify_create: boolean;
  reminder_enabled: boolean;
  registration_opens_date: string | null;
  registration_opens_time: string | null;
  registration_opens_hidden: boolean;
  registration_closes_date: string | null;
  registration_closes_time: string | null;
  external_url: string | null;
  external_hint: string | null;
}

interface TerminFormProps {
  initial?: Termin;
  submitLabel: string;
  onSubmit: (values: TerminFormValues) => Promise<string | void>;
}

export function TerminForm({ initial, submitLabel, onSubmit }: TerminFormProps) {
  const { data: groups = [] } = useGroups();
  const { data: profiles = [] } = useProfiles();
  const trainerOptions = profiles
    .filter((p) => (p.role === "owner" || p.role === "trainer") && p.status === "approved")
    .sort((a, b) => a.name.localeCompare(b.name));

  const [type, setType] = useState<TerminType>(initial?.type ?? "training");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [trainerId, setTrainerId] = useState(initial?.trainer_id ?? "");
  const [date, setDate] = useState(initial?.date ?? "");
  const [startTime, setStartTime] = useState(initial ? hhmm(initial.start_time) : "");
  const [endTime, setEndTime] = useState(initial ? hhmm(initial.end_time) : "");
  const [location, setLocation] = useState(initial?.location ?? "The Padellers Essen");
  const [description, setDescription] = useState(initial?.description ?? "");
  // Turniere: registration happens outside the app — a link plus a hint on how to sign up.
  const [externalUrl, setExternalUrl] = useState(initial?.external_url ?? "");
  const [externalHint, setExternalHint] = useState(initial?.external_hint ?? "");
  // Picked as tiles for the club's seven courts; stored as text like
  // "Court 1–3" (every display site just prints termin.courts).
  const [courts, setCourts] = useState<number[]>(() => parseCourts(initial?.courts));
  const [sessionFormat, setSessionFormat] = useState<SessionFormat>(sessionFormatOf(initial ?? {}));
  const [anmeldungOpen, setAnmeldungOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  // Until the admin types a number, max. participants follow the courts: a
  // court seats 4 (1 court = 4, 2 = 8, ...). Typing a number overrides that.
  const [maxTnTouched, setMaxTnTouched] = useState(!!initial);
  const [maxTnManual, setMaxTnManual] = useState(initial ? String(initial.max_tn) : "8");
  const [price, setPrice] = useState(initial?.price != null ? String(initial.price) : "");
  const [visMode, setVisMode] = useState<"alle" | "ausgewaehlt">(
    !initial || initial.visible_groups.includes("all") ? "alle" : "ausgewaehlt",
  );
  const [visGroups, setVisGroups] = useState<string[]>(
    initial && !initial.visible_groups.includes("all") ? initial.visible_groups : [],
  );
  const [regMode, setRegMode] = useState<"alle" | "ausgewaehlt">(
    !initial || initial.register_groups.includes("all") ? "alle" : "ausgewaehlt",
  );
  const [regGroups, setRegGroups] = useState<string[]>(
    initial && !initial.register_groups.includes("all") ? initial.register_groups : [],
  );
  const [notifyCreate, setNotifyCreate] = useState(initial?.notify_create ?? false);
  const [reminderEnabled, setReminderEnabled] = useState(initial?.reminder_enabled ?? true);
  const [regOpenMode, setRegOpenMode] = useState<"sofort" | "geplant">(
    initial?.registration_opens_date ? "geplant" : "sofort",
  );
  const [regOpensAt, setRegOpensAt] = useState(
    initial?.registration_opens_date ? `${initial.registration_opens_date}T${hhmm(initial.registration_opens_time ?? "00:00")}` : "",
  );
  const [regOpensHidden, setRegOpensHidden] = useState(initial?.registration_opens_hidden ?? false);
  // Until the admin edits it, the deadline simply follows the date (Saturday
  // before, 22:00) — also when they change the date afterwards.
  const [regClosesTouched, setRegClosesTouched] = useState(!!initial?.registration_closes_date);
  const [regClosesManual, setRegClosesAt] = useState(
    initial?.registration_closes_date
      ? `${initial.registration_closes_date}T${hhmm(initial.registration_closes_time ?? "00:00")}`
      : "",
  );
  const regClosesAt = regClosesTouched ? regClosesManual : date ? suggestedRegistrationCloses(date) : "";
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const courtSeats = courts.length * 4;
  const maxTn = maxTnTouched ? maxTnManual : courts.length > 0 ? String(courtSeats) : maxTnManual;

  // Warn before leaving with edits that were never saved. The first render's
  // values are the baseline, so an untouched form never nags.
  const snapshot = JSON.stringify([
    type, title, trainerId, date, startTime, endTime, location, description, courts, sessionFormat, maxTn, price,
    visMode, visGroups, regMode, regGroups, notifyCreate, reminderEnabled, regOpenMode, regOpensAt, regOpensHidden, regClosesAt,
    externalUrl, externalHint,
  ]);
  const [baseline] = useState(snapshot);
  useUnsavedChanges(snapshot !== baseline && !saving);

  // Trainings always happen on booked courts (required); events may use some
  // (optional); Spieltage (often away matches) have none to name.
  const needsCourts = type === "training";
  const isTurnier = type === "turnier";
  const showCourts = type !== "spieltag" && !isTurnier;

  // Fair rotation only ever applies to a TRAINING tied to exactly one
  // specific team — with "alle Gruppen" or several groups selected there's
  // no single team history to rank by, and Events/Spieltage are decided by
  // registration time or by hand, never by rotation.
  const rotationGroup =
    type === "training" && regMode === "ausgewaehlt" && regGroups.length === 1
      ? groups.find((g) => g.id === regGroups[0])
      : undefined;
  const rotationActive = rotationGroup?.fair_rotation_enabled ?? false;

  function toggle(list: string[], id: string, set: (v: string[]) => void) {
    set(list.includes(id) ? list.filter((g) => g !== id) : [...list, id]);
  }

  // "Anmeldung offen für" defaults to following "Sichtbar für" — admins can
  // still override it manually afterward; it just re-syncs the next time
  // "Sichtbar für" itself changes.
  function handleVisModeChange(mode: "alle" | "ausgewaehlt") {
    setVisMode(mode);
    setRegMode(mode);
  }

  function toggleVisGroup(id: string) {
    const next = visGroups.includes(id) ? visGroups.filter((g) => g !== id) : [...visGroups, id];
    setVisGroups(next);
    setRegGroups(next);
  }

  // Choosing GPS on a new termin fills in the standard texts (still editable).
  function handleTypeChange(next: TerminType) {
    setType(next);
    if (next === "turnier" && !initial) {
      if (!externalHint.trim()) setExternalHint(GPS_DEFAULT_HINT);
      if (!description.trim()) setDescription(GPS_DEFAULT_DESCRIPTION);
    }
  }

  async function submit() {
    if (!title.trim() || !date || !startTime || !endTime || (!isTurnier && !maxTn) || (needsCourts && courts.length === 0)) {
      setError("Bitte fülle alle Pflichtfelder aus.");
      return;
    }
    if (isTurnier) {
      const link = externalUrl.trim();
      if (!/^https?:\/\/\S+\.\S+$/i.test(link)) {
        setError("Bitte gib einen gültigen Anmelde-Link an (beginnt mit https://).");
        return;
      }
    }
    if (visMode === "ausgewaehlt" && visGroups.length === 0) {
      setAnmeldungOpen(true);
      setError("Bitte wähle mindestens eine Gruppe für die Sichtbarkeit.");
      return;
    }
    if (!isTurnier && regMode === "ausgewaehlt" && regGroups.length === 0) {
      setAnmeldungOpen(true);
      setError("Bitte wähle mindestens eine Gruppe für die Anmeldung.");
      return;
    }
    if (!isTurnier && regOpenMode === "geplant" && !regOpensAt) {
      setAnmeldungOpen(true);
      setError("Bitte wähle Datum und Uhrzeit für die Anmeldeöffnung.");
      return;
    }
    if (!isTurnier && rotationActive && !regClosesAt) {
      setAnmeldungOpen(true);
      setError("Bitte wähle einen Anmeldeschluss für die faire Rotation.");
      return;
    }

    const [regOpensDate, regOpensTime] = !isTurnier && regOpenMode === "geplant" ? regOpensAt.split("T") : [null, null];
    const [regClosesDate, regClosesTime] = !isTurnier && rotationActive && regClosesAt ? regClosesAt.split("T") : [null, null];

    const selectedTrainer = trainerOptions.find((p) => p.id === trainerId);

    setSaving(true);
    setError("");
    const result = await onSubmit({
      type,
      title: title.trim(),
      // Falls back to the termin's existing free-text trainer (set before
      // this dropdown existed) rather than blanking it out just because the
      // admin edited something else without re-picking a trainer.
      trainer: selectedTrainer?.name ?? initial?.trainer ?? "—",
      trainer_id: trainerId || null,
      location: location.trim() || "The Padellers Essen",
      courts: showCourts ? formatCourts(courts) : "",
      session_format: type === "training" ? sessionFormat : "training_spiel",
      date,
      start_time: startTime,
      end_time: endTime,
      description: description.trim(),
      max_tn: isTurnier ? 1 : parseInt(maxTn, 10) || 1,
      price: price.trim() ? Number(price) : null,
      visible_groups: visMode === "alle" ? ["all"] : visGroups,
      register_groups: isTurnier ? (visMode === "alle" ? ["all"] : visGroups) : regMode === "alle" ? ["all"] : regGroups,
      notify_create: notifyCreate,
      reminder_enabled: isTurnier ? false : reminderEnabled,
      registration_opens_date: regOpensDate,
      registration_opens_time: regOpensTime,
      registration_opens_hidden: !isTurnier && regOpenMode === "geplant" ? regOpensHidden : false,
      registration_closes_date: regClosesDate,
      registration_closes_time: regClosesTime,
      external_url: isTurnier ? externalUrl.trim() : null,
      external_hint: isTurnier ? externalHint.trim() || null : null,
    });
    setSaving(false);
    if (result) setError(result);
  }

  const groupNames = (ids: string[]) =>
    ids
      .map((id) => groups.find((g) => g.id === id))
      .filter((g): g is NonNullable<typeof g> => !!g)
      .map((g) => g.short_code || g.name)
      .join(", ");

  // One line for the collapsed "Anmeldung" card.
  const anmeldungSummary = isTurnier
    ? visMode === "alle"
      ? "Sichtbar für alle Gruppen"
      : `Sichtbar für ${groupNames(visGroups) || "…"}`
    : [
    regMode === "alle" ? "Für alle Gruppen" : groupNames(regGroups) || "Gruppen wählen",
    regOpenMode === "sofort" ? "sofort offen" : regOpensAt ? `offen ab ${dateLabel(regOpensAt.split("T")[0])} ${regOpensAt.split("T")[1]}` : "geplant",
    rotationActive && regClosesAt ? `Schluss ${dateLabel(regClosesAt.split("T")[0])} ${regClosesAt.split("T")[1]}` : null,
  ]
        .filter(Boolean)
        .join(" · ");

  const moreSummary = [
    location.trim() || null,
    price.trim() ? `${price.trim()} €` : null,
    description.trim() ? "Beschreibung" : null,
    notifyCreate ? "Push beim Erstellen" : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className={styles.form}>
      <Tabs items={TYPE_ITEMS} value={type} onChange={(id) => handleTypeChange(id as TerminType)} />

      <FormSection title="Grunddaten">
        <Input label="Titel" placeholder="z. B. Trainingsgruppe A" value={title} onChange={(e) => setTitle(e.target.value)} />
        <Input label="Datum" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <div className={styles.timeRow}>
          <Input label="Startzeit" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          <Input label="Endzeit" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
        </div>
      </FormSection>

      {isTurnier && (
        <FormSection title="Anmeldung über Link">
          <Input
            label="Anmelde-Link"
            type="url"
            inputMode="url"
            autoCapitalize="none"
            autoCorrect="off"
            placeholder="https://…"
            value={externalUrl}
            onChange={(e) => setExternalUrl(e.target.value)}
            helper="Hier melden sich die Spieler an — die Anmeldung läuft nicht über die App."
          />
          <Textarea
            label="Hinweis zur Anmeldung"
            placeholder="z. B. Anmeldung bis 1. Dezember über den Link, Startgeld vor Ort. Bitte Partner angeben."
            value={externalHint}
            onChange={(e) => setExternalHint(e.target.value)}
          />
        </FormSection>
      )}

      {!isTurnier && (
        <FormSection title="Ablauf & Plätze">
          {type === "training" && (
            <div className={styles.fieldGroup}>
              <span className={styles.fieldGroupLabel}>Ablauf</span>
              <div className={styles.choiceList} role="radiogroup" aria-label="Ablauf">
                {SESSION_FORMAT_OPTIONS.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    role="radio"
                    aria-checked={sessionFormat === o.id}
                    className={`${styles.choice} ${sessionFormat === o.id ? styles.choiceOn : ""}`}
                    onClick={() => setSessionFormat(o.id)}
                  >
                    <span className={styles.choiceDot} aria-hidden="true" />
                    <span className={styles.choiceText}>
                      <span className={styles.choiceLabel}>{o.label}</span>
                      <span className={styles.choiceHint}>{o.hint}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
          <Select label="Trainer / Verantwortlicher" value={trainerId} onChange={(e) => setTrainerId(e.target.value)}>
            <option value="">— kein Trainer ausgewählt —</option>
            {trainerOptions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
          {showCourts && <CourtPicker value={courts} onChange={setCourts} optional={!needsCourts} />}
          <div className={styles.fieldGroup}>
            <Input
              label="Max. TN"
              type="number"
              value={maxTn}
              onChange={(e) => {
                setMaxTnTouched(true);
                setMaxTnManual(e.target.value);
              }}
              helper={showCourts && courts.length > 0 ? `Standard: 4 pro Court — ${courts.length} ${courts.length === 1 ? "Court" : "Courts"} = ${courtSeats}. Frei änderbar.` : undefined}
            />
            {showCourts && courts.length > 0 && maxTn !== String(courtSeats) && (
              <button
                type="button"
                className={styles.suggestion}
                onClick={() => {
                  setMaxTnTouched(false);
                }}
              >
                Zurück auf {courtSeats} (4 pro Court)
              </button>
            )}
          </div>
        </FormSection>
      )}

      <FormSection
        title={isTurnier ? "Sichtbarkeit" : "Anmeldung"}
        collapsible
        open={anmeldungOpen}
        onToggle={setAnmeldungOpen}
        summary={anmeldungSummary}
      >
        <div className={styles.fieldGroup}>
          <span className={styles.fieldGroupLabel}>Sichtbar für</span>
          <Tabs items={GROUP_MODE_ITEMS} value={visMode} onChange={(id) => handleVisModeChange(id as typeof visMode)} size="sm" />
          {visMode === "ausgewaehlt" && (
            <div className={styles.checkboxList}>
              {groups.map((g) => (
                <label key={g.id} className={styles.checkboxLabel}>
                  <input type="checkbox" checked={visGroups.includes(g.id)} onChange={() => toggleVisGroup(g.id)} />
                  {groupLabel(g)}
                </label>
              ))}
            </div>
          )}
        </div>

        {!isTurnier && (
          <>
          <div className={styles.fieldGroup}>
            <span className={styles.fieldGroupLabel}>Anmeldung offen für</span>
            <Tabs items={GROUP_MODE_ITEMS} value={regMode} onChange={(id) => setRegMode(id as typeof regMode)} size="sm" />
            {regMode === "ausgewaehlt" && (
              <div className={styles.checkboxList}>
                {groups.map((g) => (
                  <label key={g.id} className={styles.checkboxLabel}>
                    <input type="checkbox" checked={regGroups.includes(g.id)} onChange={() => toggle(regGroups, g.id, setRegGroups)} />
                    {groupLabel(g)}
                  </label>
                ))}
              </div>
            )}
          </div>

          {rotationActive && (
            <div className={styles.fieldGroup}>
              <span className={styles.fieldGroupLabel}>Anmeldeschluss (faire Rotation)</span>
              <Input
                label="Anmeldeschluss"
                type="datetime-local"
                value={regClosesAt}
                onChange={(e) => {
                  setRegClosesTouched(true);
                  setRegClosesAt(e.target.value);
                }}
                helper={`Standard: Samstag vor dem Training, 22:00 Uhr — bei Bedarf änderbar. ${groupLabel(rotationGroup!)} hat faire Rotation: bis dahin sind Anmeldungen ausstehend, danach werden die Plätze fair verteilt.`}
              />
              {date && regClosesAt !== suggestedRegistrationCloses(date) && (
                <button
                  type="button"
                  className={styles.suggestion}
                  onClick={() => {
                    setRegClosesTouched(false);
                    setRegClosesAt("");
                  }}
                >
                  Zurück auf Standard: Samstag davor, 22:00 Uhr
                </button>
              )}
            </div>
          )}

          <div className={styles.fieldGroup}>
            <span className={styles.fieldGroupLabel}>Anmeldung öffnet</span>
            <Tabs items={REG_OPEN_ITEMS} value={regOpenMode} onChange={(id) => setRegOpenMode(id as typeof regOpenMode)} size="sm" />
            {regOpenMode === "geplant" && (
              <>
                <Input
                  label="Anmeldung ab"
                  type="datetime-local"
                  value={regOpensAt}
                  onChange={(e) => setRegOpensAt(e.target.value)}
                  helper="Mitglieder können sich erst ab diesem Zeitpunkt anmelden und werden benachrichtigt, sobald es soweit ist."
                />
                <label className={styles.checkboxLabel}>
                  <input type="checkbox" checked={regOpensHidden} onChange={(e) => setRegOpensHidden(e.target.checked)} />
                  Öffnungszeitpunkt vor Mitgliedern verbergen
                </label>
              </>
            )}
          </div>
          </>
        )}
      </FormSection>

      <FormSection title="Weitere Angaben" collapsible open={moreOpen} onToggle={setMoreOpen} summary={moreSummary}>
        <Input
          label="Location"
          placeholder="z. B. The Padellers Essen"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
        />
        <Input
          label="Preis (€, optional)"
          type="number"
          placeholder="z. B. 5"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
        />
        <Textarea
          label="Beschreibung"
          placeholder="z. B. Eine Stunde Training, danach eine Stunde freies Spiel"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <div className={styles.notifyBox}>
          <label className={styles.checkboxLabel}>
            <input type="checkbox" checked={notifyCreate} onChange={(e) => setNotifyCreate(e.target.checked)} />
            Push-Benachrichtigung beim Erstellen an Teilnehmer senden
          </label>
          {!isTurnier && (
            <label className={styles.checkboxLabel}>
              <input type="checkbox" checked={reminderEnabled} onChange={(e) => setReminderEnabled(e.target.checked)} />
              Erinnerung 2 Std. vorher per Push senden
            </label>
          )}
        </div>
      </FormSection>

      {error && <div className={styles.error}>{error}</div>}
      <Button variant="accent" size="lg" full onClick={submit} disabled={saving}>
        {submitLabel}
      </Button>
    </div>
  );
}
