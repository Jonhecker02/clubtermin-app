"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Clock, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { IntroShell, introStyles as styles } from "@/components/layout/IntroShell";
import { Button } from "@/components/ui/Button";

export default function PendingPage() {
  const router = useRouter();
  const [supabase] = useState(() => createClient());
  const [status, setStatus] = useState<"pending" | "rejected" | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;

    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase.from("profiles").select("status").eq("id", user.id).single();
      if (profile) setStatus(profile.status === "rejected" ? "rejected" : "pending");
      setLoading(false);

      channel = supabase
        .channel(`profile-${user.id}`)
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${user.id}` },
          (payload) => {
            const next = payload.new as { status: string | null };
            if (next.status === "approved") {
              router.push("/termine");
              router.refresh();
              return;
            }
            setStatus(next.status === "rejected" ? "rejected" : "pending");
          },
        )
        .subscribe();
    }

    load();
    return () => {
      if (channel) supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function resubmit() {
    await supabase.rpc("resubmit_request");
    setStatus("pending");
  }

  async function logout() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  if (loading) return <IntroShell>{null}</IntroShell>;

  return (
    <IntroShell>
      {status === "pending" && (
        <>
          <div className={styles.iconCircle}>
            <Clock size={26} color="var(--tp-pink-deep)" strokeWidth={2} />
          </div>
          <div className={styles.title}>Anfrage wird geprüft</div>
          <div className={styles.subtitle}>
            Deine Registrierung wartet auf Bestätigung durch deinen Trainer oder Clubmanager. Sobald du einer
            Mannschaft zugeordnet bist, hast du Zugriff auf die App.
          </div>
        </>
      )}
      {status === "rejected" && (
        <>
          <div className={styles.iconCircle}>
            <X size={26} color="var(--tp-danger)" strokeWidth={2} />
          </div>
          <div className={styles.title}>Anfrage abgelehnt</div>
          <div className={styles.subtitle}>
            Deine Registrierung wurde nicht bestätigt. Wende dich an deinen Trainer oder Clubmanager, oder versuche
            es erneut.
          </div>
          <Button variant="accent" size="lg" full onClick={resubmit}>
            Erneut anfragen
          </Button>
        </>
      )}
      <div className={styles.spacer}>
        <Button variant="ghost" size="sm" onClick={logout}>
          Abmelden
        </Button>
      </div>
    </IntroShell>
  );
}
