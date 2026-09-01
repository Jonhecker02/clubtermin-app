"use client";

import { useState } from "react";
import { Input, Textarea } from "@/components/ui/Input";
import { Tabs } from "@/components/ui/Tabs";
import { Button } from "@/components/ui/Button";
import { useGroups } from "@/lib/queries/useGroups";
import { groupLabel, hhmm } from "@/lib/domain";
import type { Termin, TerminType } from "@/types/database";
import styles from "./AdminList.module.css";

const TYPE_ITEMS = [
  { id: "training", label: "Training" },
  { id: "event", label: "Event" },
  { id: "spieltag", label: "Spieltag" },
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
  location: string;
  courts: string;
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
}

interface TerminFormProps {
  initial?: Termin;
  submitLabel: string;
  onSubmit: (values: TerminFormValues) => Promise<string | void>;
}

export function TerminForm({ initial, submitLabel, onSubmit }: TerminFormProps) {
  const { data: groups = [] } = useGroups();

  const [type, setType] = useState<TerminType>(initial?.type ?? "training");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [trainer, setTrainer] = useState(initial?.trainer ?? "");
  const [date, setDate] = useState(initial?.date ?? "");
  const [startTime, setStartTime] = useState(initial ? hhmm(initial.start_time) : "");
  const [endTime, setEndTime] = useState(initial ? hhmm(initial.end_time) : "");
  const [location, setLocation] = useState(initial?.location ?? "The Padellers Essen");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [courts, setCourts] = useState(initial?.courts ?? "");
  const [maxTn, setMaxTn] = useState(initial ? String(initial.max_tn) : "8");
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
  const [notifyCreate, setNotifyCreate] = useState(initial?.notify_create ?? true);
  const [reminderEnabled, setReminderEnabled] = useState(initial?.reminder_enabled ?? true);
  const [regOpenMode, setRegOpenMode] = useState<"sofort" | "geplant">(
    initial?.registration_opens_date ? "geplant" : "sofort",
  );
  const [regOpensAt, setRegOpensAt] = useState(
    initial?.registration_opens_date ? `${initial.registration_opens_date}T${hhmm(initial.registration_opens_time ?? "00:00")}` : "",
  );
  const [regOpensHidden, setRegOpensHidden] = useState(initial?.registration_opens_hidden ?? false);
  const [regClosesAt, setRegClosesAt] = useState(
    initial?.registration_closes_date
      ? `${initial.registration_closes_date}T${hhmm(initial.registration_closes_time ?? "00:00")}`
      : "",
  );
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  // Fair rotation only ever applies to a termin tied to exactly one specific
  // team — with "alle Gruppen" or several groups selected there's no single
  // team history to rank by, so the deadline field simply doesn't apply.
  const rotationGroup =
    regMode === "ausgewaehlt" && regGroups.length === 1 ? groups.find((g) => g.id === regGroups[0]) : undefined;
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

  async function submit() {
    if (!title.trim() || !date || !startTime || !endTime || !courts.trim() || !maxTn) {
      setError("Bitte fülle alle Pflichtfelder aus.");
      return;
    }
    if (visMode === "ausgewaehlt" && visGroups.length === 0) {
      setError("Bitte wähle mindestens eine Gruppe für die Sichtbarkeit.");
      return;
    }
    if (regMode === "ausgewaehlt" && regGroups.length === 0) {
      setError("Bitte wähle mindestens eine Gruppe für die Anmeldung.");
      return;
    }
    if (regOpenMode === "geplant" && !regOpensAt) {
      setError("Bitte wähle Datum und Uhrzeit für die Anmeldeöffnung.");
      return;
    }
    if (rotationActive && !regClosesAt) {
      setError("Bitte wähle einen Anmeldeschluss für die faire Rotation.");
      return;
    }

    const [regOpensDate, regOpensTime] = regOpenMode === "geplant" ? regOpensAt.split("T") : [null, null];
    const [regClosesDate, regClosesTime] = rotationActive && regClosesAt ? regClosesAt.split("T") : [null, null];

    setSaving(true);
    setError("");
    const result = await onSubmit({
      type,
      title: title.trim(),
      trainer: trainer.trim() || "—",
      location: location.trim() || "The Padellers Essen",
      courts: courts.trim(),
      date,
      start_time: startTime,
      end_time: endTime,
      description: description.trim(),
      max_tn: parseInt(maxTn, 10) || 1,
      price: price.trim() ? Number(price) : null,
      visible_groups: visMode === "alle" ? ["all"] : visGroups,
      register_groups: regMode === "alle" ? ["all"] : regGroups,
      notify_create: notifyCreate,
      reminder_enabled: reminderEnabled,
      registration_opens_date: regOpensDate,
      registration_opens_time: regOpensTime,
      registration_opens_hidden: regOpenMode === "geplant" ? regOpensHidden : false,
      registration_closes_date: regClosesDate,
      registration_closes_time: regClosesTime,
    });
    setSaving(false);
    if (result) setError(result);
  }

  return (
    <div className={styles.form}>
      <Tabs items={TYPE_ITEMS} value={type} onChange={(id) => setType(id as TerminType)} />
      <Input label="Titel" placeholder="z. B. Trainingsgruppe A" value={title} onChange={(e) => setTitle(e.target.value)} />
      <Input
        label="Trainer / Verantwortlicher"
        placeholder="z. B. Coach Mia"
        value={trainer}
        onChange={(e) => setTrainer(e.target.value)}
      />
      <Input label="Datum" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      <div className={styles.fieldRow}>
        <Input label="Startzeit" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
        <Input label="Endzeit" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
      </div>
      <Input
        label="Location"
        placeholder="z. B. The Padellers Essen"
        value={location}
        onChange={(e) => setLocation(e.target.value)}
      />
      <Textarea
        label="Beschreibung"
        placeholder="z. B. Eine Stunde Training, danach eine Stunde freies Spiel"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />
      <div className={styles.fieldRow}>
        <Input label="Courts" placeholder="z. B. Court 1–3" value={courts} onChange={(e) => setCourts(e.target.value)} />
        <Input label="Max. TN" type="number" value={maxTn} onChange={(e) => setMaxTn(e.target.value)} />
      </div>
      <Input
        label="Preis (€, optional)"
        type="number"
        placeholder="z. B. 5"
        value={price}
        onChange={(e) => setPrice(e.target.value)}
      />

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
            onChange={(e) => setRegClosesAt(e.target.value)}
            helper={`${groupLabel(rotationGroup!)} hat faire Rotation aktiviert. Bis zu diesem Zeitpunkt sind Anmeldungen ausstehend, danach verteilt die Rotation die Plätze auf einen Schlag.`}
          />
        </div>
      )}

      <div className={styles.fieldGroup}>
        <span className={styles.fieldGroupLabel}>Anmeldung</span>
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

      <div className={styles.notifyBox}>
        <label className={styles.checkboxLabel}>
          <input type="checkbox" checked={notifyCreate} onChange={(e) => setNotifyCreate(e.target.checked)} />
          Push-Benachrichtigung beim Erstellen an Teilnehmer senden
        </label>
        <label className={styles.checkboxLabel}>
          <input type="checkbox" checked={reminderEnabled} onChange={(e) => setReminderEnabled(e.target.checked)} />
          Erinnerung 2 Std. vorher per Push senden
        </label>
      </div>

      {error && <div className={styles.error}>{error}</div>}
      <Button variant="accent" size="lg" full onClick={submit} disabled={saving}>
        {submitLabel}
      </Button>
    </div>
  );
}
