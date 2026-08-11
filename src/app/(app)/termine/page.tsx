"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus, ChevronLeft, ChevronRight, X } from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";
import { PageBody } from "@/components/layout/PageBody";
import { Tabs } from "@/components/ui/Tabs";
import { Switch } from "@/components/ui/Switch";
import { EventRow } from "@/components/ui/EventRow";
import { useProfile } from "@/lib/queries/useProfile";
import { useTermine } from "@/lib/queries/useTermine";
import { useGroups } from "@/lib/queries/useGroups";
import { useRegistrationCounts } from "@/lib/queries/useRegistrations";
import {
  badgeInfo,
  buildMonthGrid,
  dateLabel,
  formatPrice,
  groupShortCode,
  hhmm,
  isRegistrationOpen,
  isUpcoming,
  monthLabel,
  registrationOpensLabel,
  weekdayLabel,
  withShortCode,
} from "@/lib/domain";
import type { Group, Termin, TerminType } from "@/types/database";
import styles from "./page.module.css";

const FILTER_ITEMS = [
  { id: "alle", label: "Alle" },
  { id: "training", label: "Training" },
  { id: "event", label: "Event" },
  { id: "spieltag", label: "Spieltag" },
];

const TIME_ITEMS = [
  { id: "kommend", label: "Kommend" },
  { id: "vergangen", label: "Vergangen" },
];

const VIEW_ITEMS = [
  { id: "liste", label: "Liste" },
  { id: "kalender", label: "Kalender" },
];

const CAL_WEEKDAYS = ["MO", "DI", "MI", "DO", "FR", "SA", "SO"];

function toRow(t: Termin, counts: Record<string, number>, groups: Group[]) {
  const price = formatPrice(t.price);
  return {
    id: t.id,
    weekday: weekdayLabel(t.date),
    dateLabel: dateLabel(t.date),
    title: withShortCode(t.title, groupShortCode(t.register_groups, groups)),
    subtitle: t.type === "training" ? t.trainer : t.location,
    time: hhmm(t.start_time),
    meta: `${counts[t.id] ?? 0}/${t.max_tn}${price ? ` · ${price}` : ""}`,
    type: t.type,
    notice: registrationOpensLabel(t),
    dimmed: !isRegistrationOpen(t),
  };
}

export default function TerminePage() {
  const router = useRouter();
  const { data: profile } = useProfile();
  const { data: termine = [], isLoading } = useTermine();
  const { data: groups = [] } = useGroups();
  const { data: counts = {} } = useRegistrationCounts();
  const isAdmin = profile?.role === "owner" || profile?.role === "trainer" || profile?.role === "captain";

  const [filter, setFilter] = useState<"alle" | TerminType>("alle");
  const [timeFilter, setTimeFilter] = useState<"kommend" | "vergangen">("kommend");
  const [viewMode, setViewMode] = useState<"liste" | "kalender">("liste");
  const [syncHintDismissed, setSyncHintDismissed] = useState(true);
  useEffect(() => {
    // Mount-time read of an external store (localStorage) — no session data
    // to derive this from, so there's no way to compute it during render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSyncHintDismissed(localStorage.getItem("tp_calendar_sync_hint_dismissed") === "1");
  }, []);
  function dismissSyncHint() {
    localStorage.setItem("tp_calendar_sync_hint_dismissed", "1");
    setSyncHintDismissed(true);
  }
  const now = useMemo(() => new Date(), []);
  const [calYear, setCalYear] = useState(now.getFullYear());
  const [calMonth, setCalMonth] = useState(now.getMonth());
  const [calDate, setCalDate] = useState<string | null>(null);

  // Type-only filter: feeds the calendar, which stays unaffected by the
  // Kommend/Vergangen split (browsing past months should still work).
  const typeFiltered = termine.filter((t) => filter === "alle" || t.type === filter);

  const listFiltered = useMemo(() => {
    const base = typeFiltered.filter((t) => (timeFilter === "kommend" ? isUpcoming(t) : !isUpcoming(t)));
    return timeFilter === "vergangen" ? [...base].reverse() : base;
  }, [typeFiltered, timeFilter]);

  const byDate = useMemo(() => {
    const map = new Map<string, Termin[]>();
    typeFiltered.forEach((t) => {
      const list = map.get(t.date) ?? [];
      list.push(t);
      map.set(t.date, list);
    });
    return map;
  }, [typeFiltered]);

  const grid = useMemo(() => buildMonthGrid(calYear, calMonth), [calYear, calMonth]);

  function shiftMonth(delta: number) {
    let m = calMonth + delta;
    let y = calYear;
    if (m < 0) {
      m = 11;
      y -= 1;
    } else if (m > 11) {
      m = 0;
      y += 1;
    }
    setCalMonth(m);
    setCalYear(y);
    setCalDate(null);
  }

  const calendarTermine = calDate ? typeFiltered.filter((t) => t.date === calDate) : typeFiltered;

  function openTermin(id: string) {
    router.push(`/termine/${id}`);
  }

  return (
    <>
      <AppHeader
        title="Termine"
        right={
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            {isAdmin && <Switch checked={false} onChange={() => router.push("/admin/termine")} label="Admin" onDark />}
            <Tabs
              items={VIEW_ITEMS}
              value={viewMode}
              onChange={(id) => setViewMode(id as "liste" | "kalender")}
              size="sm"
              onDark
              style={{ width: "auto" }}
            />
          </div>
        }
      />
      <PageBody>
        <Tabs
          items={FILTER_ITEMS}
          value={filter}
          onChange={(id) => setFilter(id as "alle" | TerminType)}
          size="sm"
          className={styles.filterRow}
        />

        {viewMode === "liste" && (
          <Tabs
            items={TIME_ITEMS}
            value={timeFilter}
            onChange={(id) => setTimeFilter(id as "kommend" | "vergangen")}
            size="sm"
            className={styles.filterRow}
          />
        )}

        {isLoading && <div className={styles.empty}>Lädt…</div>}

        {!isLoading && viewMode === "liste" && (
          <div className={styles.list}>
            {listFiltered.map((t) => {
              const row = toRow(t, counts, groups);
              return <EventRow key={t.id} {...row} onClick={() => openTermin(t.id)} />;
            })}
            {listFiltered.length === 0 && (
              <div className={styles.empty}>
                {timeFilter === "vergangen" ? "Keine vergangenen Termine in dieser Kategorie." : "Keine Termine in dieser Kategorie."}
              </div>
            )}
          </div>
        )}

        {!isLoading && viewMode === "kalender" && (
          <>
            {!syncHintDismissed && (
              <div className={styles.syncHint}>
                <CalendarPlus size={18} strokeWidth={2} className={styles.syncHintIcon} />
                <span className={styles.syncHintText}>
                  Tipp: Du kannst deine Anmeldungen live in deinen Handy-Kalender abonnieren — unter{" "}
                  <button type="button" className={styles.syncHintLink} onClick={() => router.push("/profil")}>
                    Profil
                  </button>
                  .
                </span>
                <button type="button" className={styles.syncHintClose} onClick={dismissSyncHint} aria-label="Hinweis schließen">
                  <X size={14} strokeWidth={2.5} />
                </button>
              </div>
            )}
            <div className={styles.calCard}>
              <div className={styles.calHeader}>
                <button type="button" className={styles.calNavBtn} onClick={() => shiftMonth(-1)} aria-label="Vorheriger Monat">
                  <ChevronLeft size={18} />
                </button>
                <div className={styles.calMonthLabel}>{monthLabel(calYear, calMonth)}</div>
                <button type="button" className={styles.calNavBtn} onClick={() => shiftMonth(1)} aria-label="Nächster Monat">
                  <ChevronRight size={18} />
                </button>
              </div>
              <div className={styles.weekdayGrid}>
                {CAL_WEEKDAYS.map((wd) => (
                  <div key={wd} className={styles.weekdayCell}>
                    {wd}
                  </div>
                ))}
              </div>
              <div className={styles.dayGrid}>
                {grid.map((cell, i) => {
                  if (!cell) return <div key={`empty-${i}`} className={`${styles.dayCell} ${styles.dayCellEmpty}`} />;
                  const items = byDate.get(cell.iso) ?? [];
                  const active = calDate === cell.iso;
                  return (
                    <button
                      key={cell.iso}
                      type="button"
                      className={`${styles.dayCell} ${active ? styles.dayCellActive : ""}`}
                      onClick={() => setCalDate(active ? null : cell.iso)}
                    >
                      <span>{cell.day}</span>
                      <div className={styles.dots}>
                        {items.slice(0, 3).map((t) => (
                          <span
                            key={t.id}
                            className={styles.dot}
                            style={{
                              background:
                                badgeInfo(t.type).tone === "pink"
                                  ? "var(--tp-pink)"
                                  : badgeInfo(t.type).tone === "navy"
                                    ? "var(--tp-navy)"
                                    : "var(--tp-grey-500)",
                            }}
                          />
                        ))}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {calDate && (
              <div className={styles.calSelectedRow}>
                <span className={styles.calSelectedLabel}>
                  {Number(calDate.split("-")[2])}. {monthLabel(calYear, calMonth)}
                </span>
                <button type="button" className={styles.calClear} onClick={() => setCalDate(null)}>
                  Alle anzeigen
                </button>
              </div>
            )}

            <div className={styles.list}>
              {calendarTermine.map((t) => {
                const row = toRow(t, counts, groups);
                return <EventRow key={t.id} {...row} onClick={() => openTermin(t.id)} />;
              })}
              {calendarTermine.length === 0 && <div className={styles.empty}>Keine Termine an diesem Tag.</div>}
            </div>
          </>
        )}
      </PageBody>
    </>
  );
}
