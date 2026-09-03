"use client";

import { useState } from "react";
import {
  Award,
  Calendar,
  LogIn,
  MessageCircle,
  RotateCw,
  Settings,
  Smartphone,
  Table2,
  UserCircle,
  UserCog,
  Users,
} from "lucide-react";
import styles from "./page.module.css";

type Track = "spieler" | "admin";
type Platform = "ios" | "android";

function Eyebrow({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className={styles.eyebrow}>
      <span className={styles.iconBadge}>{icon}</span>
      {label}
    </div>
  );
}

function Steps({ items }: { items: React.ReactNode[] }) {
  return (
    <ol className={styles.steps}>
      {items.map((item, i) => (
        <li key={i}>
          <span className={styles.stepNum}>{i + 1}</span>
          <span>{item}</span>
        </li>
      ))}
    </ol>
  );
}

function Callout({ mark, children }: { mark: string; children: React.ReactNode }) {
  return (
    <div className={styles.callout}>
      <span className={styles.calloutMark}>{mark}</span>
      <span>{children}</span>
    </div>
  );
}

function HomeScreenSection({ idPrefix }: { idPrefix: string }) {
  const [platform, setPlatform] = useState<Platform>("ios");
  return (
    <section className={styles.card} id={`${idPrefix}-home`}>
      <Eyebrow icon={<Smartphone size={20} strokeWidth={2} />} label="Empfohlen" />
      <h2>Zum Home-Bildschirm hinzufügen</h2>
      <p className={styles.lede}>
        Damit startet ClubTermine wie eine echte App direkt von deinem Homescreen — ohne Browser-Leiste
        drumherum. Auf dem iPhone ist das außerdem <b>Voraussetzung für Push-Benachrichtigungen</b> (z. B.
        wenn ein neues Training online geht oder du von der Warteliste nachrückst).
      </p>
      <div className={styles.platformToggle} role="tablist" aria-label="Plattform wählen">
        <button
          type="button"
          role="tab"
          aria-selected={platform === "ios"}
          className={`${styles.platformToggleBtn} ${platform === "ios" ? styles.platformToggleBtnActive : ""}`}
          onClick={() => setPlatform("ios")}
        >
          iPhone (Safari)
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={platform === "android"}
          className={`${styles.platformToggleBtn} ${platform === "android" ? styles.platformToggleBtnActive : ""}`}
          onClick={() => setPlatform("android")}
        >
          Android (Chrome)
        </button>
      </div>
      {platform === "ios" ? (
        <Steps
          items={[
            <>
              Öffne ClubTermine in <b>Safari</b> (auf dem iPhone geht das nur in Safari, nicht in Chrome oder
              Instagram).
            </>,
            <>Tippe unten auf das Teilen-Symbol (Quadrat mit Pfeil nach oben).</>,
            <>
              Scrolle im Menü nach unten und wähle <code>Zum Home-Bildschirm</code>.
            </>,
            <>
              Tippe oben rechts auf <b>„Hinzufügen“</b>.
            </>,
          ]}
        />
      ) : (
        <Steps
          items={[
            <>
              Öffne ClubTermine in <b>Chrome</b>.
            </>,
            <>
              Tippe oben rechts auf das <b>Drei-Punkte-Menü</b>.
            </>,
            <>
              Wähle <code>App installieren</code> bzw. <code>Zum Startbildschirm hinzufügen</code>.
            </>,
            <>Bestätige den Dialog.</>,
          ]}
        />
      )}
    </section>
  );
}

interface AnleitungContentProps {
  // "spieler": only the player guide exists on this URL, no switcher — for
  // the link shared with the whole team. "admin": both guides live here,
  // switchable, defaulting to Admin — for the link shared with co-admins.
  audience: "spieler" | "admin";
}

export function AnleitungContent({ audience }: AnleitungContentProps) {
  const canSwitch = audience === "admin";

  // Lazy initializer instead of an effect — this is a one-time read of the
  // URL at mount (deep-linking to #spieler on the admin page), not a
  // subscription to ongoing hash changes, so it doesn't need to run after
  // render. On the player-only page there's nothing to switch to.
  const [track, setTrack] = useState<Track>(() => {
    if (!canSwitch) return "spieler";
    return typeof window !== "undefined" && window.location.hash === "#spieler" ? "spieler" : "admin";
  });

  function selectTrack(next: Track) {
    setTrack(next);
    window.history.replaceState(null, "", `#${next}`);
  }

  return (
    <div className={styles.page}>
      <div className={styles.masthead} data-mood="pink">
        <div className={styles.wordmark}>ClubTermine</div>
        <div className={styles.tagline}>
          {canSwitch ? "Anleitung für Spieler & Admins" : "Anleitung für Spieler"}
        </div>
      </div>

      {canSwitch && (
        <div className={styles.switcherBar}>
          <div className={styles.switcher} role="tablist" aria-label="Zielgruppe wählen">
            <button
              type="button"
              role="tab"
              aria-selected={track === "spieler"}
              className={`${styles.switcherBtn} ${track === "spieler" ? styles.switcherBtnActive : ""}`}
              onClick={() => selectTrack("spieler")}
            >
              Für Spieler
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={track === "admin"}
              className={`${styles.switcherBtn} ${track === "admin" ? styles.switcherBtnActive : ""}`}
              onClick={() => selectTrack("admin")}
            >
              Für Admins
            </button>
          </div>
        </div>
      )}

      <main className={styles.main}>
        {track === "spieler" ? (
          <div role="tabpanel">
            <p className={styles.intro}>
              Diese Seite erklärt alles, was du als Spieler in ClubTermine brauchst — vom ersten Login bis
              zur Trainingsanmeldung. <b>Am besten fügst du die App zuerst zu deinem Home-Bildschirm hinzu</b>{" "}
              (Abschnitt 2), dann fühlt sie sich wie eine echte App an und du bekommst Benachrichtigungen.
            </p>

            <nav className={styles.jumpnav} aria-label="Abschnitte">
              <a href="#s-login">Login</a>
              <a href="#s-home">Home-Bildschirm</a>
              <a href="#s-termine">Termine</a>
              <a href="#s-chat">Chat</a>
              <a href="#s-profil">Profil</a>
            </nav>

            <section className={styles.card} id="s-login">
              <Eyebrow icon={<LogIn size={20} strokeWidth={2} />} label="Erste Schritte" />
              <h2>Login</h2>
              <p className={styles.lede}>
                Es gibt keine Selbstregistrierung — dein Trainer oder Clubmanager legt deinen Account für
                dich an und gibt dir <b>Vorname, Nachname und ein Passwort</b> persönlich oder per Chat
                weiter.
              </p>
              <Steps
                items={[
                  <>
                    Öffne die ClubTermine-Seite und trage <b>Vorname</b> und <b>Nachname</b> in die beiden
                    Felder ein.
                  </>,
                  <>
                    Gib dein Passwort ein und tippe auf <b>„Anmelden“</b>.
                  </>,
                ]}
              />
              <Callout mark="Passwort weg?">
                Es gibt noch keine automatische „Passwort vergessen“-Funktion. Wende dich an deinen Admin —
                er richtet dir bei Bedarf neu ein.
              </Callout>
            </section>

            <HomeScreenSection idPrefix="s" />

            <section className={styles.card} id="s-termine">
              <Eyebrow icon={<Calendar size={20} strokeWidth={2} />} label="Kernfunktion" />
              <h2>Termine</h2>
              <p className={styles.lede}>
                Der Startbildschirm nach dem Login. Hier siehst du alle Trainings, Events und Spieltage und
                meldest dich an.
              </p>
              <ul className={styles.featureList}>
                <li>
                  <span className={styles.dot} />
                  <span>
                    <b>Liste / Kalender</b> — oben rechts umschaltbar. Der Kalender zeigt pro Tag farbige
                    Punkte je nach Termin-Typ; ein Tag antippen filtert die Liste darunter.
                  </span>
                </li>
                <li>
                  <span className={styles.dot} />
                  <span>
                    <b>Filter</b> — Alle · Training · Event · Spieltag und Kommend · Vergangen.
                  </span>
                </li>
                <li>
                  <span className={styles.dot} />
                  <span>
                    <b>Anmelden / Abmelden</b> — im Termin antippen, unten den Button drücken. Ist der Termin
                    voll, landest du automatisch auf der <b>Warteliste</b> und rückst bei Absagen nach.
                  </span>
                </li>
              </ul>
              <Callout mark="Faire Rotation">
                Bei manchen Teams entscheidet nicht die Anmeldereihenfolge, sondern eine faire Rotation, wer
                teilnimmt — damit nicht immer dieselben Leute den Platz bekommen. Steht dein Training
                darunter, siehst du nach der Anmeldung „ausstehend“ mit einem Countdown bis zum
                Anmeldeschluss. Erst dann wird final zugeteilt und du bekommst Bescheid.
              </Callout>
            </section>

            <section className={styles.card} id="s-chat">
              <Eyebrow icon={<MessageCircle size={20} strokeWidth={2} />} label="Kommunikation" />
              <h2>Chat &amp; Ankündigungen</h2>
              <ul className={styles.featureList}>
                <li>
                  <span className={styles.dot} />
                  <span>
                    <b>Chat</b> — der Gruppenchat deines Teams, für alle offen.
                  </span>
                </li>
                <li>
                  <span className={styles.dot} />
                  <span>
                    <b>Ankündigungen</b> — wichtige Mitteilungen von deinem Trainer/Admin. Du liest hier mit,
                    posten können nur Admins.
                  </span>
                </li>
              </ul>
            </section>

            <section className={styles.card} id="s-profil">
              <Eyebrow icon={<UserCircle size={20} strokeWidth={2} />} label="Dein Bereich" />
              <h2>Profil</h2>
              <ul className={styles.featureList}>
                <li>
                  <span className={styles.dot} />
                  <span>
                    <b>Name ändern</b> — Stift-Symbol neben deinem Namen.
                  </span>
                </li>
                <li>
                  <span className={styles.dot} />
                  <span>
                    <b>Meine Anmeldungen</b> — alle kommenden Termine mit Status (angemeldet, Warteliste,
                    Zuteilung folgt); vergangene lassen sich einklappen.
                  </span>
                </li>
                <li>
                  <span className={styles.dot} />
                  <span>
                    <b>Kalender-Abo</b> — trägt deine Anmeldungen live in deinen Handy-Kalender ein. Separate
                    Buttons für iOS/macOS und Android/Google, jeweils mit Info-Symbol zur genauen
                    Einrichtung.
                  </span>
                </li>
                <li>
                  <span className={styles.dot} />
                  <span>
                    <b>Push-Benachrichtigungen aktivieren</b> — für neue Termine, Erinnerungen und
                    Warteliste-Updates.
                  </span>
                </li>
                <li>
                  <span className={styles.dot} />
                  <span>
                    <b>Abmelden</b> — ganz unten.
                  </span>
                </li>
              </ul>
            </section>
          </div>
        ) : (
          <div role="tabpanel">
            <p className={styles.intro}>
              Als <b>Trainer</b>, <b>Kapitän</b> oder <b>Clubmanager</b> siehst du zusätzlich einen
              Admin-Bereich. Alles aus der Spieler-Anleitung gilt weiterhin auch für dich — hier kommt dazu,
              was du zusätzlich verwalten kannst. Manche Bereiche sind dem <b>Clubmanager</b> vorbehalten
              (siehe Tabelle unten).
            </p>

            <nav className={styles.jumpnav} aria-label="Abschnitte">
              <a href="#a-home">Home-Bildschirm</a>
              <a href="#a-wechsel">Admin-Bereich</a>
              <a href="#a-termine">Termine</a>
              <a href="#a-rotation">Faire Rotation</a>
              <a href="#a-gruppen">Gruppen</a>
              <a href="#a-accounts">Accounts</a>
              <a href="#a-rollen">Rollen</a>
              <a href="#a-rechte">Rechte-Übersicht</a>
            </nav>

            <HomeScreenSection idPrefix="a" />

            <section className={styles.card} id="a-wechsel">
              <Eyebrow icon={<Settings size={20} strokeWidth={2} />} label="Navigation" />
              <h2>In den Admin-Bereich wechseln</h2>
              <p className={styles.lede}>Zwei Wege dorthin:</p>
              <ul className={styles.featureList}>
                <li>
                  <span className={styles.dot} />
                  <span>
                    Auf der Termine-Seite oben rechts den Schalter <b>„Admin“</b> antippen.
                  </span>
                </li>
                <li>
                  <span className={styles.dot} />
                  <span>
                    In deinem <b>Profil</b> ganz unten auf <b>„Admin-Bereich öffnen“</b> tippen.
                  </span>
                </li>
              </ul>
              <p className={styles.lede} style={{ marginTop: 14 }}>
                Im Admin-Bereich findest du oben eine eigene Unternavigation: <b>Termine · Gruppen ·
                Anfragen · Rollen · Accounts</b> (Trainer und Kapitäne sehen nur Termine und Anfragen). Über
                denselben Schalter geht&rsquo;s zurück zur normalen Spieler-Ansicht.
              </p>
            </section>

            <section className={styles.card} id="a-termine">
              <Eyebrow icon={<Calendar size={20} strokeWidth={2} />} label="Herzstück" />
              <h2>Termine verwalten</h2>
              <p className={styles.lede}>
                In der Admin-Terminliste einen Termin nach links wischen, um ihn zu <b>bearbeiten</b> oder zu{" "}
                <b>löschen</b>. Über das Plus legst du einen neuen an — das sind alle Felder:
              </p>
              <div className={styles.fieldGrid}>
                <div className={styles.field}>
                  <div className={styles.k}>Typ</div>
                  <div className={styles.v}>Training · Event · Spieltag</div>
                </div>
                <div className={styles.field}>
                  <div className={styles.k}>Titel, Trainer, Beschreibung</div>
                  <div className={styles.v}>Freitext</div>
                </div>
                <div className={styles.field}>
                  <div className={styles.k}>Datum, Start-/Endzeit</div>
                  <div className={styles.v}>Pflichtfelder</div>
                </div>
                <div className={styles.field}>
                  <div className={styles.k}>Location &amp; Courts</div>
                  <div className={styles.v}>z. B. „The Padellers Essen“, Platznummern</div>
                </div>
                <div className={styles.field}>
                  <div className={styles.k}>Max. Teilnehmer &amp; Preis</div>
                  <div className={styles.v}>Preis optional, für Anmeldebestätigungen</div>
                </div>
                <div className={styles.field}>
                  <div className={styles.k}>Sichtbar für / Anmeldung offen für</div>
                  <div className={styles.v}>Alle Gruppen oder bestimmte Teams — getrennt einstellbar</div>
                </div>
                <div className={styles.field}>
                  <div className={styles.k}>Anmeldung: Sofort / Geplant</div>
                  <div className={styles.v}>
                    Bei „Geplant“: Öffnungszeitpunkt, optional vor Mitgliedern verborgen
                  </div>
                </div>
                <div className={styles.field}>
                  <div className={styles.k}>Push-Optionen</div>
                  <div className={styles.v}>
                    Benachrichtigung bei Erstellung, Erinnerung 2 Std. vorher — beide standardmäßig an
                  </div>
                </div>
              </div>
              <p className={styles.lede} style={{ marginTop: 16 }}>
                In der Teilnehmerverwaltung eines Termins kannst du außerdem Leute manuell{" "}
                <b>hinzufügen/entfernen</b>, die Liste als <b>Bild teilen</b> oder als <b>Text kopieren</b>,
                und siehst Warteliste sowie ausstehende Anmeldungen.
              </p>
            </section>

            <section className={styles.card} id="a-rotation">
              <Eyebrow icon={<RotateCw size={20} strokeWidth={2} />} label="Für Teams mit Wartelisten-Problem" />
              <h2>Faire Rotation einrichten</h2>
              <Steps
                items={[
                  <>
                    In <b>Gruppen</b> bei dem betroffenen Team den Schalter <b>„Faire Rotation aktiv“</b>{" "}
                    einschalten.
                  </>,
                  <>
                    Beim Anlegen eines Trainings für genau dieses eine Team erscheint das Feld{" "}
                    <b>„Anmeldeschluss“</b> — festlegen, bis wann sich alle anmelden können.
                  </>,
                  <>
                    Bis dahin sind Anmeldungen „ausstehend“; danach verteilt der Algorithmus die Plätze
                    automatisch — wer zuletzt seltener zum Zug kam, hat Vorrang.
                  </>,
                  <>
                    Einzelne Personen von der Rotation ausnehmen (garantierter Platz) geht in{" "}
                    <b>Accounts</b> beim Bearbeiten eines Profils.
                  </>,
                ]}
              />
              <Callout mark="Nachvollziehen">
                Im Termin selbst zeigt der Abschnitt <b>„Zuteilung erklären“</b> nach Ablauf der Frist, wer
                mit welcher Quote reinkam oder auf der Warteliste landete.
              </Callout>
            </section>

            <section className={styles.card} id="a-gruppen">
              <Eyebrow icon={<Users size={20} strokeWidth={2} />} label="Nur Clubmanager" />
              <h2>Gruppen verwalten</h2>
              <ul className={styles.featureList}>
                <li>
                  <span className={styles.dot} />
                  <span>Neues Team anlegen, Namen &amp; Kürzel bearbeiten (Stift-Symbol).</span>
                </li>
                <li>
                  <span className={styles.dot} />
                  <span>Einzelne Spieler direkt aus einer Gruppe entfernen (× am Namen-Chip).</span>
                </li>
                <li>
                  <span className={styles.dot} />
                  <span>
                    <b>Gruppe löschen</b> (Papierkorb-Symbol, mit Sicherheitsabfrage) — Mitglieder verlieren
                    dabei ihre Team-Zuordnung und landen wieder beim Teamcode-Schritt.
                  </span>
                </li>
              </ul>
            </section>

            <section className={styles.card} id="a-accounts">
              <Eyebrow icon={<UserCog size={20} strokeWidth={2} />} label="Nur Clubmanager" />
              <h2>Accounts verwalten</h2>
              <p className={styles.lede}>
                So bekommt ein neuer Spieler Zugang — es gibt keine Selbstregistrierung:
              </p>
              <Steps
                items={[
                  <>
                    <b>Vorname</b> und <b>Nachname</b> in den beiden Feldern eintragen, Team und Rolle
                    wählen.
                  </>,
                  <>
                    Auf <b>„Anlegen“</b> tippen — die App zeigt dir ein automatisch erzeugtes Passwort an.
                  </>,
                  <>
                    Dieses Passwort <b>persönlich oder per Chat weitergeben</b> — es wird nirgends automatisch
                    verschickt.
                  </>,
                ]}
              />
              <p className={styles.lede} style={{ marginTop: 14 }}>
                Bestehende Accounts lassen sich bearbeiten (Name, Team, Rotations-Ausschluss) oder löschen.
              </p>
            </section>

            <section className={styles.card} id="a-rollen">
              <Eyebrow icon={<Award size={20} strokeWidth={2} />} label="Nur Clubmanager" />
              <h2>Rollen vergeben</h2>
              <p className={styles.lede}>
                Jeder Spieler lässt sich mit einem Tippen zu <b>Kapitän</b> oder <b>Trainer</b> befördern
                (und zurück). Es gibt immer genau einen <b>Clubmanager</b> — diese Rolle ist fest und nicht
                übertragbar.
              </p>
            </section>

            <section className={styles.card} id="a-rechte">
              <Eyebrow icon={<Table2 size={20} strokeWidth={2} />} label="Zum Nachschlagen" />
              <h2>Wer darf was?</h2>
              <div className={styles.permWrap}>
                <table className={styles.permTable}>
                  <thead>
                    <tr>
                      <th>Funktion</th>
                      <th>Spieler</th>
                      <th>Kapitän</th>
                      <th>Trainer</th>
                      <th>Clubmanager</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>Termine ansehen &amp; anmelden</td>
                      <td className={styles.yes}>✓</td>
                      <td className={styles.yes}>✓</td>
                      <td className={styles.yes}>✓</td>
                      <td className={styles.yes}>✓</td>
                    </tr>
                    <tr>
                      <td>Termine erstellen / bearbeiten</td>
                      <td className={styles.no}>—</td>
                      <td className={styles.yes}>✓</td>
                      <td className={styles.yes}>✓</td>
                      <td className={styles.yes}>✓</td>
                    </tr>
                    <tr>
                      <td>Teilnehmer verwalten</td>
                      <td className={styles.no}>—</td>
                      <td className={styles.yes}>✓</td>
                      <td className={styles.yes}>✓</td>
                      <td className={styles.yes}>✓</td>
                    </tr>
                    <tr>
                      <td>Ankündigungen posten</td>
                      <td className={styles.no}>—</td>
                      <td className={styles.yes}>✓</td>
                      <td className={styles.yes}>✓</td>
                      <td className={styles.yes}>✓</td>
                    </tr>
                    <tr>
                      <td>Anfragen bestätigen</td>
                      <td className={styles.no}>—</td>
                      <td className={styles.yes}>✓</td>
                      <td className={styles.yes}>✓</td>
                      <td className={styles.yes}>✓</td>
                    </tr>
                    <tr>
                      <td>Nachrichten/Ankündigungen löschen</td>
                      <td className={styles.no}>—</td>
                      <td className={styles.no}>—</td>
                      <td className={styles.no}>—</td>
                      <td className={styles.yes}>✓</td>
                    </tr>
                    <tr>
                      <td>Gruppen anlegen / löschen</td>
                      <td className={styles.no}>—</td>
                      <td className={styles.no}>—</td>
                      <td className={styles.no}>—</td>
                      <td className={styles.yes}>✓</td>
                    </tr>
                    <tr>
                      <td>Accounts anlegen / löschen</td>
                      <td className={styles.no}>—</td>
                      <td className={styles.no}>—</td>
                      <td className={styles.no}>—</td>
                      <td className={styles.yes}>✓</td>
                    </tr>
                    <tr>
                      <td>Rollen vergeben</td>
                      <td className={styles.no}>—</td>
                      <td className={styles.no}>—</td>
                      <td className={styles.no}>—</td>
                      <td className={styles.yes}>✓</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}
      </main>

      <footer className={styles.footer}>
        ClubTermine · Diese Anleitung begleitet die aktuelle Version der App — einzelne Ansichten können sich
        mit künftigen Updates leicht ändern.
      </footer>
    </div>
  );
}
