"use client";

import styles from "./Switch.module.css";

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  onDark?: boolean;
}

export function Switch({ checked, onChange, label, onDark = false }: SwitchProps) {
  return (
    <button
      type="button"
      className={[styles.wrap, onDark ? styles.onDark : ""].join(" ")}
      onClick={() => onChange(!checked)}
    >
      <span className={styles.label}>{label}</span>
      <span role="switch" aria-checked={checked} className={[styles.track, checked ? styles.trackOn : ""].join(" ")}>
        <span className={styles.thumb} />
      </span>
    </button>
  );
}
