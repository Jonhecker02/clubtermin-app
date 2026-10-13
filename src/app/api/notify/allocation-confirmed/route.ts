import { NextResponse } from "next/server";
import webpush from "web-push";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { isApnsConfigured, sendApnsNotification, shouldPruneApnsToken, type ApnsPayload } from "@/lib/apns";
import { makeLabelResolver } from "@/lib/pushLabel";
import { pushText } from "@/lib/pushText";

// Triggered client-side after an admin clicks "Zuteilung bestätigen" on a
// termin whose fair-rotation allocation is proposed but not yet applied.
// Mirrors delete-account's auth pattern: caller-role check on the regular
// client first, service role only for confirm_termin_allocation() itself
// (which hands back raw push_subscriptions secrets, so it never runs as
// the calling admin — same reasoning as claim_due_allocations before it).
export async function POST(request: Request) {
  const { termin_id } = (await request.json()) as { termin_id?: string };
  if (!termin_id) {
    return NextResponse.json({ error: "missing_termin_id" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  const { data: callerProfile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!callerProfile || !["owner", "trainer", "captain"].includes(callerProfile.role)) {
    return NextResponse.json({ error: "not_authorized" }, { status: 403 });
  }

  const service = createServiceRoleClient();
  const { data: allocations, error } = await service.rpc("confirm_termin_allocation", { p_termin_id: termin_id });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Every row shares the same termin_id (confirm is scoped to one termin),
  // so this is a single lookup — gives each waitlisted player their real
  // nachrück-position (fairness-ordered, not just registration order) to
  // put in their notification instead of a bare "you're on the waitlist".
  const { data: waitlistRankRows } = await service.rpc("get_waitlist_rank", { p_termin_id: termin_id });
  const waitlistRankByUser = new Map((waitlistRankRows ?? []).map((r) => [r.user_id, r.rank_order]));

  // Rank/last-participation facts stored by the allocation run — what the
  // waitlist notification quotes as the concrete reason.
  const { data: allocationRows } = await service
    .from("registration_allocations")
    .select("user_id, rank_order, applicant_count, last_participation, never_participated")
    .eq("termin_id", termin_id);
  const allocationByUser = new Map((allocationRows ?? []).map((r) => [r.user_id, r]));

  let pushSent = 0;
  let apnsSent = 0;
  const vapidPublic = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const vapidPrivate = process.env.VAPID_PRIVATE_KEY;
  if (vapidPublic && vapidPrivate) {
    webpush.setVapidDetails("mailto:notifications@clubtermine-app.vercel.app", vapidPublic, vapidPrivate);
  }

  const labelFor = makeLabelResolver(service);

  type DecisionRow = NonNullable<typeof allocations>[number];
  async function payloadFor(row: DecisionRow): Promise<ApnsPayload> {
    const base = {
      label: await labelFor(row),
      date: row.date,
      startTime: row.start_time,
      terminId: row.termin_id,
    };
    const message =
      row.final_status === "angemeldet"
        ? pushText.allocationIn(base)
        : pushText.allocationWaitlist({
            ...base,
            waitlistPlace: waitlistRankByUser.get(row.user_id) ?? null,
            rank: allocationByUser.get(row.user_id)?.rank_order ?? null,
            applicants: allocationByUser.get(row.user_id)?.applicant_count ?? null,
            lastParticipation: allocationByUser.get(row.user_id)?.last_participation ?? null,
            neverParticipated: allocationByUser.get(row.user_id)?.never_participated ?? false,
          });
    return { ...message, url: `/termine/${row.termin_id}` };
  }

  if (vapidPublic && vapidPrivate) {
    for (const row of allocations ?? []) {
      if (!row.endpoint || !row.p256dh || !row.auth) continue;
      const payload = JSON.stringify(await payloadFor(row));
      try {
        await webpush.sendNotification({ endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } }, payload);
        pushSent += 1;
      } catch (err) {
        const statusCode = (err as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await service.from("push_subscriptions").delete().eq("endpoint", row.endpoint);
        }
      }
    }
  }

  if (isApnsConfigured()) {
    const rowByUser = new Map((allocations ?? []).map((r) => [r.user_id, r]));
    const userIds = [...rowByUser.keys()];
    const { data: apnsTargets } = await service.rpc("get_apns_tokens_for_users", { p_user_ids: userIds });
    for (const { user_id, device_token } of apnsTargets ?? []) {
      const row = rowByUser.get(user_id);
      if (!row) continue;
      const result = await sendApnsNotification(device_token, await payloadFor(row));
      if (result.ok) {
        apnsSent += 1;
      } else if (shouldPruneApnsToken(result)) {
        await service.from("apns_tokens").delete().eq("device_token", device_token);
      }
    }
  }

  return NextResponse.json({ confirmed: allocations?.length ?? 0, pushSent, apnsSent });
}
