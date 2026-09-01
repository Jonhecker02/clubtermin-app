"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
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
import { dateLabel, groupLabel, hhmm, isUpcoming, terminDateTime, weekdayLabel } from "@/lib/domain";
import styles from "./page.module.css";

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
          <div className={styles.email}>{profile?.email}</div>
          <div className={styles.groupBadge}>
            <Badge tone="soft">{groupName}</Badge>
          </div>
        </div>

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

        <div className={styles.actions}>
          {isAdmin && (
            <Button variant="primary" full onClick={() => router.push("/admin/termine")}>
              Admin-Bereich öffnen
            </Button>
          )}
          <Button variant="outline" full onClick={logout}>
            Abmelden
          </Button>
        </div>
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
