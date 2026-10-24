import type { Metadata } from "next";
import { LegalPage, LegalSection } from "@/components/LegalPage";
import { LEGAL } from "@/lib/legal";

export const metadata: Metadata = { title: "Hilfe & Kontakt — ClubTermine" };

export default function SupportPage() {
  return (
    <LegalPage title="Hilfe & Kontakt">
      <LegalSection title="Kontakt">
        <p>
          Bei Fragen, Problemen oder Wünschen schreib uns: <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>. Wir
          antworten in der Regel innerhalb von zwei Werktagen.
        </p>
      </LegalSection>
      <LegalSection title="Häufige Fragen">
        <p>
          <b>Ich komme nicht in die App.</b> Gib deinen Vor- und Nachnamen und dein Passwort ein. Neu registrierte
          Konten schaltet der Clubmanager erst frei. Passwort vergessen? Der Clubmanager kann es zurücksetzen.
        </p>
        <p>
          <b>Ich bekomme keine Benachrichtigungen.</b> Prüfe unter „Profil“, ob Benachrichtigungen aktiv sind, und in
          den iPhone-Einstellungen unter „Mitteilungen → ClubTermine“.
        </p>
        <p>
          <b>Wie lösche ich mein Konto?</b> Unter „Profil → Konto löschen“. Die Daten werden dauerhaft entfernt.
        </p>
      </LegalSection>
      <LegalSection title="Mehr">
        <p>
          <a href="/anleitung">Anleitung</a> · <a href="/privacy">Datenschutz</a> · <a href="/impressum">Impressum</a>
        </p>
      </LegalSection>
    </LegalPage>
  );
}
