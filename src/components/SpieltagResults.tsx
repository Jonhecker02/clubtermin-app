"use client";

import { useMemo } from "react";
import { useSpieltagData, usePlayerNames } from "@/lib/queries/useSpieltag";
import { OUTCOME_LABEL, gameResult, matchScore, setsText, spieltagScore } from "@/lib/spieltag";
import styles from "./SpieltagResults.module.css";

// The Spieltag's results as players see them: one card per Begegnung with the
// Spiele (who played, set scores) underneath. Renders nothing until the
// Clubmanager has entered a result.
export function SpieltagResults({ terminId }: { terminId: string }) {
  const { data } = useSpieltagData();
  const matches = useMemo(() => (data?.matches ?? []).filter((m) => m.termin_id === terminId), [data, terminId]);
  const matchIds = useMemo(() => new Set(matches.map((m) => m.id)), [matches]);
  const games = useMemo(() => (data?.games ?? []).filter((g) => matchIds.has(g.match_id)), [data, matchIds]);
  const playerIds = useMemo(() => games.flatMap((g) => [g.our_player_1, g.our_player_2]).filter((id): id is string => !!id), [games]);
  const { data: names = {} } = usePlayerNames(playerIds);

  if (matches.length === 0) return null;
  const total = spieltagScore(matches, games);
  const pair = (a: string | null, b: string | null) =>
    [a, b].map((id) => (id ? (names[id] ?? "…") : "—")).join(" / ");

  return (
    <div className={styles.wrap}>
      <div className={styles.head}>
        <span className={styles.title}>Ergebnisse</span>
        {total.total > 0 && (
          <span className={styles.total}>
            {total.us} : {total.them} Spiele
          </span>
        )}
      </div>

      {matches.map((m) => {
        const mg = games.filter((g) => g.match_id === m.id);
        const score = matchScore(mg);
        return (
          <div key={m.id} className={styles.match}>
            <div className={styles.matchHead}>
              <div className={styles.opponent}>
                <span className={styles.vs}>gegen</span> {m.opponent}
              </div>
              {mg.length > 0 && (
                <div className={styles.score}>
                  <span className={styles.scoreNum}>
                    {score.us} : {score.them}
                  </span>
                  {score.outcome && <span className={`${styles.pill} ${styles[score.outcome]}`}>{OUTCOME_LABEL[score.outcome]}</span>}
                </div>
              )}
            </div>
            {mg.map((g, i) => {
              const r = gameResult(g.sets);
              const opp = [g.opp_player_1, g.opp_player_2].filter(Boolean).join(" / ");
              return (
                <div key={g.id} className={styles.game}>
                  <span className={styles.gameNo}>Spiel {i + 1}</span>
                  <div className={styles.gameBody}>
                    <div className={styles.ours}>{pair(g.our_player_1, g.our_player_2)}</div>
                    {opp && <div className={styles.theirs}>{opp}</div>}
                  </div>
                  <div className={styles.gameScore}>
                    {g.sets.length > 0 ? (
                      <>
                        <span className={`${styles.dot} ${r.winner ? styles[r.winner === "us" ? "win" : "loss"] : ""}`} aria-hidden="true" />
                        <span>{setsText(g.sets)}</span>
                      </>
                    ) : (
                      <span className={styles.open}>offen</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
