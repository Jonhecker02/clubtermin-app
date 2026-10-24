"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "@/lib/useGuardedRouter";
import { useQueryClient } from "@tanstack/react-query";
import { Bell, CalendarPlus, ChevronDown, ChevronUp, Copy, Info, Pencil } from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";
import { PageBody } from "@/components/layout/PageBody";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { Input } from "@/components/ui/Input";
import { EventRow } from "@/components/ui/EventRow";
import { useProfile } from "@/lib/queries/useProfile";
import { useGroups } from "@/lib/queries/useGroups";
import { useTermine } from "@/lib/queries/useTermine";
import { useMyRegistrations } from "@/lib/queries/useRegistrations";
import { useIcalToken } from "@/lib/queries/useIcalToken";
import { usePush } from "@/lib/queries/usePush";
import { createClient } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/queries/keys";
import { dateLabel, displayEmail, groupLabel, hhmm, isTerminRunning, isUpcoming, terminDateTime, weekdayLabel } from "@/lib/domain";
import styles from "./page.module.css";
import { clearAllCaches } from "@/lib/queryPersist";
import { applyTheme, getStoredTheme, type ThemeChoice } from "@/lib/theme";
import { Tabs } from "@/components/ui/Tabs";
import { useUnsavedChanges } from "@/lib/useUnsavedChanges";
import { useMyPersonalDetails } from "@/lib/queries/useMyPersonalDetails";
import { isPlausibleBirthDate } from "@/lib/domain";
import { MyParticipationCard } from "@/components/MyParticipationCard";
import { DeleteAccountButton } from "@/components/AccountSafetyCards";

const THEME_ITEMS = [
  { id: "auto", label: "Automatisch" },
  { id: "light", label: "Hell" },
  { id: "dark", label: "Dunkel" },
];

const ROLE_LABEL: Record<string, string> = { owner: "Clubmanager", trainer: "Trainer", captain: "Kapitän" };
const ROLE_BADGE_TONE: Record<string, "navy" | "amber"> = { owner: "navy", trainer: "navy", captain: "amber" };

export default function ProfilPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: profile } = useProfile();
  const { data: groups = [] } = useGroups();
  const { data: termine = [] } = useTermine();
  const { data: myRegs = [] } = useMyRegistrations(profile?.id);
  const { data: icalToken } = useIcalToken(!!profile);
  const push = usePush(profile?.id);
  // Own date of birth / gender (team planning; only trainers and admins see them).
  const { data: myDetails } = useMyPersonalDetails();
  const [birthInput, setBirthInput] = useState<string | null>(null);
  const [genderInput, setGenderInput] = useState<"m" | "w" | null | undefined>(undefined);
  const [detailsError, setDetailsError] = useState("");
  const [detailsSaved, setDetailsSaved] = useState(false);
  const shownBirth = birthInput ?? myDetails?.birth_date ?? "";
  const shownGender = genderInput === undefined ? (myDetails?.gender ?? null) : genderInput;
  const detailsDirty =
    (birthInput !== null && birthInput !== (myDetails?.birth_date ?? "")) ||
    (genderInput !== undefined && genderInput !== (myDetails?.gender ?? null));
  useUnsavedChanges(detailsDirty);

  async function saveDetails() {
    if (!isPlausibleBirthDate(shownBirth)) {
      setDetailsError("Bitte gib ein gültiges Geburtsdatum an.");
      return;
    }
    if (!shownGender) {
      setDetailsError("Bitte wähle Herr oder Dame.");
      return;
    }
    setDetailsError("");
    const supabase = createClient();
    const { error } = await supabase.rpc("set_my_personal_details", { p_birth_date: shownBirth, p_gender: shownGender });
    if (error) {
      setDetailsError("Speichern fehlgeschlagen.");
      return;
    }
    setBirthInput(null);
    setGenderInput(undefined);
    setDetailsSaved(true);
    setTimeout(() => setDetailsSaved(false), 2000);
    await queryClient.invalidateQueries({ queryKey: ["myPersonalDetails"] });
    await queryClient.invalidateQueries({ queryKey: ["personalDetails"] });
  }
  // Read after mount: the saved choice lives in localStorage, which the server render cannot see.
  const [theme, setTheme] = useState<ThemeChoice>("auto");
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTheme(getStoredTheme());
  }, []);

  const [host] = useState(() => (typeof window !== "undefined" ? window.location.host : ""));
  const icalUrl = host && icalToken ? `webcal://${host}/api/ical/${icalToken}` : null;
  const icalHttpsUrl = host && icalToken ? `https://${host}/api/ical/${icalToken}` : null;
  const [linkCopied, setLinkCopied] = useState(false);
  const [showAppleHint, setShowAppleHint] = useState(false);
  const [showAndroidHint, setShowAndroidHint] = useState(false);
  const [showPast, setShowPast] = useState(false);

  async function copyIcalLink() {
    if (!icalHttpsUrl) return;
    await navigator.clipboard.writeText(icalHttpsUrl);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  }

  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState("");
  // Name field open with a different name typed than the saved one.
  useUnsavedChanges(editingName && nameInput.trim() !== (profile?.name ?? ""));
  const [nameError, setNameError] = useState("");
  const [savingName, setSavingName] = useState(false);

  function startEditName() {
    setNameInput(profile?.name ?? "");
    setNameError("");
    setEditingName(true);
  }

  async function saveName() {
    if (!nameInput.trim()) {
      setNameError("Bitte gib einen Namen ein.");
      return;
    }
    setSavingName(true);
    const supabase = createClient();
    const { error } = await supabase.from("profiles").update({ name: nameInput.trim() }).eq("id", profile!.id);
    setSavingName(false);
    if (error) {
      setNameError("Name konnte nicht gespeichert werden.");
      return;
    }
    setEditingName(false);
    await queryClient.invalidateQueries({ queryKey: queryKeys.profile });
  }

  const myGroup = groups.find((g) => g.id === profile?.group_id);
  const groupName = myGroup ? groupLabel(myGroup) : "—";
  const isAdmin = profile?.role === "owner" || profile?.role === "trainer" || profile?.role === "captain";

  const { myUpcoming, myPast } = useMemo(() => {
    const rows = myRegs
      .map((r) => {
        const t = termine.find((t) => t.id === r.termin_id);
        if (!t) return null;
        return {
          id: t.id,
          weekday: weekdayLabel(t.date),
          dateLabel: dateLabel(t.date),
          title: t.title,
          subtitle:
            r.status === "warteliste"
              ? `Warteliste · Platz ${waitlistPosition(myRegs, r)}`
              : r.status === "ausstehend"
                ? "Zuteilung folgt"
                : "Angemeldet",
          time: hhmm(t.start_time),
          sortKey: terminDateTime(t.date, t.start_time).getTime(),
          upcoming: isUpcoming(t),
          live: isTerminRunning(t),
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) => a.sortKey - b.sortKey);

    return {
      myUpcoming: rows.filter((r) => r.upcoming),
      myPast: rows.filter((r) => !r.upcoming),
    };
  }, [myRegs, termine]);

  async function logout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    // Otherwise a shared device switching users in the same tab keeps
    // showing the previous account's cached profile/role-gated UI (RLS
    // still enforces the real permissions server-side — this is purely a
    // stale-display issue) until something forces a full reload.
    clearAllCaches(queryClient);
    router.push("/login");
    router.refresh();
  }

  return (
    <>
      <AppHeader title="Profil" />
      <PageBody>
        <div className={styles.card}>
          {!editingName ? (
            <div className={styles.nameRow}>
              <div className={styles.nameCol}>
                <div className={styles.name}>{profile?.name}</div>
                <IconButton variant="soft" size="sm" label="Namen bearbeiten" onClick={startEditName}>
                  <Pencil size={13} strokeWidth={2} />
                </IconButton>
              </div>
              {isAdmin && profile && <Badge tone={ROLE_BADGE_TONE[profile.role]}>{ROLE_LABEL[profile.role]}</Badge>}
            </div>
          ) : (
            <div className={styles.editRow}>
              <Input label="Name" value={nameInput} onChange={(e) => setNameInput(e.target.value)} error={nameError} />
              <div className={styles.editActions}>
                <Button variant="accent" size="sm" full onClick={saveName} disabled={savingName}>
                  Speichern
                </Button>
                <Button variant="outline" size="sm" full onClick={() => setEditingName(false)}>
                  Abbrechen
                </Button>
              </div>
            </div>
          )}
          {displayEmail(profile?.email) && <div className={styles.email}>{displayEmail(profile?.email)}</div>}
          <div className={styles.groupBadge}>
            <Badge tone="soft">{groupName}</Badge>
          </div>
        </div>

        <MyParticipationCard />

        <div className={styles.sectionLabel}>Meine Anmeldungen</div>
        <div className={styles.list}>
          {myUpcoming.map((t) => (
            <EventRow key={t.id} {...t} onClick={() => router.push(`/termine/${t.id}`)} />
          ))}
          {myUpcoming.length === 0 && myPast.length === 0 && (
            <div className={styles.empty}>Du bist noch für kein Training angemeldet.</div>
          )}
        </div>

        {myPast.length > 0 && (
          <>
            <button type="button" className={styles.pastToggle} onClick={() => setShowPast((v) => !v)}>
              {showPast ? "Vergangene ausblenden" : `${myPast.length} vergangene Anmeldung${myPast.length === 1 ? "" : "en"} anzeigen`}
              {showPast ? <ChevronUp size={15} strokeWidth={2.2} /> : <ChevronDown size={15} strokeWidth={2.2} />}
            </button>
            {showPast && (
              <div className={[styles.list, styles.pastList].join(" ")}>
                {myPast.map((t) => (
                  <EventRow key={t.id} {...t} onClick={() => router.push(`/termine/${t.id}`)} />
                ))}
              </div>
            )}
          </>
        )}

        {icalUrl && (
          <div className={styles.icalBox}>
            <div className={styles.icalButtonRow}>
              <Button variant="outline" full onClick={() => (window.location.href = icalUrl)}>
                <CalendarPlus size={17} strokeWidth={2} style={{ marginRight: 8 }} />
                iOS / macOS
              </Button>
              <IconButton
                variant="soft"
                size="sm"
                label="Anleitung iOS/macOS"
                onClick={() => setShowAppleHint((v) => !v)}
              >
                <Info size={16} strokeWidth={2} />
              </IconButton>
            </div>
            {showAppleHint && (
              <div className={styles.icalHint}>
                Öffnet direkt die Kalender-App auf iPhone oder Mac und fragt dich, ob du das Abo hinzufügen willst —
                einfach bestätigen.
              </div>
            )}

            <div className={styles.icalButtonRow}>
              <Button variant="outline" full onClick={copyIcalLink}>
                <Copy size={17} strokeWidth={2} style={{ marginRight: 8 }} />
                {linkCopied ? "Link kopiert!" : "Android / Google"}
              </Button>
              <IconButton
                variant="soft"
                size="sm"
                label="Anleitung Android"
                onClick={() => setShowAndroidHint((v) => !v)}
              >
                <Info size={16} strokeWidth={2} />
              </IconButton>
            </div>
            {showAndroidHint && (
              <div className={styles.icalHint}>
                Google Kalender hat kein Ein-Klick-Abo. Link kopieren, dann auf calendar.google.com: links bei
                &bdquo;Weitere Kalender&ldquo; auf &bdquo;+&ldquo; → &bdquo;Per URL&ldquo; → Link einfügen. Der
                Kalender erscheint danach automatisch auf allen Geräten mit diesem Google-Konto — auch in Samsung
                Kalender, wenn dort derselbe Google-Account eingerichtet ist.
              </div>
            )}

            <div className={styles.icalHint}>
              Trägt deine Anmeldungen live in den Kalender ein (bleibt automatisch aktuell). Der Link ist geheim —
              nicht weitergeben.
            </div>
          </div>
        )}

        {!push.loading && (
          <div className={styles.icalBox}>
            {push.iosNeedsInstall ? (
              <div className={styles.icalHint}>
                Für Push-Benachrichtigungen auf dem iPhone: diese Seite zuerst über &bdquo;Teilen&ldquo; →
                &bdquo;Zum Home-Bildschirm&ldquo; hinzufügen und von dort aus öffnen.
              </div>
            ) : push.supported ? (
              <>
                <Button
                  variant={push.subscribed ? "outline" : "accent"}
                  full
                  onClick={push.subscribed ? push.unsubscribe : push.subscribe}
                >
                  <Bell size={17} strokeWidth={2} style={{ marginRight: 8 }} />
                  {push.subscribed ? "Push-Benachrichtigungen deaktivieren" : "Push-Benachrichtigungen aktivieren"}
                </Button>
                <div className={styles.icalHint}>Benachrichtigt dich auf diesem Gerät, wenn ein neuer Termin angelegt wird.</div>
              </>
            ) : (
              <div className={styles.icalHint}>Push-Benachrichtigungen werden von diesem Browser nicht unterstützt.</div>
            )}
          </div>
        )}

        <div className={styles.icalBox}>
          <div className={styles.sectionLabel} style={{ margin: 0 }}>
            Meine Angaben
          </div>
          <Input
            label="Geburtsdatum"
            type="date"
            value={shownBirth}
            max={new Date().toISOString().slice(0, 10)}
            onChange={(e) => setBirthInput(e.target.value)}
          />
          <Tabs
            items={[
              { id: "m", label: "Herren" },
              { id: "w", label: "Damen" },
            ]}
            value={shownGender ?? ""}
            onChange={(id) => setGenderInput(id as "m" | "w")}
            size="sm"
          />
          <div className={styles.icalHint}>Nur Trainer und Admins sehen diese Angaben — sie helfen bei der Mannschaftsplanung.</div>
          {detailsError && <div className={styles.icalHint} style={{ color: "var(--tp-danger)" }}>{detailsError}</div>}
          <Button variant={detailsDirty ? "accent" : "outline"} full onClick={saveDetails} disabled={!detailsDirty}>
            {detailsSaved ? "Gespeichert ✓" : "Angaben speichern"}
          </Button>
        </div>

        <div className={styles.icalBox}>
          <div className={styles.sectionLabel} style={{ margin: 0 }}>
            Darstellung
          </div>
          <Tabs
            items={THEME_ITEMS}
            value={theme}
            onChange={(id) => {
              const choice = id as ThemeChoice;
              setTheme(choice);
              applyTheme(choice);
            }}
            size="sm"
          />
        </div>

        <div className={styles.actions}>
          {isAdmin && (
            <Button variant="primary" full onClick={() => router.push("/admin/termine")}>
              Admin-Bereich öffnen
            </Button>
          )}
          <Button variant="outline" full onClick={() => router.push(isAdmin ? "/anleitung/admin" : "/anleitung")}>
            Anleitung öffnen
          </Button>
          <Button variant="outline" full onClick={logout}>
            Abmelden
          </Button>
        </div>

        <div className={styles.legalLinks}>
          <a href="/privacy">Datenschutz</a>
          <a href="/impressum">Impressum</a>
          <a href="/support">Hilfe &amp; Kontakt</a>
        </div>
        <DeleteAccountButton isOwner={profile?.role === "owner"} />
      </PageBody>
    </>
  );
}

function waitlistPosition(all: { termin_id: string; status: string; created_at: string }[], reg: { termin_id: string; created_at: string }) {
  const wl = all
    .filter((r) => r.termin_id === reg.termin_id && r.status === "warteliste")
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  return wl.findIndex((r) => r.created_at === reg.created_at) + 1;
}
