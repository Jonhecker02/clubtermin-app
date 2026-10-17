"use client";

import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { ArrowLeft, NotebookPen } from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";
import { PageBody } from "@/components/layout/PageBody";
import { IconButton } from "@/components/ui/IconButton";
import { Input } from "@/components/ui/Input";
import { PlayerSheet, type SheetPlayer } from "@/components/admin/PlayerSheet";
import { useRouter } from "@/lib/useGuardedRouter";
import { useNow } from "@/lib/useNow";
import { useTermine } from "@/lib/queries/useTermine";
import { useGroups } from "@/lib/queries/useGroups";
import { useRegistrationsForTermin } from "@/lib/queries/useRegistrations";
import { useTerminCourtGroups } from "@/lib/queries/useTerminCourtGroups";
import { useSkillLevels } from "@/lib/queries/useSkillLevels";
import { usePlayerNotesOverview } from "@/lib/queries/usePlayerNotesOverview";
import {
  courtGroupSwitchMinutes,
  formatLevel,
  groupShortCode,
  hhmm,
  initials,
  isTerminLive,
  livePhase,
  liveStatusText,
  sessionFormatOf,
  splitRegistrations,
  withShortCode,
} from "@/lib/domain";
import adminStyles from "@/components/admin/AdminList.module.css";
import styles from "./page.module.css";

// The trainer's court-side view of a running training: who is on which court
// and what they are doing right now, each player one tap away from a quick
// note and their Spielstärke.
export default function LiveTerminPage() {
  const params = useParams<{ id: string }>();
  const terminId = params.id;
  const router = useRouter();
  const now = useNow(30_000);

  const { data: termine = [] } = useTermine();
  const { data: groups = [] } = useGroups();
  const { data: registrations = [] } = useRegistrationsForTermin(terminId);
  const { data: courtGroups = [] } = useTerminCourtGroups(terminId);
  const { data: levels } = useSkillLevels();
  const { data: notes = {} } = usePlayerNotesOverview();

  const termin = termine.find((t) => t.id === terminId);
  const { confirmed } = useMemo(() => splitRegistrations(registrations), [registrations]);
  const [selected, setSelected] = useState<SheetPlayer | null>(null);
  const [search, setSearch] = useState("");

  if (!termin) {
    return (
      <>
        <AppHeader title="Live" />
        <PageBody>
          <div className={adminStyles.empty}>Termin wird geladen…</div>
        </PageBody>
      </>
    );
  }

  const format = sessionFormatOf(termin);
  const live = isTerminLive(termin, now);
  const phase = livePhase(termin, now);
  const switchMinutes = courtGroupSwitchMinutes(termin);
  const switchLabel = `${String(Math.floor(switchMinutes / 60)).padStart(2, "0")}:${String(switchMinutes % 60).padStart(2, "0")}`;
  const title = withShortCode(termin.title, groupShortCode(termin.register_groups, groups));
  const query = search.trim().toLowerCase();
  const nameOf = new Map(confirmed.map((p) => [p.user_id, p.name]));

  // What a court is doing right now.
  function activity(round: 1 | 2): string {
    if (format === "nur_spiel") return "spielt";
    if (format === "nur_training") return "trainiert";
    return round === phase ? "trainiert jetzt" : "spielt jetzt";
  }

  function PlayerRow({ userId }: { userId: string }) {
    const name = nameOf.get(userId) ?? "—";
    if (query && !name.toLowerCase().includes(query)) return null;
    const level = levels?.[userId];
    const summary = notes[userId];
    return (
      <button
        type="button"
        className={styles.player}
        onClick={() => setSelected({ id: userId, name, subtitle: summary ? `${summary.count} Notiz${summary.count === 1 ? "" : "en"}` : "Noch keine Notizen" })}
      >
        <span className={styles.avatar}>{initials(name)}</span>
        <span className={styles.playerText}>
          <span className={styles.playerName}>{name}</span>
          {summary && <span className={styles.playerNote}>{summary.latest}</span>}
        </span>
        {level != null && <span className={styles.level}>{formatLevel(level)}</span>}
        <span className={`${styles.noteBtn} ${summary ? styles.noteBtnFilled : ""}`} aria-hidden="true">
          <NotebookPen size={16} strokeWidth={2.2} />
          {summary && <span className={styles.noteCount}>{summary.count}</span>}
        </span>
      </button>
    );
  }

  const placedIds = new Set(courtGroups.flatMap((g) => g.member_ids));
  const unplaced = confirmed.filter((p) => !placedIds.has(p.user_id));
  const grouped = courtGroups.some((g) => g.member_ids.length > 0);

  return (
    <>
      <AppHeader
        title="Live"
        back={
          <IconButton variant="navy" label="Zurück" onClick={() => router.push(`/admin/termine/${terminId}`)}>
            <ArrowLeft size={16} color="var(--tp-cream)" strokeWidth={2.5} />
          </IconButton>
        }
      />
      <PageBody>
        <div className={styles.status}>
          <div className={styles.statusTop}>
            {live && <span className={styles.liveDot} aria-hidden="true" />}
            <span className={styles.statusEyebrow}>{live ? "Läuft gerade" : "Nicht live"} · {liveStatusText(termin, now)}</span>
          </div>
          <div className={styles.statusTitle}>{title}</div>
          <div className={styles.statusMeta}>
            {hhmm(termin.start_time)}–{hhmm(termin.end_time)} Uhr
            {format === "training_spiel" && live ? ` · Wechsel um ${switchLabel} · jetzt Phase ${phase} von 2` : ""}
          </div>
        </div>

        {confirmed.length > 6 && (
          <Input placeholder="Spieler suchen…" value={search} onChange={(e) => setSearch(e.target.value)} className={styles.search} />
        )}

        {grouped ? (
          <>
            {courtGroups
              .filter((g) => g.member_ids.length > 0)
              .map((g) => (
                <section key={g.id} className={styles.court}>
                  <div className={styles.courtHead}>
                    <span className={styles.courtLabel}>{g.label}</span>
                    <span className={styles.courtActivity}>{activity(g.trains_in_round)}</span>
                  </div>
                  {g.trainer_name && format !== "nur_spiel" && <div className={styles.courtTrainer}>Trainer: {g.trainer_name}</div>}
                  <div className={styles.players}>
                    {g.member_ids.map((id) => (
                      <PlayerRow key={id} userId={id} />
                    ))}
                  </div>
                </section>
              ))}
            {unplaced.length > 0 && (
              <section className={styles.court}>
                <div className={styles.courtHead}>
                  <span className={styles.courtLabel}>Ohne Court</span>
                </div>
                <div className={styles.players}>
                  {unplaced.map((p) => (
                    <PlayerRow key={p.user_id} userId={p.user_id} />
                  ))}
                </div>
              </section>
            )}
          </>
        ) : (
          <section className={styles.court}>
            <div className={styles.courtHead}>
              <span className={styles.courtLabel}>Teilnehmer ({confirmed.length})</span>
            </div>
            <div className={styles.players}>
              {confirmed.map((p) => (
                <PlayerRow key={p.user_id} userId={p.user_id} />
              ))}
              {confirmed.length === 0 && <div className={adminStyles.empty}>Noch keine Teilnehmer.</div>}
            </div>
          </section>
        )}
      </PageBody>
      <PlayerSheet key={selected?.id ?? "none"} player={selected} onClose={() => setSelected(null)} />
    </>
  );
}
