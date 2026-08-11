import { NextResponse } from "next/server";
import webpush from "web-push";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { fullDateLabel, hhmm } from "@/lib/domain";

// Triggered client-side (fire-and-forget) right after cancel_registration,
// admin_remove_participant, or remove_group_member — any of which can free up
// a confirmed spot and promote someone off the waitlist. Any signed-in user
// may call this (it only drains whatever's genuinely pending, nothing
// caller-targeted), but the actual DB read/writes run through the service
// role so push subscription secrets never pass through a client-callable RPC.
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  const service = createServiceRoleClient();
  const { data: promotions, error } = await service.rpc("claim_waitlist_promotions");
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let pushSent = 0;
  const vapidPublic = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const vapidPrivate = process.env.VAPID_PRIVATE_KEY;
  if (vapidPublic && vapidPrivate) {
    webpush.setVapidDetails("mailto:notifications@the-padellers-app.vercel.app", vapidPublic, vapidPrivate);

    for (const promo of promotions ?? []) {
      if (!promo.endpoint || !promo.p256dh || !promo.auth) continue;

      let shortCode: string | null = null;
      if (promo.register_groups.length === 1 && promo.register_groups[0] !== "all") {
        const { data: group } = await service.from("groups").select("short_code").eq("id", promo.register_groups[0]).single();
        shortCode = group?.short_code ?? null;
      }
      const label = shortCode ? `${shortCode} · ${promo.title}` : promo.title;

      const payload = JSON.stringify({
        title: "Du bist nachgerückt! 🎉",
        body: `Ein Platz ist frei geworden — du bist jetzt für ${label} angemeldet (${fullDateLabel(promo.date)}, ${hhmm(promo.start_time)} Uhr).`,
        url: `/termine/${promo.termin_id}`,
      });

      try {
        await webpush.sendNotification({ endpoint: promo.endpoint, keys: { p256dh: promo.p256dh, auth: promo.auth } }, payload);
        pushSent += 1;
      } catch (err) {
        const statusCode = (err as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await service.from("push_subscriptions").delete().eq("endpoint", promo.endpoint);
        }
      }
    }
  }

  return NextResponse.json({ promotions: promotions?.length ?? 0, pushSent });
}
