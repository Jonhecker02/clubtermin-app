"use client";

import { useMemo, useState } from "react";
import { AppHeader } from "@/components/layout/AppHeader";
import { PageBody } from "@/components/layout/PageBody";
import { Input, Select } from "@/components/ui/Input";
import { Tabs } from "@/components/ui/Tabs";
import { AdminTabs } from "@/components/admin/AdminTabs";
import { PersonName } from "@/components/PersonName";
import { useProfiles } from "@/lib/queries/useProfiles";
import { useGroups } from "@/lib/queries/useGroups";
import { useTermine } from "@/lib/queries/useTermine";
import { useRegistrationHistory } from "@/lib/queries/useRegistrationHistory";
import { useTrainerStats } from "@/lib/queries/useTrainerStats";
import { useNow } from "@/lib/useNow";
import { computeParticipation, TIER_LABELS, type Outcome, type PlayerParticipation, type Tier } from "@/lib/participation";
import { dateLabel, groupLabel } from "@/lib/domain";
import type { Termin } from "@/types/database";
import adminStyles from "@/components/admin/AdminList.module.css";
import styles from "./page.module.css";

const PERIODS = [
  { id: "28", label: "4 Wochen" },
  { id: "90", label: "3 Monate" },
  { id: "180", label: "6 Monate" },
  { id: "365", label: "12 Monate" },
];

const SORTS = [
  { id: "quote_asc", label: "Selten zuerst" },
  { id: "quote_desc", label: "Zuverlässig zuerst" },
  { id: "confirmed_desc", label: "Meiste Teilnahmen" },
  { id: "confirmed_asc", label: "Wenigste Teilnahmen" },
  { id: "registered_desc", label: "Meiste Anmeldungen" },
  { id: "registered_asc", label: "Wenigste Anmeldungen" },
  { id: "last_asc", label: "Länger nicht dabei" },
  { id: "name", label: "Name" },
] as const;
type SortId = (typeof SORTS)[number]["id"];

const OUTCOME_LABEL: Record<Outcome, string> = { dabei: "dabei", warteliste: "Warteliste", nicht: "nicht angemeldet" };

function percent(rate: number | null): string {
  return rate === null ? "–" : `${Math.round(rate * 100)} %`;
}

function sortRows(rows: PlayerParticipation[], sort: SortId): PlayerParticipation[] {
  const byName = (a: PlayerParticipation, b: PlayerParticipation) => a.name.localeCompare(b.name);
  // Players without any possible termin (brand new) always sink to the bottom.
  const withNulls = (value: (r: PlayerParticipation) => number | null, dir: 1 | -1) => (a: PlayerParticipation, b: PlayerParticipation) => {
    const va = value(a);
    const vb = value(b);
    if (va === null && vb === null) return byName(a, b);
    if (va === null) return 1;
    if (vb === null) return -1;
    return (va - vb) * dir || byName(a, b);
  };
  const sorted = [...rows];
  switch (sort) {
    case "quote_asc":
      return sorted.sort(withNulls((r) => r.confirmedRate, 1));
    case "quote_desc":
      return sorted.sort(withNulls((r) => r.confirmedRate, -1));
    case "confirmed_desc":
      return sorted.sort((a, b) => b.confirmed - a.confirmed || byName(a, b));
    case "confirmed_asc":
      return sorted.sort((a, b) => a.confirmed - b.confirmed || byName(a, b));
    case "registered_desc":
      return sorted.sort((a, b) => b.registered - a.registered || byName(a, b));
    case "registered_asc":
      return sorted.sort((a, b) => a.registered - b.registered || byName(a, b));
    case "last_asc":
      // never confirmed first, then the longest ago
      return sorted.sort((a, b) => (a.lastConfirmed ?? "").localeCompare(b.lastConfirmed ?? "") || byName(a, b));
    default:
      return sorted.sort(byName);
  }
}

function PlayerCard({
  row,
  groupName,
  trainers,
}: {
  row: PlayerParticipation;
  groupName: string;
  trainers: { trainer_name: string; session_count: number }[];
}) {
  const [open, setOpen] = useState(false);
  const total = row.eligible;
  const confirmedPct = total > 0 ? (row.confirmed / total) * 100 : 0;
  const waitPct = total > 0 ? (row.waitlist / total) * 100 : 0;
  // Last 10 possible termine, oldest on the left, newest on the right.
  const dots = row.history.slice(0, 10).reverse();

  return (
    <div className={styles.card}>
      <button type="button" className={styles.cardMain} onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <div className={styles.cardTop}>
          <div className={styles.who}>
            <PersonName className={styles.name} name={row.name} userId={row.userId} />
            <span className={styles.meta}>
              {groupName}
              {row.lastConfirmed ? ` · zuletzt dabei ${dateLabel(row.lastConfirmed)}` : total > 0 ? " · noch nie dabei" : ""}
            </span>
          </div>
          <div className={styles.big}>
            {total > 0 ? (
              <>
                <span className={styles.bigNum}>
                  {row.confirmed}
                  <span className={styles.bigOf}>/{total}</span>
                </span>
                <span className={styles.bigLabel}>{percent(row.confirmedRate)} dabei</span>
              </>
            ) : (
              <span className={styles.bigLabel}>Noch keine Termine</span>
            )}
          </div>
        </div>

        {total > 0 && (
          <>
            <div className={styles.bar} aria-hidden="true">
              <span className={styles.barConfirmed} style={{ width: `${confirmedPct}%` }} />
              <span className={styles.barWait} style={{ width: `${waitPct}%` }} />
            </div>
            <div className={styles.cardBottom}>
              <span className={styles.facts}>
                {row.registered}× angemeldet · {row.confirmed}× dabei
                {row.waitlist > 0 ? ` · ${row.waitlist}× Warteliste` : ""}
              </span>
              <span className={`${styles.tier} ${styles[`tier_${row.tier}`]}`}>{TIER_LABELS[row.tier]}</span>
            </div>
            <div className={styles.dots} aria-hidden="true">
              {dots.map((h) => (
                <span key={h.terminId} className={`${styles.dot} ${styles[`dot_${h.outcome}`]}`} />
              ))}
            </div>
          </>
        )}
      </button>

      {open && total > 0 && (
        <div className={styles.detail}>
          <div className={styles.detailTitle}>Verlauf (neueste zuerst)</div>
          <ul className={styles.history}>
            {row.history.slice(0, 15).map((h) => (
              <li key={h.terminId} className={styles.historyRow}>
                <span className={`${styles.dot} ${styles[`dot_${h.outcome}`]}`} />
                <span className={styles.historyDate}>{dateLabel(h.date)}</span>
                <span className={styles.historyTitle}>{h.title}</span>
                <span className={styles.historyOutcome}>{OUTCOME_LABEL[h.outcome]}</span>
              </li>
            ))}
          </ul>
          {row.history.length > 15 && <div className={styles.detailNote}>… und {row.history.length - 15} ältere Termine</div>}
          {trainers.length > 0 && (
            <div className={styles.detailNote}>
              Trainings bei: {trainers.map((b) => `${b.trainer_name} ${b.session_count}×`).join(" · ")}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Who joins how often, who registers how often, who is rarely there — for
// owner and trainers. Everything is computed on the device from the termine
// and registrations the admin may read anyway.
export default function AdminTeilnahmePage() {
  const now = useNow(5 * 60_000);
  const { data: profiles = [] } = useProfiles();
  const { data: groups = [] } = useGroups();
  const { data: termine = [] } = useTermine();
  const { data: history = [], isPending } = useRegistrationHistory();
  const { data: trainerStats = [] } = useTrainerStats();

  const [period, setPeriod] = useState("90");
  const [kind, setKind] = useState<"training" | "alle">("training");
  const [groupId, setGroupId] = useState("alle");
  const [tier, setTier] = useState<"alle" | Tier | "nie">("alle");
  const [sort, setSort] = useState<SortId>("quote_asc");
  const [search, setSearch] = useState("");

  const sinceISO = new Date(now - Number(period) * 86400000).toISOString().slice(0, 10);
  const types: Termin["type"][] = kind === "training" ? ["training"] : ["training", "event", "spieltag"];

  const players = useMemo(
    () => profiles.filter((p) => p.status === "approved" && p.group_id && (groupId === "alle" || p.group_id === groupId)),
    [profiles, groupId],
  );

  const all = useMemo(
    () => computeParticipation({ termine, registrations: history, players, sinceISO, nowMs: now, types: kind === "training" ? ["training"] : ["training", "event", "spieltag"] }),
    [termine, history, players, sinceISO, now, kind],
  );

  const termineCount = useMemo(
    () =>
      termine.filter(
        (t) => types.includes(t.type) && t.date >= sinceISO && new Date(`${t.date}T${t.end_time}`).getTime() < now,
      ).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [termine, sinceISO, now, kind],
  );

  const counts = useMemo(() => {
    const c: Record<string, number> = { alle: all.length, selten: 0, mittel: 0, stamm: 0, neu: 0, nie: 0 };
    for (const r of all) {
      c[r.tier]++;
      if (r.eligible >= 3 && r.registered === 0) c.nie++;
    }
    return c;
  }, [all]);

  const average = useMemo(() => {
    const rated = all.filter((r) => r.confirmedRate !== null);
    return rated.length ? rated.reduce((s, r) => s + (r.confirmedRate as number), 0) / rated.length : null;
  }, [all]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = all
      .filter((r) => q === "" || r.name.toLowerCase().includes(q))
      .filter((r) => (tier === "alle" ? true : tier === "nie" ? r.eligible >= 3 && r.registered === 0 : r.tier === tier));
    return sortRows(filtered, sort);
  }, [all, search, tier, sort]);

  const trainersByUser = useMemo(() => {
    const map = new Map<string, { trainer_name: string; session_count: number }[]>();
    for (const s of trainerStats) {
      const list = map.get(s.user_id) ?? [];
      list.push({ trainer_name: s.trainer_name, session_count: s.session_count });
      map.set(s.user_id, list);
    }
    return map;
  }, [trainerStats]);

  const tierItems = [
    { id: "alle", label: `Alle (${counts.alle})` },
    { id: "selten", label: `Selten (${counts.selten})` },
    { id: "mittel", label: `Gelegentlich (${counts.mittel})` },
    { id: "stamm", label: `Stamm (${counts.stamm})` },
    { id: "neu", label: `Neu (${counts.neu})` },
    { id: "nie", label: `Nie angemeldet (${counts.nie})` },
  ];

  return (
    <>
      <AppHeader title="Teilnahme" />
      <PageBody>
        <AdminTabs current="statistik" />

        <div className={styles.summary}>
          <div className={styles.sumCard}>
            <span className={styles.sumNum}>{termineCount}</span>
            <span className={styles.sumLabel}>Termine</span>
          </div>
          <div className={styles.sumCard}>
            <span className={styles.sumNum}>{percent(average)}</span>
            <span className={styles.sumLabel}>Ø dabei</span>
          </div>
          <button type="button" className={`${styles.sumCard} ${styles.sumAlert}`} onClick={() => setTier("selten")}>
            <span className={styles.sumNum}>{counts.selten}</span>
            <span className={styles.sumLabel}>Selten dabei</span>
          </button>
        </div>

        <Tabs items={PERIODS} value={period} onChange={setPeriod} size="sm" style={{ marginBottom: 10 }} />
        <Tabs
          items={[
            { id: "training", label: "Nur Trainings" },
            { id: "alle", label: "Alle Termine" },
          ]}
          value={kind}
          onChange={(id) => setKind(id as "training" | "alle")}
          size="sm"
          style={{ marginBottom: 12 }}
        />

        <div className={styles.filters}>
          <Select label="Gruppe" value={groupId} onChange={(e) => setGroupId(e.target.value)}>
            <option value="alle">Alle Gruppen</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {groupLabel(g)}
              </option>
            ))}
          </Select>
          <Select label="Sortieren nach" value={sort} onChange={(e) => setSort(e.target.value as SortId)}>
            {SORTS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </Select>
        </div>

        <Input placeholder="Spieler suchen…" value={search} onChange={(e) => setSearch(e.target.value)} className={styles.search} />
        <Tabs items={tierItems} value={tier} onChange={(id) => setTier(id as typeof tier)} size="sm" scrollable style={{ marginBottom: 12 }} />

        <div className={styles.legend}>
          <span><span className={`${styles.dot} ${styles.dot_dabei}`} /> dabei</span>
          <span><span className={`${styles.dot} ${styles.dot_warteliste}`} /> Warteliste</span>
          <span><span className={`${styles.dot} ${styles.dot_nicht}`} /> nicht angemeldet</span>
        </div>

        <div className={adminStyles.list}>
          {isPending && <div className={adminStyles.empty}>Lädt…</div>}
          {rows.map((row) => (
            <PlayerCard
              key={row.userId}
              row={row}
              groupName={(() => {
                const g = groups.find((x) => x.id === row.groupId);
                return g ? groupLabel(g) : "—";
              })()}
              trainers={trainersByUser.get(row.userId) ?? []}
            />
          ))}
          {!isPending && rows.length === 0 && <div className={adminStyles.empty}>Keine Spieler für diese Auswahl.</div>}
        </div>

        <p className={styles.note}>
          „Dabei“ heißt: ein bestätigter Platz bei einem vergangenen Termin — nicht, ob die Person wirklich da war.
          Gezählt werden nur Termine, für die der Spieler zugelassen war und die nach seinem Beitritt stattfanden.
          Abmeldungen werden nicht gespeichert, sie tauchen hier also als „nicht angemeldet“ auf. Stammspieler: ab 60 %
          dabei, gelegentlich: 30–59 %, selten: unter 30 % (mindestens 3 mögliche Termine).
        </p>
      </PageBody>
    </>
  );
}
