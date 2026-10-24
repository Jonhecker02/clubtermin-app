"use client";

import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import styles from "./LegalPage.module.css";

// Shared frame for the public legal pages. The "Zurück" button matters inside
// the iOS app, where there is no browser chrome to go back with.
export function LegalPage({ title, updated, children }: { title: string; updated?: string; children: React.ReactNode }) {
  const router = useRouter();
  return (
    <div className={styles.page}>
      <div className={styles.top}>
        <button
          type="button"
          className={styles.back}
          onClick={() => (window.history.length > 1 ? router.back() : router.push("/"))}
        >
          <ChevronLeft size={18} strokeWidth={2.4} /> Zurück
        </button>
      </div>
      <div className={styles.wordmark}>ClubTermine</div>
      <div className={styles.tagline}>{title}</div>

      <div className={styles.card}>
        <h1 className={styles.title}>{title}</h1>
        {updated && <p className={styles.updated}>Stand: {updated}</p>}
        {children}
      </div>
    </div>
  );
}

export function LegalSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className={styles.section}>
      <h2>{title}</h2>
      {children}
    </div>
  );
}
