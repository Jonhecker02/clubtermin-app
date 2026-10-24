"use client";

import { useState } from "react";
import { useRouter } from "@/lib/useGuardedRouter";
import { useQueryClient } from "@tanstack/react-query";
import { IntroShell, introStyles as styles } from "@/components/layout/IntroShell";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { AppLogo } from "@/components/AppLogo";
import { clearAllCaches } from "@/lib/queryPersist";

export default function LoginPage() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!firstName.trim() || !lastName.trim()) {
      setError("Bitte gib Vor- und Nachname ein.");
      return;
    }
    if (password.length < 6) {
      setError("Das Passwort muss mindestens 6 Zeichen haben.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: `${firstName.trim()} ${lastName.trim()}`, password }),
      });
      if (res.status === 429) {
        setError("Zu viele Versuche. Bitte warte ein paar Minuten und versuche es dann erneut.");
        return;
      }
      if (!res.ok) {
        setError("Name oder Passwort ist falsch.");
        return;
      }
      // A shared/reused tab may still hold another account's cached
      // queries (profile, registrations, ...) — drop them so this session
      // starts from a clean slate instead of briefly showing stale data.
      clearAllCaches(queryClient);
      router.push("/");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <IntroShell mood="navy">
      <div className={styles.hero}>
        <div className={styles.logoWrap}>
          <AppLogo size={92} className={styles.logo} />
        </div>
        <h1 className={styles.appName}>ClubTermine</h1>
        <div className={styles.appTagline}>Trainings · Events · Spieltage</div>
      </div>

      <form className={styles.card} onSubmit={handleSubmit}>
        <Input label="Vorname" placeholder="Max" value={firstName} onChange={(e) => setFirstName(e.target.value)} autoComplete="given-name" autoCapitalize="words" autoCorrect="off" enterKeyHint="next" />
        <Input label="Nachname" placeholder="Mustermann" value={lastName} onChange={(e) => setLastName(e.target.value)} autoComplete="family-name" autoCapitalize="words" autoCorrect="off" enterKeyHint="next" />
        <Input
          label="Passwort"
          type="password"
          placeholder="Mind. 6 Zeichen"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          enterKeyHint="go"
        />

        {error && <div className={styles.error}>{error}</div>}

        <Button variant="accent" size="lg" full type="submit" disabled={loading}>
          Anmelden
        </Button>
      </form>

      <div className={styles.spacer}>
        <Button variant="ghost" size="sm" onClick={() => router.push("/registrieren")} style={{ color: "var(--tp-pink)" }}>
          Neu hier? Jetzt registrieren
        </Button>
        <div className={styles.legal}>
          <a href="/anleitung">Anleitung</a>
          <a href="/privacy">Datenschutz</a>
          <a href="/impressum">Impressum</a>
          <a href="/support">Hilfe</a>
        </div>
      </div>
    </IntroShell>
  );
}
