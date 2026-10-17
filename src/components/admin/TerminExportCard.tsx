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
  // Courts actually in use (falls back to the booked ones on the termin).
  courtsLabel?: string;
}

// Rendered off-screen (see the admin termin page) purely as a capture target
// for html-to-image — never shown to the user directly.
export const TerminExportCard = forwardRef<HTMLDivElement, TerminExportCardProps>(function TerminExportCard(
  { termin, shortCode, priceLabel, participants, waitlist, courtsLabel },
  ref,
) {
  // Long lists get two columns (filled top to bottom, so 1-8 left and 9-16
  // right) — keeps the image a sensible shape in a chat instead of a very
  // tall strip, while every name stays visible.
  const freeSlots = Math.max(termin.max_tn - participants.length, 0);
  const wide = Math.max(participants.length + freeSlots, waitlist.length) > 10;
  const courts = courtsLabel ?? termin.courts;
  const listProps = (count: number) =>
    wide && count > 6
      ? { className: `${styles.namesList} ${styles.namesListTwo}`, style: { gridTemplateRows: `repeat(${Math.ceil(count / 2)}, auto)` } }
      : { className: styles.namesList };

  return (
    <div ref={ref} data-theme="light" className={`${styles.card} ${wide ? styles.cardWide : ""}`}>
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
              {courts ? `, ${courts}` : ""}
            </span>
          </div>
          {termin.session_format !== "nur_spiel" && termin.trainer && termin.trainer !== "—" && (
            <div className={styles.infoRow}>
              <span className={styles.infoLabel}>Trainer</span>
              <span>{termin.trainer}</span>
            </div>
          )}
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
        <div {...listProps(participants.length + freeSlots)}>
          {participants.map((name, i) => (
            <div key={i} className={styles.nameRow}>
              <span className={styles.nameIdx}>{i + 1}</span>
              {name}
            </div>
          ))}
          {Array.from({ length: freeSlots }, (_, i) => (
            <div key={`free-${i}`} className={`${styles.nameRow} ${styles.freeRow}`}>
              <span className={styles.nameIdx}>{participants.length + i + 1}</span>
              FREI
            </div>
          ))}
        </div>

        {waitlist.length > 0 && (
          <>
            <div className={styles.sectionTitlePink}>Warteliste ({waitlist.length})</div>
            <div {...listProps(waitlist.length)}>
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
