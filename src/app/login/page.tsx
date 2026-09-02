"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { IntroShell, introStyles as styles } from "@/components/layout/IntroShell";
import { Tabs } from "@/components/ui/Tabs";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

// Self-registration is off for now (accounts are created directly by the
// owner instead) but the code stays in place — flip this back to re-enable
// the "Registrieren" tab and its signUp flow without rebuilding it.
const REGISTRATION_ENABLED = false;

const TABS = [
  { id: "login", label: "Login" },
  { id: "register", label: "Registrieren" },
];

function ConfirmedNotice({ onDismiss }: { onDismiss: () => void }) {
  return (
    <>
      <div className={styles.iconCircle}>
        <CheckCircle2 size={26} color="var(--tp-pink-deep)" strokeWidth={2} />
      </div>
      <div className={styles.title}>E-Mail bestätigt!</div>
      <div className={styles.subtitle}>Dein Konto ist aktiv. Du kannst dich jetzt einloggen.</div>
      <Button variant="accent" size="lg" full onClick={onDismiss}>
        Weiter zum Login
      </Button>
    </>
  );
}

function LoginPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();

  const [dismissedConfirm, setDismissedConfirm] = useState(false);
  const showConfirmed = searchParams.get("confirmed") === "1" && !dismissedConfirm;

  const [tab, setTab] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setInfo("");

    if (tab === "register") {
      if (!name.trim()) {
        setError("Bitte gib deinen Namen ein.");
        return;
      }
      if (!email.trim() || !email.includes("@")) {
        setError("Bitte gib eine gültige E-Mail ein.");
        return;
      }
    } else if (!firstName.trim() || !lastName.trim()) {
      setError("Bitte gib Vor- und Nachname ein.");
      return;
    }
    if (password.length < 6) {
      setError("Das Passwort muss mindestens 6 Zeichen haben.");
      return;
    }

    setLoading(true);
    try {
      if (tab === "register") {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { name: name.trim() } },
        });
        if (signUpError) {
          setError(translateAuthError(signUpError));
          return;
        }
        if (!data.session) {
          setInfo("Konto erstellt. Bitte bestätige deine E-Mail-Adresse über den Link, den wir dir geschickt haben, und logge dich danach ein.");
          setTab("login");
          return;
        }
        router.push("/teamcode");
        router.refresh();
      } else {
        const res = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: `${firstName.trim()} ${lastName.trim()}`, password }),
        });
        if (!res.ok) {
          setError("Name oder Passwort ist falsch.");
          return;
        }
        router.push("/");
        router.refresh();
      }
    } catch (err) {
      setError(translateAuthError(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <IntroShell mood="pink">
      <div className={styles.hero}>
        <div className={styles.wordmark}>The Padellers</div>
        <div className={styles.tagline}>Trainingsanmeldung</div>
      </div>

      {showConfirmed ? (
        <ConfirmedNotice
          onDismiss={() => {
            setDismissedConfirm(true);
            router.replace("/login");
          }}
        />
      ) : (
        <>
          {REGISTRATION_ENABLED && (
            <Tabs
              items={TABS}
              value={tab}
              onChange={(id) => {
                setTab(id as "login" | "register");
                setError("");
                setInfo("");
              }}
              style={{ marginBottom: 24 }}
            />
          )}

          <form className={styles.card} onSubmit={handleSubmit}>
            {tab === "register" && (
              <Input
                label="Name"
                placeholder="Vorname Nachname"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            )}
            {tab === "register" ? (
              <Input
                label="E-Mail"
                type="email"
                placeholder="du@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            ) : (
              <>
                <Input label="Vorname" placeholder="Max" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
                <Input label="Nachname" placeholder="Mustermann" value={lastName} onChange={(e) => setLastName(e.target.value)} />
              </>
            )}
            <Input
              label="Passwort"
              type="password"
              placeholder="Mind. 6 Zeichen"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />

            {error && <div className={styles.error}>{error}</div>}
            {info && <div className={styles.info}>{info}</div>}

            <Button variant="accent" size="lg" full type="submit" disabled={loading}>
              {tab === "register" ? "Registrieren" : "Anmelden"}
            </Button>
          </form>

          {REGISTRATION_ENABLED && (
            <div className={styles.footnote}>
              Nach dem {tab === "register" ? "Registrieren" : "Login"} brauchst du noch den Teamcode deines Teams.
            </div>
          )}
        </>
      )}
    </IntroShell>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginPageInner />
    </Suspense>
  );
}

function translateAuthError(err: unknown): string {
  const message = err instanceof Error ? err.message : typeof err === "string" ? err : "";
  if (!message) return "Etwas ist schiefgelaufen. Bitte versuche es erneut.";
  if (message.includes("Invalid login credentials")) return "Name oder Passwort ist falsch.";
  if (message.includes("User already registered")) return "Für diese E-Mail existiert bereits ein Konto.";
  if (message.includes("Password should be")) return "Das Passwort muss mindestens 6 Zeichen haben.";
  return message;
}
