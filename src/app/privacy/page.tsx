import type { Metadata } from "next";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Datenschutzerklärung — The Padellers",
};

export default function PrivacyPage() {
  return (
    <div className={styles.page}>
      <div className={styles.wordmark}>The Padellers</div>
      <div className={styles.tagline}>Trainingsanmeldung</div>

      <div className={styles.card}>
        <h1 className={styles.title}>Datenschutzerklärung</h1>
        <p className={styles.updated}>Stand: 11. August 2026</p>

        <div className={styles.section}>
          <h2>Verantwortlicher</h2>
          <p>
            {/* TODO: echten Vereinsnamen, Anschrift und Kontakt-E-Mail des Verantwortlichen eintragen, bevor diese Seite live geht. */}
            The Padellers Essen
            <br />
            [Anschrift ergänzen]
            <br />
            E-Mail: [Kontakt-E-Mail ergänzen]
          </p>
        </div>

        <div className={styles.section}>
          <h2>Welche Daten wir verarbeiten</h2>
          <ul>
            <li>Name und E-Mail-Adresse (bei der Registrierung)</li>
            <li>Mannschafts- und Rollenzugehörigkeit</li>
            <li>Anmeldungen zu Trainings, Events und Spieltagen</li>
            <li>Nachrichten und Ankündigungen im Chat der App</li>
            <li>Technische Kennungen für Push-Benachrichtigungen und Kalender-Abos (nur auf deinem Gerät nutzbar)</li>
          </ul>
        </div>

        <div className={styles.section}>
          <h2>Zweck der Verarbeitung</h2>
          <p>
            Diese Daten werden ausschließlich zur Organisation des Trainings- und Spielbetriebs von The Padellers
            genutzt: Anmeldeverwaltung, Kommunikation innerhalb der Mannschaft und Benachrichtigung über neue Termine.
            Es findet keine Verarbeitung zu Werbezwecken statt und Daten werden nicht an Dritte verkauft.
          </p>
        </div>

        <div className={styles.section}>
          <h2>Zahlungsdaten</h2>
          <p>
            Die App zeigt bei Terminen ggf. einen Preis als Information an. Es findet kein Zahlungsvorgang innerhalb
            der App statt, es werden keine Zahlungs- oder Bankdaten erhoben oder gespeichert.
          </p>
        </div>

        <div className={styles.section}>
          <h2>Hosting und Auftragsverarbeitung</h2>
          <p>
            Die App wird über Vercel (Hosting) und Supabase (Datenbank, Authentifizierung) betrieben. Beide Anbieter
            verarbeiten Daten in unserem Auftrag gemäß Art. 28 DSGVO.
          </p>
        </div>

        <div className={styles.section}>
          <h2>Zugriff und Löschung</h2>
          <p>
            Mitglieder können ihren Namen und ihre Mannschaftszugehörigkeit selbst in der App unter „Profil“
            bearbeiten. Für Auskunft, Berichtigung oder vollständige Löschung deines Kontos wende dich an die oben
            genannte Kontakt-E-Mail; ein Admin kann Accounts auf Wunsch auch direkt in der App löschen.
          </p>
        </div>

        <div className={styles.section}>
          <h2>Push-Benachrichtigungen</h2>
          <p>
            Wenn du Push-Benachrichtigungen aktivierst, wird ein technischer Gerätebezeichner gespeichert, um dir
            Benachrichtigungen zu neuen Terminen oder Ankündigungen zu senden. Du kannst dies jederzeit in deinem
            Profil wieder deaktivieren.
          </p>
        </div>
      </div>
    </div>
  );
}
