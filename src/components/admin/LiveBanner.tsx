"use client";

import { ChevronRight } from "lucide-react";
import { useRouter } from "@/lib/useGuardedRouter";
import { useNow } from "@/lib/useNow";
import { hhmm, isTerminLive, liveStatusText, withShortCode, groupShortCode } from "@/lib/domain";
import { useGroups } from "@/lib/queries/useGroups";
import type { Termin } from "@/types/database";
import styles from "./LiveBanner.module.css";

// Shown to admins at the top of the Termine lists while a training is on:
// one tap to the trainer's live view (players, levels, quick notes).
export function LiveBanner({ termine }: { termine: Termin[] }) {
  const router = useRouter();
  const now = useNow(30_000);
  const { data: groups = [] } = useGroups();
  const live = termine.filter((t) => isTerminLive(t, now));
  if (live.length === 0) return null;

  return (
    <div className={styles.wrap}>
      {live.map((t) => (
        <button key={t.id} type="button" className={styles.card} onClick={() => router.push(`/admin/termine/${t.id}/live`)}>
          <span className={styles.dot} aria-hidden="true" />
          <span className={styles.text}>
            <span className={styles.eyebrow}>Live · {liveStatusText(t, now)}</span>
            <span className={styles.title}>{withShortCode(t.title, groupShortCode(t.register_groups, groups))}</span>
            <span className={styles.meta}>
              {hhmm(t.start_time)}–{hhmm(t.end_time)} Uhr · Spieler, Level & Notizen
            </span>
          </span>
          <ChevronRight size={20} strokeWidth={2.4} />
        </button>
      ))}
    </div>
  );
}
