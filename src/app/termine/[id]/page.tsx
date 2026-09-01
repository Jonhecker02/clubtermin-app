"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Calendar, Clock, Euro, MapPin, Users } from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";
import { IconButton } from "@/components/ui/IconButton";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useProfile } from "@/lib/queries/useProfile";
import { useTermine } from "@/lib/queries/useTermine";
import { useGroups } from "@/lib/queries/useGroups";
import { useRegistrationsForTermin } from "@/lib/queries/useRegistrations";
import { queryKeys } from "@/lib/queries/keys";
import { createClient } from "@/lib/supabase/client";
import {
  CANCEL_CUTOFF_HOURS,
  badgeInfo,
  formatCountdown,
  formatPrice,
  fullDateLabel,
  groupShortCode,
  groupsLabel,
  hhmm,
  hoursUntil,
  initials,
  isRegistrationOpen,
  msUntil,
  registrationClosesAt,
  registrationOpensLabel,
  splitRegistrations,
  withShortCode,
} from "@/lib/domain";
import { RealtimeProvider } from "@/lib/realtime/RealtimeProvider";
import styles from "./page.module.css";

export default function TerminDetailPage() {
  const params = useParams<{ id: string }>();
  const terminId = params.id;
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: profile } = useProfile();
  const { data: termine = [] } = useTermine();
  const { data: groups = [] } = useGroups();
  const { data: registrations = [], isLoading: registrationsLoading } = useRegistrationsForTermin(terminId);

  const [pending, setPending] = useState(false);
  const [actionError, setActionError] = useState("");
  // Ticks the countdown below without re-fetching anything — cheap, purely
  // for re-rendering formatCountdown() with a fresh "now".
  const [, setTick] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(interval);
  }, []);

  const termin = termine.find((t) => t.id === terminId);

  const { confirmed: participants, waitlist, pending: pendingRegistrations } = useMemo(
    () => splitRegistrations(registrations),
    [registrations],
  );

  async function invalidateAll() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.registrations(terminId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.termine }),
      queryClient.invalidateQueries({ queryKey: queryKeys.myRegistrations }),
    ]);
  }

  async function handleRegister() {
    setPending(true);
    setActionError("");
    const supabase = createClient();
    const { error } = await supabase.rpc("register_for_termin", { p_termin_id: terminId });
    setPending(false);
    if (error) {
      setActionError("Anmeldung war leider nicht möglich. Bitte lade die Seite neu.");
      return;
    }
    await invalidateAll();
  }

  async function handleCancel() {
    setPending(true);
    setActionError("");
    const supabase = createClient();
    const { error } = await supabase.rpc("cancel_registration", { p_termin_id: terminId });
    setPending(false);
    if (error) {
      setActionError(
        error.message.includes("cutoff_passed")
          ? `Abmeldung nicht mehr möglich (weniger als ${CANCEL_CUTOFF_HOURS} Std. vor Beginn).`
          : "Abmeldung war leider nicht möglich. Bitte lade die Seite neu.",
      );
      return;
    }
    // Fire-and-forget: notifies whoever just moved up from the waitlist.
    fetch("/api/notify/waitlist-promoted", { method: "POST" }).catch(() => {});
    await invalidateAll();
  }

  if (!termin) {
    return (
      <div className={styles.wrap}>
        <RealtimeProvider />
        <AppHeader
          title="Termin"
          back={
            <IconButton variant="navy" label="Zurück" onClick={() => router.push("/termine")}>
              <ArrowLeft size={16} color="var(--tp-cream)" strokeWidth={2.5} />
            </IconButton>
          }
        />
        <div className={styles.content}>
          <div className={styles.emptyNote}>Termin wird geladen…</div>
        </div>
      </div>
    );
  }

  const badge = badgeInfo(termin.type);
  const userId = profile?.id;
  const inParticipants = !!userId && participants.some((p) => p.user_id === userId);
  const wlIdx = userId ? waitlist.findIndex((p) => p.user_id === userId) : -1;
  const inWaitlist = wlIdx >= 0;
  const inPending = !!userId && pendingRegistrations.some((p) => p.user_id === userId);
  const closesAt = registrationClosesAt(termin);
  const hoursLeft = hoursUntil(termin.date, termin.start_time);
  const canCancel = hoursLeft >= CANCEL_CUTOFF_HOURS;
  const eligible =
    !!profile && (termin.register_groups.includes("all") || termin.register_groups.includes(profile.group_id ?? ""));

  let actionLabel = "Anmelden";
  let actionVariant: "accent" | "outline" = "accent";
  let actionDisabled = false;
  let cancelNotice = "";
  let onAction: () => void = handleRegister;

  if (inParticipants) {
    actionLabel = "Abmelden";
    actionVariant = "outline";
    if (!canCancel) {
      actionDisabled = true;
      cancelNotice = `Abmeldung nicht mehr möglich (weniger als ${CANCEL_CUTOFF_HOURS} Std. vor Beginn).`;
    }
    onAction = handleCancel;
  } else if (inWaitlist) {
    actionLabel = `Von Warteliste entfernen (Platz ${wlIdx + 1})`;
    actionVariant = "outline";
    onAction = handleCancel;
  } else if (inPending) {
    actionLabel = "Anmeldung zurückziehen";
    actionVariant = "outline";
    cancelNotice = closesAt
      ? `Danke für deine Anmeldung — die finale Zuteilung erfolgt in ${formatCountdown(msUntil(closesAt))}.`
      : "Danke für deine Anmeldung — die finale Zuteilung folgt in Kürze.";
    onAction = handleCancel;
  } else if (!eligible) {
    actionLabel = "Anmeldung geschlossen";
    actionDisabled = true;
    cancelNotice = `Anmeldung ist nur für ${groupsLabel(termin.register_groups, groups)} geöffnet.`;
  } else if (!isRegistrationOpen(termin)) {
    actionLabel = "Anmeldung noch nicht offen";
    actionDisabled = true;
    cancelNotice = registrationOpensLabel(termin) ?? "";
  } else if (participants.length >= termin.max_tn) {
    actionLabel = "Auf Warteliste anmelden";
  }

  const fillPct = Math.min(100, Math.round((participants.length / termin.max_tn) * 100));
  const displayTitle = withShortCode(termin.title, groupShortCode(termin.register_groups, groups));

  return (
    <div className={styles.wrap}>
      <RealtimeProvider />
      <AppHeader
        title={displayTitle}
        back={
          <IconButton variant="navy" label="Zurück" onClick={() => router.push("/termine")}>
            <ArrowLeft size={16} color="var(--tp-cream)" strokeWidth={2.5} />
          </IconButton>
        }
      />
      <div className={styles.content}>
        <div className={styles.badgeRow}>
          <Badge tone={badge.tone}>{badge.label}</Badge>
        </div>
        <div className={styles.title}>{displayTitle}</div>
        {termin.description && <div className={styles.description}>{termin.description}</div>}

        <div className={styles.infoCard}>
          <div className={styles.infoRow}>
            <Calendar size={19} color="var(--tp-pink-deep)" strokeWidth={2} />
            <span>{fullDateLabel(termin.date)}</span>
          </div>
          <div className={styles.infoRow}>
            <Clock size={19} color="var(--tp-pink-deep)" strokeWidth={2} />
            <span>
              {hhmm(termin.start_time)}–{hhmm(termin.end_time)} Uhr
            </span>
          </div>
          <div className={styles.infoRow}>
            <MapPin size={19} color="var(--tp-pink-deep)" strokeWidth={2} />
            <span>
              {termin.location}
              {termin.courts ? `, ${termin.courts}` : ""}
            </span>
          </div>
          <div className={styles.infoRow}>
            <Users size={19} color="var(--tp-pink-deep)" strokeWidth={2} />
            <span>{termin.trainer}</span>
          </div>
          {termin.price != null && (
            <div className={styles.infoRow}>
              <Euro size={19} color="var(--tp-pink-deep)" strokeWidth={2} />
              <span>{formatPrice(termin.price)}</span>
            </div>
          )}
        </div>

        <div className={styles.metaLine}>
          Sichtbar für: {groupsLabel(termin.visible_groups, groups)}
          <br />
          Anmeldung offen für: {groupsLabel(termin.register_groups, groups)}
        </div>

        <div className={styles.sectionHead}>
          <span className={styles.sectionLabel}>Teilnehmer</span>
          <span className={styles.capacityLabel}>
            {participants.length}/{termin.max_tn}
          </span>
        </div>
        <div className={styles.progressTrack}>
          <div className={styles.progressFill} style={{ width: `${fillPct}%` }} />
        </div>

        <div className={styles.participantList}>
          {participants.map((p) => (
            <div key={p.id} className={styles.participantRow}>
              <div className={styles.avatar}>{initials(p.name)}</div>
              <span className={styles.participantName}>{p.name}</span>
            </div>
          ))}
          {!registrationsLoading && participants.length === 0 && (
            <div className={styles.emptyNote}>Noch keine Anmeldungen — sei der Erste!</div>
          )}
        </div>

        {waitlist.length > 0 && (
          <>
            <div className={styles.sectionHead}>
              <span className={styles.sectionLabelPink}>Warteliste ({waitlist.length})</span>
            </div>
            <div className={styles.participantList}>
              {waitlist.map((p, i) => (
                <div key={p.id} className={styles.waitlistRow}>
                  <div className={styles.waitlistPos}>{i + 1}</div>
                  <span className={styles.participantName}>{p.name}</span>
                </div>
              ))}
            </div>
          </>
        )}

        {(cancelNotice || actionError) && <div className={styles.cancelNotice}>{actionError || cancelNotice}</div>}

        <Button
          variant={actionVariant}
          size="lg"
          full
          disabled={actionDisabled || pending || !profile}
          onClick={onAction}
        >
          {actionLabel}
        </Button>
      </div>
    </div>
  );
}
