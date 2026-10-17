"use client";

import { Check } from "lucide-react";
import { COURT_COUNT, formatCourts } from "@/lib/domain";
import { haptic } from "@/lib/haptics";
import styles from "./CourtPicker.module.css";

interface CourtPickerProps {
  value: number[];
  onChange: (next: number[]) => void;
}

// The club's seven courts as tap-to-toggle tiles: ticked = trained on.
export function CourtPicker({ value, onChange }: CourtPickerProps) {
  function toggle(n: number) {
    haptic("light");
    onChange(value.includes(n) ? value.filter((c) => c !== n) : [...value, n].sort((a, b) => a - b));
  }

  const courts = Array.from({ length: COURT_COUNT }, (_, i) => i + 1);

  return (
    <div className={styles.field}>
      <div className={styles.header}>
        <span className={styles.label}>Courts</span>
        <span className={styles.actions}>
          <button type="button" className={styles.link} onClick={() => onChange(courts)}>
            Alle
          </button>
          <button type="button" className={styles.link} onClick={() => onChange([])} disabled={value.length === 0}>
            Keine
          </button>
        </span>
      </div>
      <div className={styles.grid} role="group" aria-label="Courts auswählen">
        {courts.map((n) => {
          const on = value.includes(n);
          return (
            <button
              key={n}
              type="button"
              role="checkbox"
              aria-checked={on}
              aria-label={`Court ${n}`}
              className={`${styles.tile} ${on ? styles.tileOn : ""}`}
              onClick={() => toggle(n)}
            >
              <span className={styles.number}>{n}</span>
              <span className={styles.check} aria-hidden="true">
                {on && <Check size={13} strokeWidth={3.2} />}
              </span>
            </button>
          );
        })}
      </div>
      <div className={styles.summary}>{value.length > 0 ? `Gebucht: ${formatCourts(value)}` : "Tippe die Courts an, auf denen trainiert wird."}</div>
    </div>
  );
}
