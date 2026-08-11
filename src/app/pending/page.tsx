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
  const [groupName, setGroupName] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;

    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from("profiles")
        .select("status, group_id")
        .eq("id", user.id)
        .single();

      if (profile) {
        let name = "";
        if (profile.group_id) {
          const { data: group } = await supabase.from("groups").select("name").eq("id", profile.group_id).single();
          name = group?.name ?? "";
        }
        applyProfile(profile.status, name);
      }
      setLoading(false);

      channel = supabase
        .channel(`profile-${user.id}`)
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${user.id}` },
          async (payload) => {
            const next = payload.new as { status: string | null; group_id: string | null };
            if (next.status === "approved") {
              router.push("/termine");
              router.refresh();
              return;
            }
            let name = "";
            if (next.group_id) {
              const { data: group } = await supabase.from("groups").select("name").eq("id", next.group_id).single();
              name = group?.name ?? "";
            }
            applyProfile(next.status as "pending" | "rejected" | null, name);
          },
        )
        .subscribe();
    }

    function applyProfile(s: string | null, name: string) {
      setStatus(s === "rejected" ? "rejected" : "pending");
      setGroupName(name);
    }

    load();
    return () => {
      if (channel) supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function retryCode() {
    await supabase.rpc("retry_code");
    router.push("/teamcode");
    router.refresh();
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
            Deine Anfrage für <strong>{groupName}</strong> wartet auf Bestätigung durch den Admin. Sobald sie
            bestätigt ist, hast du Zugriff auf die App.
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
            Deine Anfrage für <strong>{groupName}</strong> wurde nicht bestätigt. Prüfe deinen Teamcode oder wende
            dich an deinen Trainer.
          </div>
          <Button variant="accent" size="lg" full onClick={retryCode}>
            Anderen Code eingeben
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
