"use client";

import { ChevronRight } from "lucide-react";
import { useRouter } from "@/lib/useGuardedRouter";
import { useMyPersonalDetails } from "@/lib/queries/useMyPersonalDetails";
import styles from "./MissingDetailsBanner.module.css";

// Existing members registered before date of birth and gender were collected:
// ask them once to fill it in (Profil).
export function MissingDetailsBanner() {
  const router = useRouter();
  const { data } = useMyPersonalDetails();
  if (!data || (data.birth_date && data.gender)) return null;
  return (
    <button type="button" className={styles.banner} onClick={() => router.push("/profil")}>
      <span className={styles.text}>
        <span className={styles.title}>Bitte ergänze deine Angaben</span>
        <span className={styles.sub}>Geburtsdatum und Herr/Dame — für die Mannschaftsplanung (nur Trainer &amp; Admins sehen sie).</span>
      </span>
      <ChevronRight size={20} strokeWidth={2.4} />
    </button>
  );
}
