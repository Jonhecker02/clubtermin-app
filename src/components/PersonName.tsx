"use client";

import { usePersonalDetails } from "@/lib/queries/usePersonalDetails";
import { ageOf } from "@/lib/domain";
import styles from "./PersonName.module.css";

// A person's name with their age right behind it — always together,
// wherever admins and trainers see a player. Players never see the date (the
// data isn't even fetched for them), and anything that is exported or shared
// (WhatsApp texts, images) uses plain names instead.
export function PersonName({ name, userId, className }: { name: string; userId?: string | null; className?: string }) {
  const { data: details } = usePersonalDetails();
  const iso = userId && details ? details[userId]?.birth_date : undefined;
  return (
    <span className={className}>
      {name}
      {details && userId && (
        <span className={`${styles.birth} ${iso ? "" : styles.missing}`}>{iso ? `${ageOf(iso)} J.` : "Alter ?"}</span>
      )}
    </span>
  );
}
