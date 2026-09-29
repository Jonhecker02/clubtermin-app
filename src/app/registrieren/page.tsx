"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { UserPlus } from "lucide-react";
import { IntroShell, introStyles as styles } from "@/components/layout/IntroShell";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

export default function RegistrierenPage() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
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
    if (password.length < 6) {
      setError("Das Passwort muss mindestens 6 Zeichen haben.");
      return;
    }
    setLoading(true);
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: `${firstName.trim()} ${lastName.trim()}`, password }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error === "name_taken" ? "Dieser Name ist schon vergeben — bitte eindeutig machen." : "Registrierung fehlgeschlagen. Bitte versuche es erneut.");
      return;
    }
    queryClient.clear();
    router.push("/");
    router.refresh();
  }

  return (
    <IntroShell mood="pink">
      <div className={styles.iconCircle}>
        <UserPlus size={26} color="var(--tp-pink-deep)" strokeWidth={2} />
      </div>
      <div className={styles.title}>Registrieren</div>
      <div className={styles.subtitle}>
        Leg dir einen Account an — dein Trainer oder Clubmanager ordnet dich danach deiner Mannschaft zu.
      </div>

      <form className={styles.card} onSubmit={submit}>
        <Input label="Vorname" placeholder="Max" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
        <Input label="Nachname" placeholder="Mustermann" value={lastName} onChange={(e) => setLastName(e.target.value)} />
        <Input
          label="Passwort"
          type="password"
          placeholder="Mind. 6 Zeichen"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && <div className={styles.error}>{error}</div>}
        <Button variant="accent" size="lg" full type="submit" disabled={loading}>
          Registrieren
        </Button>
      </form>

      <div className={styles.spacer}>
        <Button variant="ghost" size="sm" onClick={() => router.push("/login")}>
          Schon einen Account? Anmelden
        </Button>
      </div>
    </IntroShell>
  );
}
