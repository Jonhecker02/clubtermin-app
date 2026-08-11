"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";
import { PageBody } from "@/components/layout/PageBody";
import { IconButton } from "@/components/ui/IconButton";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { queryKeys } from "@/lib/queries/keys";
import { createClient } from "@/lib/supabase/client";
import adminStyles from "@/components/admin/AdminList.module.css";

export default function NeueGruppePage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [shortCode, setShortCode] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!name.trim()) {
      setError("Bitte gib einen Gruppennamen ein.");
      return;
    }
    setSaving(true);
    setError("");
    const supabase = createClient();
    const { error: rpcError } = await supabase.rpc("create_group", {
      p_name: name.trim(),
      p_short_code: shortCode.trim() || null,
    });
    setSaving(false);
    if (rpcError) {
      setError("Gruppe konnte nicht erstellt werden.");
      return;
    }
    await queryClient.invalidateQueries({ queryKey: queryKeys.groups });
    router.push("/admin/gruppen");
  }

  return (
    <>
      <AppHeader title="Neue Gruppe" />
      <PageBody>
        <div className={adminStyles.backRow}>
          <IconButton variant="soft" label="Zurück" size="sm" onClick={() => router.push("/admin/gruppen")}>
            <ArrowLeft size={16} strokeWidth={2.5} />
          </IconButton>
          <span className={adminStyles.backTitle}>Neue Gruppe</span>
        </div>

        <div className={adminStyles.form}>
          <Input
            label="Gruppenname"
            placeholder="z. B. Trainingsgruppe C"
            value={name}
            onChange={(e) => setName(e.target.value)}
            helper="Der Teamcode wird automatisch erzeugt."
          />
          <Input
            label="Kürzel (optional)"
            placeholder="z. B. H00"
            value={shortCode}
            onChange={(e) => setShortCode(e.target.value)}
            helper="Wird bei Terminen und Push-Benachrichtigungen vorangestellt."
          />
          {error && <div className={adminStyles.error}>{error}</div>}
          <Button variant="accent" size="lg" full onClick={submit} disabled={saving}>
            Gruppe erstellen
          </Button>
        </div>
      </PageBody>
    </>
  );
}
