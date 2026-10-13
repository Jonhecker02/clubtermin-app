"use client";

import { useState } from "react";
import {
  Calendar,
  LayoutGrid,
  LogIn,
  MessageCircle,
  RotateCw,
  Settings,
  Smartphone,
  StickyNote,
  Table2,
  UserCircle,
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
      <h2>Zum Home-Bildschirm hinzufügen &amp; Benachrichtigungen</h2>
      <p className={styles.lede}>
        Damit startet ClubTermine wie eine echte App direkt von deinem Homescreen — ohne Browser-Leiste
        drumherum. So bekommst du auch <b>Benachrichtigungen</b>, z. B. wenn die Zuteilung feststeht oder
        du von der Warteliste nachrückst. Auf dem iPhone geht das <b>nur</b>, wenn die App auf dem
        Home-Bildschirm liegt. Auf Android klappt es auch direkt im Chrome-Browser, mit der installierten
        App ist es aber zuverlässiger.
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
            <>
              Öffne ClubTermine jetzt <b>vom Home-Bildschirm</b> (nicht aus Safari), gehe unten auf{" "}
              <b>Profil</b> und tippe auf <b>„Push-Benachrichtigungen aktivieren“</b>. Erlaube die
              Mitteilungen.
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
            <>
              Öffne ClubTermine (am besten über das neue Symbol), gehe unten auf <b>Profil</b> und tippe auf{" "}
              <b>„Push-Benachrichtigungen aktivieren“</b>. Erlaube die Benachrichtigungen, wenn Android
              fragt.
            </>,
          ]}
        />
      )}
      <Callout mark="Kommt nichts an?">
        {platform === "ios" ? (
          <>
            Prüfe unter <b>Einstellungen → Mitteilungen → ClubTermine</b>, ob Mitteilungen erlaubt sind, und
            dass kein Fokus-Modus („Nicht stören“) aktiv ist.
          </>
        ) : (
          <>
            Prüfe unter <b>Einstellungen → Apps → Chrome (bzw. ClubTermine) → Benachrichtigungen</b>, ob sie
            erlaubt sind. Spar-Modi können Nachrichten verzögern — nimm die App am besten vom Akku-Sparen
            aus.
          </>
        )}
      </Callout>
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
              ClubTermine ist die App deines Clubs für Trainings, Events und Spieltage: Hier meldest du dich an,
              siehst deine Termine und bekommst Bescheid, wenn etwas ansteht. Diese Seite erklärt alles, was du
              dafür brauchst. <b>Am besten fügst du die App zuerst zu deinem Home-Bildschirm hinzu</b>{" "}
              (Abschnitt 2), dann fühlt sie sich wie eine echte App an und du bekommst Benachrichtigungen.
            </p>

            <nav className={styles.jumpnav} aria-label="Abschnitte">
              <a href="#s-login">Login</a>
              <a href="#s-home">App &amp; Push</a>
              <a href="#s-termine">Termine</a>
              <a href="#s-rotation">Faire Rotation</a>
              <a href="#s-chat">Chat</a>
              <a href="#s-profil">Profil</a>
            </nav>

            <section className={styles.card} id="s-login">
              <Eyebrow icon={<LogIn size={20} strokeWidth={2} />} label="Erste Schritte" />
              <h2>Login</h2>
              <p className={styles.lede}>
                Du registrierst dich selbst über den Link, den du von deinem Trainer oder Clubmanager
                bekommst — nur mit <b>Vorname, Nachname und einem Passwort</b>. Danach ordnet
                dich dein Trainer oder Clubmanager deiner Mannschaft zu; sobald das geschehen ist, kommst du
                in die App.
              </p>
              <Steps
                items={[
                  <>
                    Öffne den Registrierungs-Link, trage <b>Vorname</b>, <b>Nachname</b> und ein{" "}
                    <b>Passwort</b> (mindestens 6 Zeichen) ein und tippe auf <b>„Registrieren“</b>. Du siehst
                    dann „Anfrage wird geprüft“ — das ist normal, bis du zugeordnet bist.
                  </>,
                  <>
                    Danach meldest du dich immer mit <b>Vorname</b>, <b>Nachname</b> und deinem Passwort an
                    und tippst auf <b>„Anmelden“</b>.
                  </>,
                ]}
              />
              <Callout mark="Passwort weg?">
                Wende dich an deinen Trainer oder Clubmanager — er vergibt dir ein neues Passwort, an
                deinem Account (Anmeldungen, Mannschaft) ändert sich dabei nichts.
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
                    Punkte je nach Termin-Typ. Mit den Pfeilen wechselst du den Monat — darunter stehen nur die Termine
                    dieses Monats; ein Tag antippen zeigt nur diesen Tag.
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
                    <b>Anmelden / Abmelden</b> — im Termin antippen, unten den Button drücken. Bei Trainings
                    siehst du danach „ausstehend“: Die Plätze werden nach dem Anmeldeschluss fair verteilt
                    (siehe nächster Abschnitt). Bei Events und Spieltagen bekommst du direkt einen Platz —
                    ist er voll, landest du auf der <b>Warteliste</b> und rückst bei Absagen nach.
                  </span>
                </li>
              </ul>
            </section>

            <section className={styles.card} id="s-rotation">
              <Eyebrow icon={<RotateCw size={20} strokeWidth={2} />} label="So bekommst du deinen Platz" />
              <h2>Faire Rotation — so wird zugeteilt</h2>
              <p className={styles.lede}>
                Bei Trainings gibt es oft mehr Anmeldungen als Plätze. Damit nicht immer die Schnellsten
                dabei sind, wird <b>immer fair verteilt</b>: <b>Wer zuletzt am längsten nicht dabei war,
                kommt zuerst dran.</b> Ob du dich als Erster oder als Letzter anmeldest, ist völlig egal.
              </p>

              <Steps
                items={[
                  <>
                    Du meldest dich an. Du siehst <b>„ausstehend“</b> und einen Countdown bis zum{" "}
                    <b>Anmeldeschluss</b> — der ist immer <b>samstags um 22 Uhr</b>. Bis dahin kannst du dich
                    in Ruhe anmelden oder wieder abmelden.
                  </>,
                  <>
                    Nach dem Anmeldeschluss wird einmal für alle zugeteilt. Euer Trainer oder Clubmanager
                    prüft den Vorschlag und bestätigt ihn — meist am Sonntag.
                  </>,
                  <>
                    Du bekommst eine Benachrichtigung (wenn du sie aktiviert hast): entweder{" "}
                    <b>„Du bist dabei“</b> oder <b>„Warteliste“</b> mit deinem Platz und dem Grund.
                  </>,
                ]}
              />

              <h3 className={styles.subhead}>Wer hat Vorrang?</h3>
              <ul className={styles.featureList}>
                <li>
                  <span className={styles.dot} />
                  <span>
                    <b>1. Wer am längsten pausiert hat.</b> Entscheidend ist, wann du zuletzt bei einem
                    Training dabei warst. Je länger das her ist, desto besser deine Chance.
                  </span>
                </li>
                <li>
                  <span className={styles.dot} />
                  <span>
                    <b>2. Bei gleichem Datum:</b> wer in letzter Zeit seltener einen Platz bekommen hat,
                    obwohl er sich angemeldet hat.
                  </span>
                </li>
                <li>
                  <span className={styles.dot} />
                  <span>
                    <b>3. Ist dann immer noch alles gleich:</b> entscheidet das Los. Es ist für jedes
                    Training fest und lässt sich von niemandem beeinflussen.
                  </span>
                </li>
              </ul>

              <Callout mark="Beispiel">
                2 Plätze, 4 Anmeldungen. <b>Lena</b> war zuletzt vor 5 Wochen dabei, <b>Tom</b> und{" "}
                <b>Mia</b> beide vor 2 Wochen (Mia hat in letzter Zeit aber seltener einen Platz bekommen),{" "}
                <b>Jan</b> letzte Woche. Ergebnis: Lena und Mia sind dabei. Tom steht auf Platz 1 der
                Warteliste, Jan auf Platz 2 — auch wenn Jan sich als Erster angemeldet hat.
              </Callout>

              <Callout mark="Warteliste">
                Auf der Warteliste stehst du in der Reihenfolge, in der du nachrückst, wenn jemand absagt —
                nach denselben Regeln. Den Grund und deinen Rang („Rang 5 von 7“) siehst du im Termin. Du
                bekommst eine Benachrichtigung, sobald du nachgerückt bist.
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
                    <b>Push-Benachrichtigungen aktivieren</b> — für neue Termine, Erinnerungen und die
                    Zuteilung. Einrichtung: siehe Abschnitt „App &amp; Push“.
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
              Als <b>Trainer</b> oder <b>Kapitän</b> siehst du zusätzlich einen Admin-Bereich. Alles aus der
              Spieler-Anleitung gilt weiterhin auch für dich — hier kommt dazu, was du zusätzlich verwalten
              kannst.
            </p>

            <nav className={styles.jumpnav} aria-label="Abschnitte">
              <a href="#a-home">App &amp; Push</a>
              <a href="#a-wechsel">Admin-Bereich</a>
              <a href="#a-termine">Termine</a>
              <a href="#a-rotation">Faire Rotation</a>
              <a href="#a-notizen">Spieler-Notizen</a>
              <a href="#a-courtgroups">Trainingsgruppen</a>
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
                Im Admin-Bereich findest du oben eine eigene Unternavigation mit <b>Termine</b> und{" "}
                <b>Anfragen</b>. Über denselben Schalter geht&rsquo;s zurück zur normalen Spieler-Ansicht.
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
                <b>hinzufügen/entfernen</b>, die Liste als <b>Bild teilen</b> oder als <b>Text kopieren</b> (bei Trainings
                unten im Bereich Trainingsgruppen) und siehst Warteliste sowie ausstehende Anmeldungen.
              </p>
            </section>

            <section className={styles.card} id="a-rotation">
              <Eyebrow icon={<RotateCw size={20} strokeWidth={2} />} label="Plätze verteilen" />
              <h2>Faire Rotation verstehen</h2>
              <p className={styles.lede}>
                Die Plätze bei Trainings werden fair verteilt statt nach Anmeldereihenfolge — euer
                Clubmanager schaltet das pro Team ein (Admin → Gruppen), normalerweise bei allen. Beim
                Anlegen eines Trainings für ein solches Team gilt:
              </p>
              <Steps
                items={[
                  <>
                    Es erscheint zusätzlich das Feld <b>„Anmeldeschluss“</b>. Der ist immer{" "}
                    <b>samstags um 22 Uhr</b> — mit „Vorschlag übernehmen“ wird er automatisch gesetzt.
                  </>,
                  <>
                    Bis dahin sind Anmeldungen „ausstehend“; danach schlägt der Algorithmus eine Zuteilung
                    vor — <b>wer am längsten nicht dabei war, hat Vorrang</b>. Bei Gleichstand zählt, wer
                    zuletzt seltener einen Platz bekam, danach entscheidet ein festes Los. Der
                    Anmeldezeitpunkt spielt keine Rolle.
                  </>,
                ]}
              />
              <Callout mark="Benachrichtigung">
                Nach dem Anmeldeschluss bekommt der Clubmanager die Nachricht „Zuteilung wartet auf dich“.
                Im Termin den Vorschlag prüfen, bei Bedarf einzelne Personen tauschen und{" "}
                <b>„Zuteilung bestätigen“</b> antippen — erst dann sehen die Spieler ihr Ergebnis.
              </Callout>
              <Callout mark="Nachvollziehen">
                Im Termin selbst zeigt der Abschnitt <b>„Zuteilung erklären“</b> nach Ablauf der Frist für
                jede Person den Rang unter allen Bewerbern, wann sie zuletzt dabei war und ihre Quote.
                Spieler ohne Platz sehen denselben Grund in ihrer Ansicht und in der Benachrichtigung.
              </Callout>
            </section>

            <section className={styles.card} id="a-notizen">
              <Eyebrow icon={<StickyNote size={20} strokeWidth={2} />} label="Für Trainer &amp; Kapitän" />
              <h2>Spieler-Notizen</h2>
              <p className={styles.lede}>
                Zu jedem Spieler lassen sich kurze Notizen hinterlegen, die alle Admins sehen — praktisch,
                wenn mal jemand anderes trainiert und wissen soll, woran die Person zuletzt gearbeitet hat.
                Notizen bleiben als Verlauf erhalten (mit Datum und Autor) statt sich gegenseitig zu
                überschreiben.
              </p>
              <ul className={styles.featureList}>
                <li>
                  <span className={styles.dot} />
                  <span>
                    In der <b>Teilnehmerverwaltung eines Termins</b> — Notiz-Symbol neben jedem Teilnehmer.
                  </span>
                </li>
                <li>
                  <span className={styles.dot} />
                  <span>
                    In <b>Accounts</b> (Clubmanager) — Notiz-Symbol neben jedem Account.
                  </span>
                </li>
              </ul>
            </section>

            <section className={styles.card} id="a-courtgroups">
              <Eyebrow icon={<LayoutGrid size={20} strokeWidth={2} />} label="Für Trainer &amp; Kapitän" />
              <h2>Trainingsgruppen einteilen</h2>
              <p className={styles.lede}>
                Für große Trainings mit mehreren Courts und Trainern: Teilt die bestätigten Teilnehmer in
                kleine Gruppen ein — z. B. bei 16 Leuten und 2 Trainern vier Gruppen à vier Spieler, je zwei
                trainieren zuerst mit einem Trainer, während die anderen beiden spielen, danach wird
                getauscht. Zu finden unten in der Teilnehmerverwaltung eines <b>Training</b>-Termins.
              </p>
              <Steps
                items={[
                  <>
                    <b>„Automatisch einteilen“</b> antippen: Die Teilnehmer werden nach Spielstärke auf Courts
                    verteilt (16 Spieler = 4 Courts à 4, die Anzahl lässt sich ändern). Gleich starke Spieler
                    stehen zusammen, und wer zuletzt oft zusammen auf einem Court war, wird getrennt — so
                    wechselt es von Woche zu Woche automatisch durch. <b>„Neu mischen“</b> liefert einen
                    anderen Vorschlag. Spielstärken (0 bis 5, auch mit Komma wie 2,5) tragen Trainer und
                    Clubmanager unter Admin → Spielstärke ein; ohne Level wird nur durchgewechselt. Danach lässt sich alles von Hand anpassen.
                  </>,
                  <>
                    Alternativ <b>„Neue Gruppe“</b> antippen, Spieler per Dropdown zuteilen. Bei „Nicht zugeteilt“ siehst
                    du zu jedem Spieler, mit wem er zuletzt zusammen trainiert hat — so lässt sich bewusst mal
                    anders mischen.
                  </>,
                  <>
                    Pro Gruppe den <b>Trainer</b> aus der Liste wählen und <b>„Trainiert Runde 1“</b> oder{" "}
                    <b>„Trainiert Runde 2“</b> wählen (die jeweils andere Runde spielt die Gruppe).
                  </>,
                  <>
                    Erscheint eine <b>faire Empfehlung</b>, hat die Mehrheit der aktuell zugeteilten Spieler
                    zuletzt öfter die andere Runde trainiert — anklicken übernimmt sie, muss aber nicht.
                  </>,
                  <>
                    Mit <b>„Trainingsgruppen speichern“</b> sichern, dann über{" "}
                    <b>„Für Spieler veröffentlichen“</b> freigeben — erst dann sehen die Teilnehmer ihre
                    Gruppe, ihren Trainer und ihre Runde auf der Termin-Seite.
                  </>,
                  <>
                    Für die Weitergabe gibt es unten im Bereich Trainingsgruppen zwei Exporte, jeweils als
                    Bild oder Text: die <b>Trainer-Ansicht</b> (alle Courts mit Spielern, ohne
                    Spielstärken) und <b>„Für die Spielergruppe“</b> mit Teilnehmern und Warteliste, z. B. für
                    WhatsApp.
                  </>,
                ]}
              />
            </section>

            <section className={styles.card} id="a-rechte">
              <Eyebrow icon={<Table2 size={20} strokeWidth={2} />} label="Zum Nachschlagen" />
              <h2>Wer darf was?</h2>
              <p className={styles.lede}>
                Als Kapitän oder Trainer habt ihr untereinander dieselben Rechte. Die Zeilen unten, die nur
                der Clubmanager hat, sind zur Orientierung dabei — was dahintersteckt, verwaltet er über
                eigene Bereiche, die hier nicht im Detail beschrieben sind.
              </p>
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
                      <td>Spieler-Notizen sehen/schreiben</td>
                      <td className={styles.no}>—</td>
                      <td className={styles.yes}>✓</td>
                      <td className={styles.yes}>✓</td>
                      <td className={styles.yes}>✓</td>
                    </tr>
                    <tr>
                      <td>Trainingsgruppen einteilen</td>
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
