"use client";

import { useMemo, useState } from "react";
import { AppHeader } from "@/components/layout/AppHeader";
import { PageBody } from "@/components/layout/PageBody";
import { Button } from "@/components/ui/Button";
import { AdminTabs } from "@/components/admin/AdminTabs";
import { useProfile } from "@/lib/queries/useProfile";
import { useProfiles } from "@/lib/queries/useProfiles";
import { useGroups } from "@/lib/queries/useGroups";
import { useAttendanceStats } from "@/lib/queries/useAttendanceStats";
import { groupLabel } from "@/lib/domain";
import adminStyles from "@/components/admin/AdminList.module.css";
import styles from "./page.module.css";

type SortMode = "quote" | "name";

export default function AdminStatistikPage() {
  const { data: profile } = useProfile();
  const { data: profiles = [] } = useProfiles();
  const { data: groups = [] } = useGroups();
  const { data: stats = [] } = useAttendanceStats();
  const [sortMode, setSortMode] = useState<SortMode>("quote");

  const statsByUser = useMemo(() => new Map(stats.map((s) => [s.user_id, s])), [stats]);

  const rows = useMemo(() => {
    const withStats = profiles
      .filter((p) => p.status === "approved" && p.group_id)
      .map((p) => {
        const s = statsByUser.get(p.id);
        const totalTrainings = s?.total_trainings ?? 0;
        const registeredCount = s?.registered_count ?? 0;
        const confirmedCount = s?.confirmed_count ?? 0;
        const attendanceQuote = totalTrainings > 0 ? confirmedCount / totalTrainings : null;
        const registrationQuote = totalTrainings > 0 ? registeredCount / totalTrainings : null;
        return { profile: p, totalTrainings, registeredCount, confirmedCount, attendanceQuote, registrationQuote };
      });

    return withStats.sort((a, b) => {
      if (sortMode === "name") return a.profile.name.localeCompare(b.profile.name);
      // No history (brand-new player) sorts to the bottom rather than
      // competing with a 0% quote, which would wrongly flag them as unreliable.
      if (a.attendanceQuote === null && b.attendanceQuote === null) return a.profile.name.localeCompare(b.profile.name);
      if (a.attendanceQuote === null) return 1;
      if (b.attendanceQuote === null) return -1;
      return a.attendanceQuote - b.attendanceQuote;
    });
  }, [profiles, statsByUser, sortMode]);

  return (
    <>
      <AppHeader title="Statistik" />
      <PageBody>
        <AdminTabs current="statistik" isOwner={profile?.role === "owner"} />

        <div className={adminStyles.countRow}>
          <span className={adminStyles.count}>{rows.length} Spieler</span>
        </div>

        <div className={styles.sortRow}>
          <Button variant={sortMode === "quote" ? "accent" : "outline"} size="sm" onClick={() => setSortMode("quote")}>
            Sortiert nach Bereitschaft
          </Button>
          <Button variant={sortMode === "name" ? "accent" : "outline"} size="sm" onClick={() => setSortMode("name")}>
            Sortiert nach Name
          </Button>
        </div>

        <div className={adminStyles.list}>
          {rows.map((row) => {
            const group = groups.find((g) => g.id === row.profile.group_id);
            const lowQuote = row.attendanceQuote !== null && row.attendanceQuote < 0.5;
            return (
              <div key={row.profile.id} className={styles.card}>
                <div className={styles.info}>
                  <span className={styles.name}>{row.profile.name}</span>
                  <span className={styles.meta}>{group ? groupLabel(group) : "—"}</span>
                </div>
                <div className={styles.stats}>
                  {row.totalTrainings > 0 ? (
                    <>
                      <span className={[styles.quote, lowQuote ? styles.quoteLow : ""].join(" ")}>
                        {Math.round(row.attendanceQuote! * 100)}%
                      </span>
                      <span className={styles.count}>
                        {row.confirmedCount}/{row.totalTrainings} dabei · Anmeldequote {Math.round(row.registrationQuote! * 100)}%
                      </span>
                    </>
                  ) : (
                    <span className={styles.count}>Noch keine Trainings</span>
                  )}
                </div>
              </div>
            );
          })}
          {rows.length === 0 && <div className={adminStyles.empty}>Noch keine Spieler mit Gruppe.</div>}
        </div>
      </PageBody>
    </>
  );
}
