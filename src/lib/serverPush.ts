import webpush from "web-push";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { isApnsConfigured, sendApnsNotification, shouldPruneApnsToken, type ApnsPayload } from "@/lib/apns";

// Sends one payload to every device of the given users (web push + APNs) and
// drops subscriptions the push services report as gone.
export async function sendPushToUsers(
  service: SupabaseClient<Database>,
  userIds: string[],
  payload: ApnsPayload,
): Promise<{ pushSent: number; apnsSent: number }> {
  let pushSent = 0;
  let apnsSent = 0;
  if (userIds.length === 0) return { pushSent, apnsSent };

  const vapidPublic = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const vapidPrivate = process.env.VAPID_PRIVATE_KEY;
  if (vapidPublic && vapidPrivate) {
    webpush.setVapidDetails("mailto:notifications@clubtermine-app.vercel.app", vapidPublic, vapidPrivate);
    const { data: subs } = await service.from("push_subscriptions").select("endpoint, p256dh, auth").in("user_id", userIds);
    for (const sub of subs ?? []) {
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify(payload));
        pushSent += 1;
      } catch (err) {
        const statusCode = (err as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await service.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
        }
      }
    }
  }

  if (isApnsConfigured()) {
    const { data: targets } = await service.rpc("get_apns_tokens_for_users", { p_user_ids: userIds });
    for (const { device_token } of targets ?? []) {
      const result = await sendApnsNotification(device_token, payload);
      if (result.ok) apnsSent += 1;
      else if (shouldPruneApnsToken(result)) await service.from("apns_tokens").delete().eq("device_token", device_token);
    }
  }
  return { pushSent, apnsSent };
}
