import { forwardRef } from "react";
import { fullDateLabel, hhmm } from "@/lib/domain";
import type { Termin } from "@/types/database";
import styles from "./CourtGroupsExportCard.module.css";

export interface ExportGroup {
  label: string;
  trainerName: string;
  round: 1 | 2;
  memberNames: string[];
}

interface CourtGroupsExportCardProps {
  termin: Termin;
  groups: ExportGroup[];
}

function toMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function toHHMM(min: number): string {
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// Rendered off-screen purely as a capture target for html-to-image, same
// pattern as TerminExportCard — the actual clock split for "Runde 1"/"Runde
// 2" is the termin's own start/end time cut in half, so the export shows
// real times instead of the abstract round numbers the editor uses.
export const CourtGroupsExportCard = forwardRef<HTMLDivElement, CourtGroupsExportCardProps>(
  function CourtGroupsExportCard({ termin, groups }, ref) {
    const start = toMinutes(termin.start_time);
    const end = toMinutes(termin.end_time);
    const mid = Math.round((start + end) / 2);
    const timeFor = (round: 1 | 2) =>
      round === 1 ? `${toHHMM(start)}–${toHHMM(mid)}` : `${toHHMM(mid)}–${toHHMM(end)}`;

    return (
      <div ref={ref} className={styles.card} style={{ width: Math.max(560, groups.length * 200 + 64) }}>
        <div className={styles.header}>
          <div className={styles.eyebrow}>Trainingsgruppen</div>
          <div className={styles.title}>{termin.title}</div>
          <div className={styles.dateLine}>
            {fullDateLabel(termin.date)} · {hhmm(termin.start_time)}–{hhmm(termin.end_time)} Uhr · {termin.location}
          </div>
        </div>

        <div className={styles.grid}>
          {groups.map((g, i) => (
            <div key={i} className={styles.column}>
              <div className={styles.columnHead}>
                <span className={styles.groupLabel}>{g.label}</span>
                {g.trainerName && <span className={styles.trainerLabel}>Trainer: {g.trainerName}</span>}
              </div>

              <div className={`${styles.slot} ${g.round === 1 ? styles.slotTraining : styles.slotPlaying}`}>
                <span className={styles.slotType}>{g.round === 1 ? "Training" : "Spielt"}</span>
                <span className={styles.slotTime}>{timeFor(1)}</span>
              </div>
              <div className={`${styles.slot} ${g.round === 2 ? styles.slotTraining : styles.slotPlaying}`}>
                <span className={styles.slotType}>{g.round === 2 ? "Training" : "Spielt"}</span>
                <span className={styles.slotTime}>{timeFor(2)}</span>
              </div>

              <div className={styles.namesList}>
                {g.memberNames.map((name, j) => (
                  <div key={j} className={styles.nameRow}>
                    {name}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className={styles.legend}>
          <span className={styles.legendItem}>
            <span className={`${styles.legendSwatch} ${styles.slotTraining}`} /> Training (mit Trainer)
          </span>
          <span className={styles.legendItem}>
            <span className={`${styles.legendSwatch} ${styles.slotPlaying}`} /> Spielt
          </span>
        </div>

        <div className={styles.footer}>The Padellers Essen</div>
      </div>
    );
  },
);
