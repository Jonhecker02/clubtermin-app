"use client";

import { useMemo, useState } from "react";
import { Tabs } from "@/components/ui/Tabs";
import { useProfile } from "@/lib/queries/useProfile";
import { useTermine } from "@/lib/queries/useTermine";
import { useMyRegistrations } from "@/lib/queries/useRegistrations";
import { useNow } from "@/lib/useNow";
import { computeParticipation } from "@/lib/participation";
import { dateLabel } from "@/lib/domain";
import styles from "./MyParticipationCard.module.css";

const PERIODS = [
  { id: "90", label: "3 Monate" },
  { id: "180", label: "6 Monate" },
  { id: "365", label: "12 Monate" },
];

// A player's own numbers: out of the trainings they could have joined, how
// often they registered and how often they got a spot. Registering without
// getting a place counts fully — it shows willingness.
export function MyParticipationCard() {
  const now = useNow(5 * 60_000);
  const { data: profile } = useProfile();
  const { data: termine = [] } = useTermine();
  const { data: myRegs = [] } = useMyRegistrations(profile?.id);
  const [period, setPeriod] = useState("90");

  const stats = useMemo(() => {
    if (!profile) return null;
    const sinceISO = new Date(now - Number(period) * 86400000).toISOString().slice(0, 10);
    const rows = computeParticipation({
      termine,
      registrations: myRegs.map((r) => ({ termin_id: r.termin_id, user_id: profile.id, status: r.status })),
      players: [{ id: profile.id, name: profile.name, group_id: profile.group_id, created_at: profile.created_at }],
      sinceISO,
      nowMs: now,
      types: ["training"],
    });
    return rows[0] ?? null;
  }, [profile, termine, myRegs, period, now]);

  if (!stats) return null;
  const total = stats.eligible;
  const dots = stats.history.slice(0, 10).reverse();

  return (
    <div className={styles.card}>
      <div className={styles.head}>
        <span className={styles.title}>Meine Teilnahme</span>
        <span className={styles.sub}>nur Trainings</span>
      </div>
      <Tabs items={PERIODS} value={period} onChange={setPeriod} size="sm" />

      {total === 0 ? (
        <div className={styles.empty}>In diesem Zeitraum gab es noch keine Trainings für dich.</div>
      ) : (
        <>
          <div className={styles.numbers}>
            <div className={styles.big}>
              <span className={styles.bigNum}>
                {stats.registered}
                <span className={styles.bigOf}>/{total}</span>
              </span>
              <span className={styles.bigLabel}>angemeldet</span>
            </div>
            <div className={styles.big}>
              <span className={styles.bigNum}>{stats.confirmed}</span>
              <span className={styles.bigLabel}>dabei</span>
            </div>
            {stats.waitlist > 0 && (
              <div className={styles.big}>
                <span className={styles.bigNum}>{stats.waitlist}</span>
                <span className={styles.bigLabel}>ohne Platz</span>
              </div>
            )}
          </div>
          <div className={styles.bar} aria-hidden="true">
            <span className={styles.barConfirmed} style={{ width: `${(stats.confirmed / total) * 100}%` }} />
            <span className={styles.barWait} style={{ width: `${(stats.waitlist / total) * 100}%` }} />
          </div>
          <div className={styles.dots} aria-hidden="true">
            {dots.map((h) => (
              <span key={h.terminId} className={`${styles.dot} ${styles[`dot_${h.outcome}`]}`} />
            ))}
          </div>
          <div className={styles.legend}>
            <span><span className={`${styles.dot} ${styles.dot_dabei}`} /> dabei</span>
            <span><span className={`${styles.dot} ${styles.dot_warteliste}`} /> angemeldet, kein Platz</span>
            <span><span className={`${styles.dot} ${styles.dot_nicht}`} /> nicht angemeldet</span>
          </div>
          <div className={styles.foot}>
            {stats.lastConfirmed ? `Zuletzt dabei: ${dateLabel(stats.lastConfirmed)}` : "Noch nicht dabei gewesen."} Wer sich
            anmeldet, aber bei der Platzvergabe keinen Platz bekommt, zählt trotzdem voll als angemeldet — und wer länger
            nicht dabei war, hat bei der fairen Rotation Vorrang.
          </div>
        </>
      )}
    </div>
  );
}
