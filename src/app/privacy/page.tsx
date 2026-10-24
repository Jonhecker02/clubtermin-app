import type { Metadata } from "next";
import { LegalPage, LegalSection } from "@/components/LegalPage";
import { LEGAL } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Datenschutzerklärung — ClubTermine",
};

export default function PrivacyPage() {
  return (
    <LegalPage title="Datenschutzerklärung" updated={LEGAL.updated}>
      <LegalSection title="Verantwortlicher">
        <p>
          {LEGAL.operatorName}
          <br />
          {LEGAL.street}
          <br />
          {LEGAL.city}
          <br />
          {LEGAL.country}
          <br />
          E-Mail: <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>
        </p>
      </LegalSection>

      <LegalSection title="Welche Daten wir verarbeiten">
        <ul>
          <li>Vor- und Nachname (bei der Registrierung); es wird keine E-Mail-Adresse erhoben</li>
          <li>
            Geburtsdatum und Geschlecht (Herren/Damen) — sichtbar nur für Trainer und Admins, ausschließlich zur
            Mannschaftsplanung (z. B. Altersklassen); nicht sichtbar für andere Spieler und nicht Teil von Exporten
          </li>
          <li>Mannschafts- und Rollenzugehörigkeit</li>
          <li>Anmeldungen zu Trainings, Events und Spieltagen sowie Notizen und Spielstärke, die Trainer dazu pflegen</li>
          <li>Ankündigungen, die Trainer und Admins für ihre Mannschaft verfassen</li>
          <li>Zeitpunkt, zu dem du der Datenschutzerklärung bei der Registrierung zugestimmt hast</li>
          <li>Technische Kennungen für Push-Benachrichtigungen und Kalender-Abos (nur auf deinem Gerät nutzbar)</li>
        </ul>
      </LegalSection>

      <LegalSection title="Zweck und Rechtsgrundlage">
        <p>
          Diese Daten werden ausschließlich zur Organisation des Trainings- und Spielbetriebs der Mannschaften genutzt,
          die ClubTermine verwenden: Anmeldeverwaltung, Ankündigungen an die Mannschaft und Benachrichtigung über
          neue Termine. Rechtsgrundlage ist die Durchführung des Nutzungsverhältnisses (Art. 6 Abs. 1 lit. b DSGVO) und
          unser berechtigtes Interesse an einer geordneten Organisation (Art. 6 Abs. 1 lit. f DSGVO). Es findet keine Verarbeitung zu Werbezwecken statt, es gibt kein Tracking, und Daten werden
          nicht an Dritte verkauft.
        </p>
      </LegalSection>

      <LegalSection title="Zahlungsdaten">
        <p>
          Die App zeigt bei Terminen ggf. einen Preis als Information an. Es findet kein Zahlungsvorgang innerhalb der
          App statt, es werden keine Zahlungs- oder Bankdaten erhoben oder gespeichert.
        </p>
      </LegalSection>

      <LegalSection title="Hosting und Empfänger">
        <p>
          Die App wird über Vercel (Hosting, Rechenzentrum Frankfurt) und Supabase (Datenbank, Authentifizierung,
          Rechenzentrum Irland, EU) betrieben. Beide Anbieter verarbeiten Daten in unserem Auftrag gemäß Art. 28 DSGVO.
          Schriftarten werden von unserem eigenen Server ausgeliefert — es werden keine Daten an Google übertragen.
        </p>
        <p>
          Für Push-Benachrichtigungen werden ein Gerätebezeichner und der Text der Benachrichtigung an den
          Push-Dienst deines Geräts übermittelt (Apple Push Notification Service bzw. der Push-Dienst deines Browsers).
          Das geschieht nur, wenn du Benachrichtigungen aktiviert hast.
        </p>
        <p>
          Damit die App schnell startet und auch bei schlechtem Netz funktioniert, speichert dein Gerät zuletzt
          geladene Termine, Anmeldungen und Ankündigungen lokal zwischen. Beim Abmelden wird dieser Zwischenspeicher
          gelöscht.
        </p>
      </LegalSection>

      <LegalSection title="Speicherdauer und Löschung">
        <p>
          Wir speichern deine Daten, solange dein Konto besteht. Du kannst dein Konto jederzeit selbst in der App unter
          „Profil → Konto löschen“ dauerhaft löschen; dabei werden dein Name, deine Anmeldungen, Notizen zu dir
          und Geräte-Kennungen entfernt. Admins können Accounts auf Wunsch ebenfalls
          löschen.
        </p>
      </LegalSection>

      <LegalSection title="Deine Rechte">
        <p>
          Du hast das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung, Datenübertragbarkeit
          und Widerspruch. Name und Mannschaft kannst du teilweise selbst unter „Profil“ ändern; für alles Weitere
          schreib an <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>. Außerdem kannst du dich bei der für dich
          zuständigen Datenschutz-Aufsichtsbehörde beschweren.
        </p>
      </LegalSection>

      <LegalSection title="Push-Benachrichtigungen">
        <p>
          Wenn du Push-Benachrichtigungen aktivierst, wird ein technischer Gerätebezeichner gespeichert, um dir
          Benachrichtigungen zu neuen Terminen oder Ankündigungen zu senden. Du kannst dies jederzeit in deinem Profil
          oder in den Geräte-Einstellungen wieder deaktivieren.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
