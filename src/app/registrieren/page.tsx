"use client";

import { useState } from "react";
import { useRouter } from "@/lib/useGuardedRouter";
import { useQueryClient } from "@tanstack/react-query";
import { UserPlus } from "lucide-react";
import { IntroShell, introStyles as styles } from "@/components/layout/IntroShell";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { isPlausibleBirthDate } from "@/lib/domain";
import { clearAllCaches } from "@/lib/queryPersist";

export default function RegistrierenPage() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [gender, setGender] = useState<"m" | "w" | "">("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!firstName.trim() || !lastName.trim()) {
      setError("Bitte gib Vor- und Nachname ein.");
      return;
    }
    if (gender === "") {
      setError("Bitte wähle Herr oder Dame.");
      return;
    }
    if (!isPlausibleBirthDate(birthDate)) {
      setError("Bitte gib dein Geburtsdatum an.");
      return;
    }
    if (password.length < 6) {
      setError("Das Passwort muss mindestens 6 Zeichen haben.");
      return;
    }
    setLoading(true);
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: `${firstName.trim()} ${lastName.trim()}`, password, birth_date: birthDate, gender }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(
        data.error === "name_taken"
          ? "Dieser Name ist schon vergeben — bitte eindeutig machen."
          : data.error === "too_many_attempts"
            ? "Zu viele Registrierungen von diesem Anschluss. Bitte versuche es später erneut."
            : "Registrierung fehlgeschlagen. Bitte versuche es erneut.",
      );
      return;
    }
    clearAllCaches(queryClient);
    router.push("/");
    router.refresh();
  }

  return (
    <IntroShell mood="navy">
      <div className={styles.iconCircle}>
        <UserPlus size={26} color="var(--tp-pink-deep)" strokeWidth={2} />
      </div>
      <div className={styles.title}>Registrieren</div>
      <div className={styles.subtitle}>
        Leg dir einen Account an — dein Trainer oder Clubmanager ordnet dich danach deiner Mannschaft zu.
      </div>

      <form className={styles.card} onSubmit={submit}>
        <Input label="Vorname" placeholder="Max" value={firstName} onChange={(e) => setFirstName(e.target.value)} autoComplete="given-name" autoCapitalize="words" autoCorrect="off" enterKeyHint="next" />
        <Input label="Nachname" placeholder="Mustermann" value={lastName} onChange={(e) => setLastName(e.target.value)} autoComplete="family-name" autoCapitalize="words" autoCorrect="off" enterKeyHint="next" />
        <div className={styles.genderField} role="radiogroup" aria-label="Geschlecht">
          <span className={styles.genderLabel}>Ich spiele bei den</span>
          <div className={styles.genderRow}>
            {(["m", "w"] as const).map((g) => (
              <button
                key={g}
                type="button"
                role="radio"
                aria-checked={gender === g}
                className={`${styles.genderBtn} ${gender === g ? styles.genderBtnOn : ""}`}
                onClick={() => setGender(g)}
              >
                {g === "m" ? "Herren" : "Damen"}
              </button>
            ))}
          </div>
        </div>
        <Input
          label="Geburtsdatum"
          type="date"
          value={birthDate}
          onChange={(e) => setBirthDate(e.target.value)}
          max={new Date().toISOString().slice(0, 10)}
          autoComplete="bday"
          helper="Geburtsdatum und Auswahl sind nur für Trainer und Admins sichtbar — sie helfen bei der Mannschaftsplanung (z. B. Herren 35)."
        />
        <Input
          label="Passwort"
          type="password"
          placeholder="Mind. 6 Zeichen"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          enterKeyHint="go"
        />
        {error && <div className={styles.error}>{error}</div>}
        <Button variant="accent" size="lg" full type="submit" disabled={loading}>
          Registrieren
        </Button>
      </form>

      <div className={styles.spacer}>
        <Button variant="ghost" size="sm" onClick={() => router.push("/login")} style={{ color: "var(--tp-pink)" }}>
          Schon einen Account? Anmelden
        </Button>
      </div>
    </IntroShell>
  );
}
