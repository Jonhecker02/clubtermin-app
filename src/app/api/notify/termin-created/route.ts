import { NextResponse } from "next/server";
import webpush from "web-push";
import { createClient } from "@/lib/supabase/server";
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
  const terminLabel = shortCode ? `${shortCode} · ${termin.title}` : termin.title;

  const appUrl = new URL(request.url).origin;
  const terminUrl = `${appUrl}/termine/${termin.id}`;
  const dateLabel = fullDateLabel(termin.date);
  const timeLabel = hhmm(termin.start_time);

  let pushSent = 0;
  const vapidPublic = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const vapidPrivate = process.env.VAPID_PRIVATE_KEY;
  if (vapidPublic && vapidPrivate) {
    webpush.setVapidDetails("mailto:notifications@the-padellers-app.vercel.app", vapidPublic, vapidPrivate);

    const { data: subscriptions, error: subscriptionsError } = await supabase.rpc("get_termin_push_subscriptions", {
      p_termin_id: termin_id,
    });
    if (subscriptionsError) {
      return NextResponse.json({ error: subscriptionsError.message }, { status: 403 });
    }

    const payload = JSON.stringify({
      title: `Neuer Termin: ${terminLabel}`,
      body: `${dateLabel}, ${timeLabel} Uhr · ${termin.location}`,
      url: terminUrl,
    });

    for (const sub of subscriptions ?? []) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload,
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

  return NextResponse.json({ pushSent });
}
