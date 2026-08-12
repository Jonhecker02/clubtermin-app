import { NextResponse } from "next/server";
import webpush from "web-push";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { isApnsConfigured, sendApnsNotification, shouldPruneApnsToken, type ApnsPayload } from "@/lib/apns";
import type { WaitlistPromotionPush } from "@/types/database";

function buildPayload(promo: WaitlistPromotionPush): ApnsPayload {
  return {
    title: "⚡️ Du bist nachgerückt!",
    body: "Schaue jetzt rein und trage dir den Termin ein!",
    url: `/termine/${promo.termin_id}`,
  };
}

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
    webpush.setVapidDetails("mailto:notifications@clubtermine-app.vercel.app", vapidPublic, vapidPrivate);

    for (const promo of promotions ?? []) {
      if (!promo.endpoint || !promo.p256dh || !promo.auth) continue;

      try {
        await webpush.sendNotification(
          { endpoint: promo.endpoint, keys: { p256dh: promo.p256dh, auth: promo.auth } },
          JSON.stringify(buildPayload(promo)),
        );
        pushSent += 1;
      } catch (err) {
        const statusCode = (err as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await service.from("push_subscriptions").delete().eq("endpoint", promo.endpoint);
        }
      }
    }
  }

  let apnsSent = 0;
  if (isApnsConfigured()) {
    const userIds = [...new Set((promotions ?? []).map((p) => p.user_id))];
    const byUser = new Map((promotions ?? []).map((p) => [p.user_id, p]));
    const { data: apnsTargets } = await service.rpc("get_apns_tokens_for_users", { p_user_ids: userIds });
    for (const { user_id, device_token } of apnsTargets ?? []) {
      const promo = byUser.get(user_id);
      if (!promo) continue;
      const result = await sendApnsNotification(device_token, buildPayload(promo));
      if (result.ok) {
        apnsSent += 1;
      } else if (shouldPruneApnsToken(result)) {
        await service.from("apns_tokens").delete().eq("device_token", device_token);
      }
    }
  }

  return NextResponse.json({ promotions: promotions?.length ?? 0, pushSent, apnsSent });
}
