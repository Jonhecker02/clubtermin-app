import { NextResponse } from "next/server";
import webpush from "web-push";
import { createClient } from "@/lib/supabase/server";
import { isApnsConfigured, sendApnsNotification, shouldPruneApnsToken } from "@/lib/apns";
import { fullDateLabel, hhmm } from "@/lib/domain";

// Triggered client-side right after an admin creates a termin with "notify"
// checked. Push-only — email was dropped (Resend's sandbox mode without a
// verified domain only ever delivered to the account owner's own address
// anyway, so every termin was silently emailing just that one inbox).
export async function POST(request: Request) {
  const { termin_id } = (await request.json()) as { termin_id?: string };
  if (!termin_id) {
    return NextResponse.json({ error: "missing termin_id" }, { status: 400 });
  }

  const supabase = await createClient();

  const { data: termin, error: terminError } = await supabase
    .from("termine")
    .select("id, title, date, start_time, location, register_groups")
    .eq("id", termin_id)
    .single();
  if (terminError || !termin) {
    return NextResponse.json({ error: "termin_not_found" }, { status: 404 });
  }

  let shortCode: string | null = null;
  if (termin.register_groups.length === 1 && termin.register_groups[0] !== "all") {
    const { data: group } = await supabase
      .from("groups")
      .select("short_code")
      .eq("id", termin.register_groups[0])
      .single();
    shortCode = group?.short_code ?? null;
  }

  const appUrl = new URL(request.url).origin;
  const terminUrl = `${appUrl}/termine/${termin.id}`;
  const dateLabel = fullDateLabel(termin.date);
  const timeLabel = hhmm(termin.start_time);

  const payload = {
    title: shortCode ? `🗓️ Neuer Termin für Gruppe ${shortCode}` : "🗓️ Neuer Termin",
    body: `${termin.title} · ${dateLabel}, ${timeLabel} Uhr · ${termin.location}`,
    url: terminUrl,
  };

  let pushSent = 0;
  const vapidPublic = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const vapidPrivate = process.env.VAPID_PRIVATE_KEY;
  if (vapidPublic && vapidPrivate) {
    webpush.setVapidDetails("mailto:notifications@clubtermine-app.vercel.app", vapidPublic, vapidPrivate);

    const { data: subscriptions, error: subscriptionsError } = await supabase.rpc("get_termin_push_subscriptions", {
      p_termin_id: termin_id,
    });
    if (subscriptionsError) {
      return NextResponse.json({ error: subscriptionsError.message }, { status: 403 });
    }

    for (const sub of subscriptions ?? []) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(payload),
        );
        pushSent += 1;
      } catch (err) {
        const statusCode = (err as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await supabase.rpc("admin_delete_push_subscription", { p_endpoint: sub.endpoint });
        }
      }
    }
  }

  let apnsSent = 0;
  if (isApnsConfigured()) {
    const { data: tokens, error: tokensError } = await supabase.rpc("get_termin_apns_tokens", {
      p_termin_id: termin_id,
    });
    if (tokensError) {
      return NextResponse.json({ error: tokensError.message }, { status: 403 });
    }
    for (const { device_token } of tokens ?? []) {
      const result = await sendApnsNotification(device_token, payload);
      if (result.ok) {
        apnsSent += 1;
      } else if (shouldPruneApnsToken(result)) {
        await supabase.rpc("admin_delete_apns_token", { p_device_token: device_token });
      }
    }
  }

  return NextResponse.json({ pushSent, apnsSent });
}
