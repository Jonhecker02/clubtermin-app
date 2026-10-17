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
//
// Laid out as a grid with at most 4 courts per row so the image keeps a
// sensible shape and stays readable in a chat no matter how many courts
// there are — every court and every player is always fully visible, never
// cropped or squeezed into one very wide strip.
function columnsFor(courts: number): number {
  if (courts <= 4) return Math.max(courts, 1);
  if (courts <= 6) return 3;
  return 4;
}

const COLUMN_WIDTH = 232;
const GRID_GAP = 16;
const CARD_PADDING = 32;
export const CourtGroupsExportCard = forwardRef<HTMLDivElement, CourtGroupsExportCardProps>(
  function CourtGroupsExportCard({ termin, groups }, ref) {
    const cols = columnsFor(groups.length);
    const playerCount = groups.reduce((sum, g) => sum + g.memberNames.length, 0);
    return (
      <div
        ref={ref}
        data-theme="light"
        className={styles.card}
        style={{ width: Math.max(520, cols * COLUMN_WIDTH + (cols - 1) * GRID_GAP + CARD_PADDING * 2) }}
      >
        <div className={styles.header}>
          <div className={styles.eyebrow}>Trainingsgruppen</div>
          <div className={styles.title}>{termin.title}</div>
          <div className={styles.dateLine}>
            {fullDateLabel(termin.date)} · {hhmm(termin.start_time)}–{hhmm(termin.end_time)} Uhr · {termin.location}
          </div>
          <div className={styles.countLine}>
            {playerCount} Spieler · {groups.length} Court{groups.length === 1 ? "" : "s"}
          </div>
        </div>

        <div className={styles.grid} style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
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
                    <span className={styles.nameIdx}>{j + 1}</span>
                    <span className={styles.nameText}>{name}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className={styles.footer}>The Padellers Essen</div>
      </div>
    );
  },
);
