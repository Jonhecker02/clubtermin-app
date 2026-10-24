import type { Metadata } from "next";
import { LegalPage, LegalSection } from "@/components/LegalPage";
import { LEGAL } from "@/lib/legal";

export const metadata: Metadata = { title: "Impressum — ClubTermine" };

export default function ImpressumPage() {
  return (
    <LegalPage title="Impressum">
      <LegalSection title="Angaben gemäß § 5 DDG">
        <p>
          {LEGAL.operatorName}
          <br />
          {LEGAL.street}
          <br />
          {LEGAL.city}
          <br />
          {LEGAL.country}
        </p>
      </LegalSection>
      <LegalSection title="Kontakt">
        <p>
          E-Mail: <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>
          {LEGAL.phone && (
            <>
              <br />
              Telefon: {LEGAL.phone}
            </>
          )}
        </p>
      </LegalSection>
      <LegalSection title="Haftung für Inhalte">
        <p>
          Die Inhalte in der App (Termine, Ankündigungen) stammen von den Trainern und Verantwortlichen der jeweiligen
          Mannschaft. Auf Hinweise zu rechtswidrigen Inhalten reagieren wir zeitnah und entfernen sie. Hinweise bitte per
          E-Mail.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
