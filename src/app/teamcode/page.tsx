"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lock } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { IntroShell, introStyles as styles } from "@/components/layout/IntroShell";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

export default function TeamcodePage() {
  const router = useRouter();
  const supabase = createClient();

  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submitCode() {
    setError("");
    if (!code.trim()) {
      setError("Bitte gib einen Teamcode ein.");
      return;
    }
    setLoading(true);
    const { error: rpcError } = await supabase.rpc("submit_teamcode", { p_code: code.trim() });
    setLoading(false);
    if (rpcError) {
      setError("Code ungültig. Bitte erneut versuchen.");
      return;
    }
    router.push("/");
    router.refresh();
  }

  async function logout() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <IntroShell mood="pink">
      <div className={styles.iconCircle}>
        <Lock size={26} color="var(--tp-pink-deep)" strokeWidth={2} />
      </div>
      <div className={styles.title}>Teamcode erforderlich</div>
      <div className={styles.subtitle}>
        Ohne Teamcode ist die App noch leer. Frag deinen Trainer oder Admin nach dem Code für dein Team.
      </div>

      <div className={styles.card}>
        <Input
          label="Teamcode"
          placeholder="z. B. TP-GRUPPEA-26"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          error={error}
        />
        <Button variant="accent" size="lg" full onClick={submitCode} disabled={loading}>
          Bestätigen
        </Button>
      </div>

      <div className={styles.spacer}>
        <Button variant="ghost" size="sm" onClick={logout}>
          Abmelden
        </Button>
      </div>
    </IntroShell>
  );
}
