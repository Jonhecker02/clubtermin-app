"use client";

import { ChevronDown } from "lucide-react";
import styles from "./FormSection.module.css";

interface FormSectionProps {
  title: string;
  children: React.ReactNode;
  // Collapsible sections show a one-line summary while closed.
  collapsible?: boolean;
  open?: boolean;
  onToggle?: (open: boolean) => void;
  summary?: string;
}

// A titled card that groups related fields. Rarely-changed groups collapse to
// a single line so the form stays short and scannable.
export function FormSection({ title, children, collapsible = false, open = true, onToggle, summary }: FormSectionProps) {
  const expanded = !collapsible || open;
  return (
    <section className={styles.card}>
      {collapsible ? (
        <button
          type="button"
          className={styles.head}
          aria-expanded={expanded}
          onClick={() => onToggle?.(!expanded)}
        >
          <span className={styles.headText}>
            <span className={styles.title}>{title}</span>
            {!expanded && summary && <span className={styles.summary}>{summary}</span>}
          </span>
          <ChevronDown size={18} strokeWidth={2.4} className={`${styles.chevron} ${expanded ? styles.chevronOpen : ""}`} />
        </button>
      ) : (
        <div className={styles.headStatic}>
          <span className={styles.title}>{title}</span>
        </div>
      )}
      {expanded && <div className={styles.body}>{children}</div>}
    </section>
  );
}
