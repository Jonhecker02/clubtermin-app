"use client";

import { useParams, useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";
import { PageBody } from "@/components/layout/PageBody";
import { IconButton } from "@/components/ui/IconButton";
import { TerminForm, type TerminFormValues } from "@/components/admin/TerminForm";
import { useTermine } from "@/lib/queries/useTermine";
import { createClient } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/queries/keys";
import styles from "@/components/admin/AdminList.module.css";

export default function TerminBearbeitenPage() {
  const params = useParams<{ id: string }>();
  const terminId = params.id;
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: termine = [] } = useTermine();
  const termin = termine.find((t) => t.id === terminId);

  async function handleSubmit(values: TerminFormValues) {
    const supabase = createClient();
    // Reset the "opened" push flag if the schedule actually changed, so a
    // pushed-back opening time notifies again instead of staying suppressed
    // by the earlier notification.
    const openingChanged =
      values.registration_opens_date !== (termin?.registration_opens_date ?? null) ||
      values.registration_opens_time !== (termin?.registration_opens_time ?? null);
    const payload = openingChanged ? { ...values, registration_opened_notified: false } : values;
    const { error } = await supabase.from("termine").update(payload).eq("id", terminId);
    if (error) return "Termin konnte nicht gespeichert werden. Bitte versuche es erneut.";

    await queryClient.invalidateQueries({ queryKey: queryKeys.termine });
    router.push(`/admin/termine/${terminId}`);
  }

  return (
    <>
      <AppHeader title="Termin bearbeiten" />
      <PageBody>
        <div className={styles.backRow}>
          <IconButton variant="soft" label="Zurück" size="sm" onClick={() => router.push(`/admin/termine/${terminId}`)}>
            <ArrowLeft size={16} strokeWidth={2.5} />
          </IconButton>
          <span className={styles.backTitle}>Termin bearbeiten</span>
        </div>

        {termin ? (
          <TerminForm initial={termin} submitLabel="Änderungen speichern" onSubmit={handleSubmit} />
        ) : (
          <div className={styles.empty}>Termin wird geladen…</div>
        )}
      </PageBody>
    </>
  );
}
