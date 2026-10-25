"use client";

import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, Check, X } from "lucide-react";
import { Input, Select } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { Tabs } from "@/components/ui/Tabs";
import { useProfiles } from "@/lib/queries/useProfiles";
import { useSpieltagData } from "@/lib/queries/useSpieltag";
import { queryKeys } from "@/lib/queries/keys";
import { createClient } from "@/lib/supabase/client";
import { useUnsavedChanges } from "@/lib/useUnsavedChanges";
import { OUTCOME_LABEL, cleanSets, gameResult, matchScore, spieltagScore } from "@/lib/spieltag";
import type { Profile, SpieltagGame, SpieltagMatch } from "@/types/database";
import styles from "./SpieltagResultsEditor.module.css";

const SET_ROWS = 3;
const GAME_COUNT_ITEMS = [
  { id: "1", label: "1 Spiel" },
  { id: "2", label: "2 Spiele" },
  { id: "3", label: "3 Spiele" },
  { id: "4", label: "4 Spiele" },
];

interface PlayerOption {
  id: string;
  label: string;
  group: "dabei" | "weitere";
}

// The Clubmanager's results editor for one Spieltag: add a Begegnung per
// opponent team, then enter every Spiel (our pair, the opponents, set scores).
export function SpieltagResultsEditor({
  terminId,
  participantIds,
  teamGroupIds,
}: {
  terminId: string;
  participantIds: string[];
  // The Spieltag's team(s); "all" means everybody can be picked.
  teamGroupIds: string[];
}) {
  const queryClient = useQueryClient();
  const { data } = useSpieltagData();
  const { data: profiles = [] } = useProfiles();

  const matches = useMemo(() => (data?.matches ?? []).filter((m) => m.termin_id === terminId), [data, terminId]);
  const games = useMemo(() => data?.games ?? [], [data]);

  const options = useMemo<PlayerOption[]>(() => {
    const confirmed = new Set(participantIds);
    // Anybody already entered in a Spiel stays selectable, even if they left the team since.
    const matchIds = new Set(matches.map((m) => m.id));
    const entered = new Set(
      games.filter((g) => matchIds.has(g.match_id)).flatMap((g) => [g.our_player_1, g.our_player_2]).filter((id): id is string => !!id),
    );
    const everyone = teamGroupIds.includes("all");
    return profiles
      .filter(
        (p: Profile) =>
          p.status === "approved" &&
          (everyone || confirmed.has(p.id) || entered.has(p.id) || p.is_guest || (!!p.group_id && teamGroupIds.includes(p.group_id))),
      )
      .map((p) => ({
        id: p.id,
        label: p.is_guest ? `${p.name} (Einspringer)` : p.name,
        group: confirmed.has(p.id) ? ("dabei" as const) : ("weitere" as const),
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [profiles, participantIds, teamGroupIds, matches, games]);

  const [newOpponent, setNewOpponent] = useState("");
  const [gameCount, setGameCount] = useState("3");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: queryKeys.spieltag });
  }

  async function addMatch() {
    const opponent = newOpponent.trim();
    if (opponent.length < 1) {
      setError("Bitte gib den Namen der gegnerischen Mannschaft ein.");
      return;
    }
    setAdding(true);
    setError("");
    const supabase = createClient();
    const position = matches.reduce((max, m) => Math.max(max, m.position), 0) + 1;
    const { data: match, error: matchError } = await supabase
      .from("spieltag_matches")
      .insert({ termin_id: terminId, opponent, position })
      .select("id")
      .single();
    if (matchError || !match) {
      setAdding(false);
      setError("Begegnung konnte nicht angelegt werden.");
      return;
    }
    const count = Number(gameCount);
    const { error: gamesError } = await supabase
      .from("spieltag_games")
      .insert(Array.from({ length: count }, (_, i) => ({ match_id: match.id, position: i + 1 })));
    setAdding(false);
    if (gamesError) setError("Begegnung angelegt, aber die Spiele konnten nicht angelegt werden.");
    setNewOpponent("");
    await refresh();
  }

  const total = spieltagScore(matches, games.filter((g) => matches.some((m) => m.id === g.match_id)));

  return (
    <div className={styles.wrap}>
      <div className={styles.intro}>
        Pro Begegnung (eine gegnerische Mannschaft) trägst du die einzelnen Spiele ein — z. B. drei Doppel. Spieler sehen
        die Ergebnisse in der Termin-Ansicht.
      </div>

      {total.total > 0 && (
        <div className={styles.total}>
          Gesamt: {total.us} : {total.them} Spiele
          {total.matches > 1 && ` · Begegnungen: ${total.won} Siege, ${total.drawn} Remis, ${total.lost} Niederlagen`}
        </div>
      )}

      {matches.map((m) => (
        <MatchEditor
          key={m.id}
          match={m}
          games={games.filter((g) => g.match_id === m.id)}
          options={options}
          onChanged={refresh}
        />
      ))}

      <div className={styles.addCard}>
        <div className={styles.addTitle}>Begegnung hinzufügen</div>
        <Input
          label="Gegnerische Mannschaft"
          placeholder="z. B. 4PADEL"
          value={newOpponent}
          onChange={(e) => setNewOpponent(e.target.value)}
          maxLength={80}
        />
        <div className={styles.fieldGroup}>
          <span className={styles.fieldLabel}>Anzahl Spiele</span>
          <Tabs items={GAME_COUNT_ITEMS} value={gameCount} onChange={setGameCount} size="sm" />
        </div>
        {error && <div className={styles.error}>{error}</div>}
        <Button variant="accent" full onClick={addMatch} disabled={adding}>
          <Plus size={16} strokeWidth={2.4} style={{ marginRight: 4 }} />
          Begegnung anlegen
        </Button>
      </div>
    </div>
  );
}

function MatchEditor({
  match,
  games,
  options,
  onChanged,
}: {
  match: SpieltagMatch;
  games: SpieltagGame[];
  options: PlayerOption[];
  onChanged: () => Promise<void>;
}) {
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(match.opponent);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState("");
  const score = matchScore(games);

  async function rename() {
    const opponent = name.trim();
    if (!opponent) return;
    const supabase = createClient();
    const { error: updateError } = await supabase.from("spieltag_matches").update({ opponent }).eq("id", match.id);
    if (updateError) {
      setError("Umbenennen fehlgeschlagen.");
      return;
    }
    setRenaming(false);
    await onChanged();
  }

  async function removeMatch() {
    const supabase = createClient();
    const { error: deleteError } = await supabase.from("spieltag_matches").delete().eq("id", match.id);
    if (deleteError) {
      setError("Löschen fehlgeschlagen.");
      return;
    }
    await onChanged();
  }

  async function addGame() {
    const supabase = createClient();
    const position = games.reduce((max, g) => Math.max(max, g.position), 0) + 1;
    const { error: insertError } = await supabase.from("spieltag_games").insert({ match_id: match.id, position });
    if (insertError) setError("Spiel konnte nicht angelegt werden.");
    await onChanged();
  }

  return (
    <div className={styles.match}>
      <div className={styles.matchHead}>
        {renaming ? (
          <div className={styles.renameRow}>
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} aria-label="Gegnerische Mannschaft" />
            <IconButton variant="accent" size="sm" label="Speichern" onClick={rename}>
              <Check size={16} strokeWidth={2.6} />
            </IconButton>
            <IconButton
              variant="soft"
              size="sm"
              label="Abbrechen"
              onClick={() => {
                setRenaming(false);
                setName(match.opponent);
              }}
            >
              <X size={16} strokeWidth={2.4} />
            </IconButton>
          </div>
        ) : (
          <>
            <div className={styles.opponent}>
              <span className={styles.vs}>gegen</span> {match.opponent}
            </div>
            {games.length > 0 && (
              <div className={styles.score}>
                {score.us} : {score.them}
                {score.outcome && <span className={`${styles.pill} ${styles[score.outcome]}`}>{OUTCOME_LABEL[score.outcome]}</span>}
              </div>
            )}
            <IconButton variant="ghost" size="sm" label="Umbenennen" onClick={() => setRenaming(true)}>
              <Pencil size={14} strokeWidth={2} />
            </IconButton>
          </>
        )}
      </div>

      {games.map((g, i) => (
        <GameEditor key={g.id} game={g} index={i + 1} options={options} onChanged={onChanged} />
      ))}

      {error && <div className={styles.error}>{error}</div>}
      <div className={styles.matchActions}>
        <Button variant="outline" size="sm" onClick={addGame}>
          <Plus size={14} strokeWidth={2.4} style={{ marginRight: 4 }} />
          Spiel hinzufügen
        </Button>
        {confirmDelete ? (
          <>
            <Button variant="primary" size="sm" onClick={removeMatch}>
              Wirklich löschen
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>
              Abbrechen
            </Button>
          </>
        ) : (
          <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(true)}>
            <Trash2 size={14} strokeWidth={2.2} style={{ marginRight: 4 }} />
            Begegnung löschen
          </Button>
        )}
      </div>
    </div>
  );
}

function setRowsOf(g: SpieltagGame): { us: string; them: string }[] {
  return Array.from({ length: SET_ROWS }, (_, i) => ({
    us: g.sets[i] ? String(g.sets[i][0]) : "",
    them: g.sets[i] ? String(g.sets[i][1]) : "",
  }));
}

function GameEditor({
  game,
  index,
  options,
  onChanged,
}: {
  game: SpieltagGame;
  index: number;
  options: PlayerOption[];
  onChanged: () => Promise<void>;
}) {
  const [p1, setP1] = useState(game.our_player_1 ?? "");
  const [p2, setP2] = useState(game.our_player_2 ?? "");
  const [o1, setO1] = useState(game.opp_player_1);
  const [o2, setO2] = useState(game.opp_player_2);
  const [rows, setRows] = useState(() => setRowsOf(game));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [savedAt, setSavedAt] = useState(0);

  const baseline = JSON.stringify([game.our_player_1 ?? "", game.our_player_2 ?? "", game.opp_player_1, game.opp_player_2, setRowsOf(game)]);
  const current = JSON.stringify([p1, p2, o1, o2, rows]);
  const dirty = baseline !== current;
  useUnsavedChanges(dirty);

  const parsed = cleanSets(rows);
  const live = parsed ? gameResult(parsed) : null;

  async function save() {
    if (!parsed) {
      setError("Bitte gib die Satzergebnisse als ganze Zahlen ein (z. B. 6 : 3).");
      return;
    }
    if (p1 && p1 === p2) {
      setError("Bitte wähle zwei verschiedene Spieler.");
      return;
    }
    setSaving(true);
    setError("");
    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("spieltag_games")
      .update({
        our_player_1: p1 || null,
        our_player_2: p2 || null,
        opp_player_1: o1.trim(),
        opp_player_2: o2.trim(),
        sets: parsed,
      })
      .eq("id", game.id);
    setSaving(false);
    if (updateError) {
      setError("Speichern fehlgeschlagen.");
      return;
    }
    setSavedAt(Date.now());
    await onChanged();
  }

  async function remove() {
    const supabase = createClient();
    await supabase.from("spieltag_games").delete().eq("id", game.id);
    await onChanged();
  }

  const playerSelect = (label: string, value: string, set: (v: string) => void) => (
    <Select label={label} value={value} onChange={(e) => set(e.target.value)}>
      <option value="">— offen —</option>
      <optgroup label="Beim Spieltag angemeldet">
        {options.filter((o) => o.group === "dabei").map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </optgroup>
      <optgroup label="Weitere Spieler">
        {options.filter((o) => o.group === "weitere").map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </optgroup>
    </Select>
  );

  return (
    <div className={styles.game}>
      <div className={styles.gameHead}>
        <span className={styles.gameTitle}>Spiel {index}</span>
        {live && live.winner && (
          <span className={`${styles.pill} ${styles[live.winner === "us" ? "win" : "loss"]}`}>
            {live.winner === "us" ? "Gewonnen" : "Verloren"} · {live.setsUs}:{live.setsThem} Sätze
          </span>
        )}
        <IconButton variant="ghost" size="sm" label={`Spiel ${index} löschen`} onClick={remove} style={{ marginLeft: "auto" }}>
          <Trash2 size={14} strokeWidth={2} />
        </IconButton>
      </div>

      <div className={styles.pairGrid}>
        {playerSelect("Unser Spieler 1", p1, setP1)}
        {playerSelect("Unser Spieler 2", p2, setP2)}
        <Input label="Gegner 1" value={o1} onChange={(e) => setO1(e.target.value)} maxLength={80} autoCapitalize="words" />
        <Input label="Gegner 2" value={o2} onChange={(e) => setO2(e.target.value)} maxLength={80} autoCapitalize="words" />
      </div>

      <div className={styles.setsBlock}>
        <span className={styles.fieldLabel}>Sätze (unsere Spiele : Gegner)</span>
        {rows.map((r, i) => (
          <div key={i} className={styles.setRow}>
            <span className={styles.setNo}>Satz {i + 1}{i === 2 ? " / Tiebreak" : ""}</span>
            <input
              className={styles.setInput}
              inputMode="numeric"
              pattern="[0-9]*"
              aria-label={`Satz ${i + 1} unsere Spiele`}
              value={r.us}
              onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, us: e.target.value.replace(/\D/g, "").slice(0, 2) } : x)))}
            />
            <span className={styles.colon}>:</span>
            <input
              className={styles.setInput}
              inputMode="numeric"
              pattern="[0-9]*"
              aria-label={`Satz ${i + 1} Gegner`}
              value={r.them}
              onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, them: e.target.value.replace(/\D/g, "").slice(0, 2) } : x)))}
            />
          </div>
        ))}
      </div>

      {error && <div className={styles.error}>{error}</div>}
      <Button variant={dirty ? "accent" : "outline"} size="sm" full onClick={save} disabled={saving || !dirty}>
        {!dirty && savedAt ? "Gespeichert ✓" : "Spiel speichern"}
      </Button>
    </div>
  );
}
