import { forwardRef } from "react";
import { courtGroupRoundRange, fullDateLabel, hhmm } from "@/lib/domain";
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

// Rendered off-screen purely as a capture target for html-to-image, same
// pattern as TerminExportCard — the "Runde 1"/"Runde 2" times shown here are
// real clock times (courtGroupRoundRange), not the abstract round numbers
// the editor's tabs use.
export const CourtGroupsExportCard = forwardRef<HTMLDivElement, CourtGroupsExportCardProps>(
  function CourtGroupsExportCard({ termin, groups }, ref) {
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
                <span className={styles.slotTime}>{courtGroupRoundRange(1, termin)}</span>
              </div>
              <div className={`${styles.slot} ${g.round === 2 ? styles.slotTraining : styles.slotPlaying}`}>
                <span className={styles.slotType}>{g.round === 2 ? "Training" : "Spielt"}</span>
                <span className={styles.slotTime}>{courtGroupRoundRange(2, termin)}</span>
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
