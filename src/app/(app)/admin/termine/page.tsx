"use client";

import { Suspense, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { useRouter } from "@/lib/useGuardedRouter";
import { Plus } from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";
import { PageBody } from "@/components/layout/PageBody";
import { IconButton } from "@/components/ui/IconButton";
import { EventRow } from "@/components/ui/EventRow";
import { SkeletonEventList } from "@/components/ui/Skeleton";
import { LiveBanner } from "@/components/admin/LiveBanner";
import { SwipeRow } from "@/components/ui/SwipeRow";
import { Switch } from "@/components/ui/Switch";
import { Tabs } from "@/components/ui/Tabs";
import { AdminTabs } from "@/components/admin/AdminTabs";
import { useTermine } from "@/lib/queries/useTermine";
import { useGroups } from "@/lib/queries/useGroups";
import { TRAINER_SCOPE_ITEMS, useTrainerTermineFilter } from "@/lib/queries/useTrainerGroups";
import { useRegistrationCounts } from "@/lib/queries/useRegistrations";
import { queryKeys } from "@/lib/queries/keys";
import { createClient } from "@/lib/supabase/client";
import {
  dateLabel,
  formatPrice,
  groupShortCode,
  hhmm,
  isRegistrationOpen,
  isTerminRunning,
  isUpcoming,
  registrationMeta,
  registrationOpensLabel,
  weekdayLabel,
  withShortCode,
} from "@/lib/domain";
import type { Termin } from "@/types/database";
import styles from "@/components/admin/AdminList.module.css";
import { useNow } from "@/lib/useNow";

const TIME_ITEMS = [
  { id: "kommend", label: "Kommend" },
  { id: "vergangen", label: "Vergangen" },
];

// Stable reference for the loading state — an inline `= []` default creates
// a brand-new array every render, which the prevTermine reference-check
// below would treat as "data changed" on every single render (infinite
// render loop) for as long as the query is still loading.
const EMPTY_TERMINE: Termin[] = [];

function CreatedNotice() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const created = searchParams.get("created");
  if (!created) return null;

  return (
    <div className={styles.notice}>
      <span className={styles.noticeText}>
        &quot;{created}&quot; wurde erstellt.
        {searchParams.get("notified") === "1"
          ? " Push-Benachrichtigung an die berechtigten Teilnehmer wurde verschickt."
          : ""}
      </span>
      <button
        type="button"
        className={styles.noticeClose}
        onClick={() => router.replace("/admin/termine")}
        aria-label="Schließen"
      >
        ×
      </button>
    </div>
  );
}

export default function AdminTerminePage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: allTermine = EMPTY_TERMINE, isPending: isLoading } = useTermine();
  const trainerFilter = useTrainerTermineFilter();
  const { apply: applyTrainerScope } = trainerFilter;
  const termine = useMemo(() => applyTrainerScope(allTermine), [applyTrainerScope, allTermine]);
  const { data: groups = [] } = useGroups();
  const { data: counts = {} } = useRegistrationCounts();
  const [timeFilter, setTimeFilter] = useState<"kommend" | "vergangen">("kommend");
  const [openId, setOpenId] = useState<string | null>(null);

  // Whenever the underlying list refetches (after create/edit/delete), close
  // any swiped-open row rather than risk it staying stuck open against
  // content that's since shifted or changed. Adjusting state during render
  // (React's documented pattern for "reset on prop/data change") instead of
  // an effect, so it takes effect on the same render as the new data.
  const [prevTermine, setPrevTermine] = useState(termine);
  if (termine !== prevTermine) {
    setPrevTermine(termine);
    setOpenId(null);
  }

  const tick = useNow(60_000);
  const filtered = useMemo(() => {
    const base = termine.filter((t) => (timeFilter === "kommend" ? isUpcoming(t) : !isUpcoming(t)));
    return timeFilter === "vergangen" ? [...base].reverse() : base;
    // tick: the clock moving on is what changes the result
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [termine, timeFilter, tick]);

  async function deleteTermin(id: string) {
    const supabase = createClient();
    await supabase.from("termine").delete().eq("id", id);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.termine }),
      queryClient.invalidateQueries({ queryKey: queryKeys.registrationCounts }),
    ]);
  }

  return (
    <>
      <AppHeader
        title="Admin"
        right={<Switch checked onChange={() => router.push("/termine")} label="Admin" onDark />}
      />
      <PageBody>
        <AdminTabs current="termine" />

        <LiveBanner termine={termine} />

        <Suspense fallback={null}>
          <CreatedNotice />
        </Suspense>

        {trainerFilter.scoped && (
          <Tabs
            items={TRAINER_SCOPE_ITEMS}
            value={trainerFilter.mode}
            onChange={(id) => trainerFilter.setMode(id as "meine" | "alle")}
            size="sm"
            style={{ marginBottom: 10 }}
          />
        )}

        <Tabs
          items={TIME_ITEMS}
          value={timeFilter}
          onChange={(id) => {
            setTimeFilter(id as "kommend" | "vergangen");
            setOpenId(null);
          }}
          size="sm"
          style={{ marginBottom: 14 }}
        />

        <div className={styles.countRow}>
          <span className={styles.count}>{filtered.length} Termine</span>
          <IconButton variant="accent" label="Neuer Termin" onClick={() => router.push("/admin/termine/neu")}>
            <Plus size={20} strokeWidth={2.5} />
          </IconButton>
        </div>

        {isLoading && <SkeletonEventList />}

        <div className={styles.list}>
          {filtered.map((t) => {
            const price = formatPrice(t.price);
            return (
              <SwipeRow
                key={t.id}
                isOpen={openId === t.id}
                onOpenChange={(open) => setOpenId(open ? t.id : null)}
                onEdit={() => router.push(`/admin/termine/${t.id}/bearbeiten`)}
                onDelete={() => deleteTermin(t.id)}
              >
                <EventRow
                  weekday={weekdayLabel(t.date)}
                  dateLabel={dateLabel(t.date)}
                  title={withShortCode(t.title, groupShortCode(t.register_groups, groups))}
                  subtitle={t.type === "training" ? t.trainer : t.location}
                  time={hhmm(t.start_time)}
                  meta={`${registrationMeta(counts[t.id]?.confirmed ?? 0, counts[t.id]?.pending ?? 0, t.max_tn)}${price ? ` · ${price}` : ""}`}
                  type={t.type}
                  notice={registrationOpensLabel(t, { forAdmin: true })}
                  dimmed={!isRegistrationOpen(t)}
                  live={isTerminRunning(t)}
                  onClick={() => router.push(`/admin/termine/${t.id}`)}
                />
              </SwipeRow>
            );
          })}
          {!isLoading && filtered.length === 0 && (
            <div className={styles.empty}>
              {timeFilter === "vergangen" ? "Keine vergangenen Termine." : "Noch keine Termine angelegt."}
            </div>
          )}
        </div>
      </PageBody>
    </>
  );
}
