import { forwardRef } from "react";
import type { Termin } from "@/types/database";
import { fullDateLabel, hhmm } from "@/lib/domain";
import styles from "./TerminExportCard.module.css";

interface TerminExportCardProps {
  termin: Termin;
  shortCode: string | null;
  priceLabel: string;
  participants: string[];
  waitlist: string[];
}

// Rendered off-screen (see the admin termin page) purely as a capture target
// for html-to-image — never shown to the user directly.
export const TerminExportCard = forwardRef<HTMLDivElement, TerminExportCardProps>(function TerminExportCard(
  { termin, shortCode, priceLabel, participants, waitlist },
  ref,
) {
  return (
    <div ref={ref} className={styles.card}>
      <div className={styles.header}>
        {shortCode && <span className={styles.shortCode}>{shortCode}</span>}
        <div className={styles.title}>{termin.title}</div>
        <div className={styles.dateLine}>
          {fullDateLabel(termin.date)} · {hhmm(termin.start_time)}–{hhmm(termin.end_time)} Uhr
        </div>
      </div>

      <div className={styles.body}>
        <div className={styles.infoGrid}>
          <div className={styles.infoRow}>
            <span className={styles.infoLabel}>Ort</span>
            <span>
              {termin.location}
              {termin.courts ? `, ${termin.courts}` : ""}
            </span>
          </div>
          <div className={styles.infoRow}>
            <span className={styles.infoLabel}>Trainer</span>
            <span>{termin.trainer}</span>
          </div>
          {priceLabel && (
            <div className={styles.infoRow}>
              <span className={styles.infoLabel}>Preis</span>
              <span>{priceLabel}</span>
            </div>
          )}
        </div>

        <div className={styles.sectionTitle}>
          Teilnehmer ({participants.length}/{termin.max_tn})
        </div>
        <div className={styles.namesList}>
          {participants.map((name, i) => (
            <div key={i} className={styles.nameRow}>
              <span className={styles.nameIdx}>{i + 1}</span>
              {name}
            </div>
          ))}
          {participants.length === 0 && <div className={styles.emptyNote}>Noch keine Anmeldungen</div>}
        </div>

        {waitlist.length > 0 && (
          <>
            <div className={styles.sectionTitlePink}>Warteliste ({waitlist.length})</div>
            <div className={styles.namesList}>
              {waitlist.map((name, i) => (
                <div key={i} className={styles.nameRow}>
                  <span className={styles.nameIdxPink}>{i + 1}</span>
                  {name}
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <div className={styles.footer}>The Padellers Essen</div>
    </div>
  );
});
