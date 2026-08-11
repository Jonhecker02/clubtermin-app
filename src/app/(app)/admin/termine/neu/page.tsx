"use client";

import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";
import { PageBody } from "@/components/layout/PageBody";
import { IconButton } from "@/components/ui/IconButton";
import { TerminForm, type TerminFormValues } from "@/components/admin/TerminForm";
import { createClient } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/queries/keys";
import styles from "@/components/admin/AdminList.module.css";

export default function NeuerTerminPage() {
  const router = useRouter();
  const queryClient = useQueryClient();

  async function handleSubmit(values: TerminFormValues) {
    const supabase = createClient();
    const { data, error } = await supabase.from("termine").insert(values).select("id").single();
    if (error) return "Termin konnte nicht gespeichert werden. Bitte versuche es erneut.";

    if (values.notify_create) {
      // Fire-and-forget: a failed send shouldn't block the "termin created" flow.
      fetch("/api/notify/termin-created", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ termin_id: data.id }),
      }).catch(() => {});
    }

    await queryClient.invalidateQueries({ queryKey: queryKeys.termine });
    router.push(`/admin/termine?created=${encodeURIComponent(values.title)}&notified=${values.notify_create ? "1" : "0"}`);
  }

  return (
    <>
      <AppHeader title="Neuer Termin" />
      <PageBody>
        <div className={styles.backRow}>
          <IconButton variant="soft" label="Zurück" size="sm" onClick={() => router.push("/admin/termine")}>
            <ArrowLeft size={16} strokeWidth={2.5} />
          </IconButton>
          <span className={styles.backTitle}>Neuer Termin</span>
        </div>

        <TerminForm submitLabel="Termin erstellen" onSubmit={handleSubmit} />
      </PageBody>
    </>
  );
}
