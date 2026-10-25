"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useRouter } from "@/lib/useGuardedRouter";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Calendar, Clock, ExternalLink, Euro, MapPin, Users } from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";
import { IconButton } from "@/components/ui/IconButton";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Switch } from "@/components/ui/Switch";
import { useProfile } from "@/lib/queries/useProfile";
import { useTermine } from "@/lib/queries/useTermine";
import { useGroups } from "@/lib/queries/useGroups";
import { useRegistrationsForTermin } from "@/lib/queries/useRegistrations";
import { useTerminCourtGroups } from "@/lib/queries/useTerminCourtGroups";
import { useWaitlistRank } from "@/lib/queries/useWaitlistRank";
import { useMyAllocation } from "@/lib/queries/useMyAllocation";
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
  orderByWaitlistRank,
  registrationClosesAt,
  ROTATION_RULE_TEXT,
  dateLabel,
  registrationOpensLabel,
  splitRegistrations,
  withShortCode,
  playerPlanSentence,
  sessionFormatOf,
  isNachruecker,
  registrationDeadlinePassed,
  isTerminRunning,
} from "@/lib/domain";
import { pushWhen } from "@/lib/pushText";
import { RealtimeProvider } from "@/lib/realtime/RealtimeProvider";
import { SpieltagResults } from "@/components/SpieltagResults";
import styles from "./page.module.css";
import { haptic } from "@/lib/haptics";
import { triggerPlacement } from "@/lib/placement";

export default function TerminDetailPage() {
  const params = useParams<{ id: string }>();
  const terminId = params.id;
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: profile } = useProfile();
  const { data: termine = [] } = useTermine();
  const { data: groups = [] } = useGroups();
  const { data: registrations = [], isLoading: registrationsLoading } = useRegistrationsForTermin(terminId);
  const { data: courtGroups = [] } = useTerminCourtGroups(terminId);
  const { data: waitlistRanks } = useWaitlistRank(terminId);
  const { data: myAllocation } = useMyAllocation(terminId, profile?.id ?? null);

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

  const { confirmed: participants, waitlist: waitlistUnordered, pending: pendingRegistrations } = useMemo(
    () => splitRegistrations(registrations),
    [registrations],
  );
  const waitlist = useMemo(
    () => orderByWaitlistRank(waitlistUnordered, waitlistRanks),
    [waitlistUnordered, waitlistRanks],
  );

  async function invalidateAll() {
    // termine itself never changes here — register/cancel only touch
    // registrations, so refetching the whole termine list would just be an
    // extra round trip for no new data.
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.registrations(terminId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.myRegistrations }),
    ]);
  }

  async function handleRegister() {
    haptic("light");
    setPending(true);
    setActionError("");
    const supabase = createClient();
    const { error } = await supabase.rpc("register_for_termin", { p_termin_id: terminId });
    setPending(false);
    if (error) {
      haptic("error");
      setActionError("Anmeldung war leider nicht möglich. Bitte lade die Seite neu.");
      return;
    }
    haptic("success");
    triggerPlacement(terminId);
    await invalidateAll();
  }

  async function handleCancel() {
    haptic("light");
    setPending(true);
    setActionError("");
    const supabase = createClient();
    const { error } = await supabase.rpc("cancel_registration", { p_termin_id: terminId });
    setPending(false);
    if (error) {
      haptic("error");
      setActionError(
        error.message.includes("cutoff_passed")
          ? `Abmeldung nicht mehr möglich (weniger als ${CANCEL_CUTOFF_HOURS} Std. vor Beginn).`
          : "Abmeldung war leider nicht möglich. Bitte lade die Seite neu.",
      );
      return;
    }
    // Fire-and-forget: notifies whoever just moved up from the waitlist.
    fetch("/api/notify/waitlist-promoted", { method: "POST" }).catch(() => {});
    triggerPlacement(terminId);
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

  // Turniere (e.g. GPS): no registration in the app — just the facts, the hint
  // on how to sign up and the link.
  if (termin.type === "turnier") {
    const tournamentTitle = withShortCode(termin.title, groupShortCode(termin.register_groups, groups));
    return (
      <div className={styles.wrap}>
        <RealtimeProvider />
        <AppHeader
          title={tournamentTitle}
          back={
            <IconButton variant="navy" label="Zurück" onClick={() => router.push("/termine")}>
              <ArrowLeft size={16} color="var(--tp-cream)" strokeWidth={2.5} />
            </IconButton>
          }
          right={
            profile && ["owner", "trainer", "captain"].includes(profile.role) ? (
              <Switch checked={false} onChange={() => router.push(`/admin/termine/${terminId}`)} label="Admin" onDark />
            ) : undefined
          }
        />
        <div className={styles.content}>
          <div className={styles.badgeRow}>
            <Badge tone={badge.tone}>{badge.label}</Badge>
          </div>
          <div className={styles.title}>{tournamentTitle}</div>
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
              <span>{termin.location}</span>
            </div>
            {termin.price != null && (
              <div className={styles.infoRow}>
                <Euro size={19} color="var(--tp-pink-deep)" strokeWidth={2} />
                <span>{formatPrice(termin.price)}</span>
              </div>
            )}
          </div>

          <div className={styles.infoCard}>
            <div className={styles.sectionLabel}>So meldest du dich an</div>
            <div className={styles.infoRow}>
              <span>
                {termin.external_hint || "Die Anmeldung läuft nicht über die App, sondern über den Link unten."}
              </span>
            </div>
          </div>

          {termin.external_url && (
            <Button variant="accent" size="lg" full onClick={() => window.open(termin.external_url ?? "", "_blank", "noopener,noreferrer")}>
              <ExternalLink size={17} strokeWidth={2.3} style={{ marginRight: 6 }} />
              Zur Anmeldung
            </Button>
          )}
          <div className={styles.metaLine}>Sichtbar für: {groupsLabel(termin.visible_groups, groups)}</div>
        </div>
      </div>
    );
  }

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
  const myCourtGroup =
    termin.court_groups_published_at && userId ? courtGroups.find((g) => g.member_ids.includes(userId)) : undefined;

  // Names of the others on the player's court (the database only hands them
  // out while the admin has "Mitspieler anzeigen" on).
  const mates = myCourtGroup
    ? myCourtGroup.member_ids
        .filter((id) => id !== userId)
        .map((id) => ({ user_id: id, name: registrations.find((r) => r.user_id === id)?.name ?? "" }))
        .filter((m) => m.name)
    : [];

  let actionLabel = "Anmelden";
  let actionVariant: "accent" | "outline" = "accent";
  let actionDisabled = false;
  let cancelNotice = "";
  // Friendly, non-error information (countdown, allocation reason) — kept
  // apart from cancelNotice, which is styled as a warning.
  let infoNote = "";
  let onAction: () => void = handleRegister;

  if (inParticipants) {
    actionLabel = "Abmelden";
    actionVariant = "outline";
    if (!canCancel) {
      actionDisabled = true;
      cancelNotice = `Abmeldung nicht mehr möglich (weniger als ${CANCEL_CUTOFF_HOURS} Std. vor Beginn).`;
    }
    const myRegistration = registrations.find((r) => r.user_id === userId);
    if (myRegistration && isNachruecker(myRegistration.created_at, termin)) {
      infoNote = "Du bist als Nachrücker dabei. Deine Gruppe teilt der Clubmanager noch ein.";
    } else if (myAllocation?.included) {
      infoNote = myAllocation.excluded_from_rotation
        ? "Du hast einen garantierten Platz."
        : myAllocation.rank_order != null && myAllocation.applicant_count != null
          ? `Du hast einen Platz bekommen (Rang ${myAllocation.rank_order} von ${myAllocation.applicant_count} Bewerbern).`
          : "Du hast bei der Zuteilung einen Platz bekommen.";
    }
    onAction = handleCancel;
  } else if (inWaitlist) {
    actionLabel = `Von Warteliste entfernen (Platz ${wlIdx + 1})`;
    actionVariant = "outline";
    // myAllocation.included === false means the last fair-rotation run
    // actively decided against this player (not just plain FCFS overflow) —
    // give them the concrete reason instead of leaving them guessing.
    if (myAllocation && !myAllocation.included) {
      const rankPart =
        myAllocation.rank_order != null && myAllocation.applicant_count != null
          ? `Rang ${myAllocation.rank_order} von ${myAllocation.applicant_count} Bewerbern. `
          : "";
      const lastPart = myAllocation.last_participation
        ? myAllocation.never_participated
          ? `Du warst bisher noch nie dabei (zählt ab ${dateLabel(myAllocation.last_participation)}). Wer länger wartet, hatte Vorrang.`
          : `Du warst zuletzt am ${dateLabel(myAllocation.last_participation)} dabei. Wer länger pausiert hat, hatte Vorrang.`
        : "Wer länger nicht dran war, hatte Vorrang.";
      infoNote = `Diesmal nicht dabei: ${rankPart}${lastPart}`;
    }
    onAction = handleCancel;
  } else if (inPending) {
    actionLabel = "Anmeldung zurückziehen";
    actionVariant = "outline";
    infoNote =
      closesAt && termin.registration_closes_date
        ? `Danke für deine Anmeldung! Anmeldeschluss ist ${pushWhen(termin.registration_closes_date, termin.registration_closes_time ?? "00:00")} (noch ${formatCountdown(msUntil(closesAt))}). Danach werden die Plätze fair verteilt und du bekommst Bescheid.`
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
  } else if (termin.registration_closes_date && registrationDeadlinePassed(termin)) {
    // After the deadline of a fair-rotation termin: leftover spots can still
    // be taken (as a Nachrücker), otherwise it is the waitlist.
    const free = termin.max_tn - participants.length - pendingRegistrations.length;
    if (!termin.allocation_proposed_at) {
      infoNote =
        "Der Anmeldeschluss ist vorbei, die Zuteilung läuft gerade. Wenn du dich jetzt anmeldest, wirst du noch fair mit berücksichtigt.";
    } else if (free > 0) {
      actionLabel = "Als Nachrücker anmelden";
      infoNote = `Der Anmeldeschluss ist vorbei, aber es ${free === 1 ? "ist noch 1 Platz" : `sind noch ${free} Plätze`} frei. Als Nachrücker bekommst du sofort einen freien Platz — deine Gruppe teilt der Clubmanager danach ein.`;
    } else {
      actionLabel = "Auf Warteliste anmelden";
      infoNote = "Alle Plätze sind vergeben. Auf der Warteliste rückst du bei einer Absage nach.";
    }
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
        // Admins who opened the termin as a player can jump to its admin view.
        right={
          profile && ["owner", "trainer", "captain"].includes(profile.role) ? (
            <Switch checked={false} onChange={() => router.push(`/admin/termine/${terminId}`)} label="Admin" onDark />
          ) : undefined
        }
      />
      <div className={styles.content}>
        <div className={styles.badgeRow}>
          <Badge tone={badge.tone}>{badge.label}</Badge>
          {isTerminRunning(termin) && <Badge tone="soft">● Läuft gerade</Badge>}
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

        {myCourtGroup && (
          <div className={styles.infoCard}>
            <div className={styles.sectionLabel}>{sessionFormatOf(termin) === "nur_spiel" ? "Dein Court" : "Deine Gruppe"}</div>
            <div className={styles.infoRow}>
              <span>
                {myCourtGroup.label}
                {sessionFormatOf(termin) !== "nur_spiel" && myCourtGroup.trainer_name ? ` · Trainer: ${myCourtGroup.trainer_name}` : ""}
              </span>
            </div>
            <div className={styles.infoRow}>
              <span>{playerPlanSentence(myCourtGroup.trains_in_round, termin)}</span>
            </div>
            {mates.length > 0 && (
              <div className={styles.matesBlock}>
                <div className={styles.matesLabel}>Mit dir auf dem Court</div>
                <div className={styles.matesList}>
                  {mates.map((m) => (
                    <span key={m.user_id} className={styles.mate}>
                      <span className={styles.mateAvatar}>{initials(m.name)}</span>
                      {m.name}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {termin.type === "spieltag" && <SpieltagResults terminId={terminId} />}

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
        {infoNote && <div className={styles.infoNote}>{infoNote}</div>}
        {termin.registration_closes_date && <div className={styles.ruleNote}>{ROTATION_RULE_TEXT}</div>}

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
