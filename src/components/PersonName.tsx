"use client";

import { usePersonalDetails } from "@/lib/queries/usePersonalDetails";
import { useProfiles } from "@/lib/queries/useProfiles";
import { ageOf } from "@/lib/domain";
import styles from "./PersonName.module.css";

// A person's name with their age right behind it — always together,
// wherever admins and trainers see a player. Players never see the date (the
// data isn't even fetched for them), and anything that is exported or shared
// (WhatsApp texts, images) uses plain names instead.
export function PersonName({ name, userId, className }: { name: string; userId?: string | null; className?: string }) {
  const { data: details } = usePersonalDetails();
  const { data: profiles } = useProfiles();
  const isGuest = !!userId && !!profiles?.find((p) => p.id === userId)?.is_guest;
  const iso = userId && details ? details[userId]?.birth_date : undefined;
  return (
    <span className={className}>
      {name}
      {isGuest && <span className={styles.guest}>Einspringer</span>}
      {details && userId && !isGuest && (
        <span className={`${styles.birth} ${iso ? "" : styles.missing}`}>{iso ? `${ageOf(iso)} J.` : "Alter ?"}</span>
      )}
    </span>
  );
}
