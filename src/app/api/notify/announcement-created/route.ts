import { NextResponse } from "next/server";
import webpush from "web-push";
import { createClient } from "@/lib/supabase/server";

// Triggered client-side right after an admin posts an announcement. Push-only
// (no email) — announcements are meant to be quick, and email delivery is
// deprioritized until the club has a verified sending domain. Both RPCs it
// calls are admin-gated server-side, so this can't be abused to spam
// arbitrary recipients even though it only forwards the caller's own cookies.
export async function POST(request: Request) {
  const { announcement_id } = (await request.json()) as { announcement_id?: string };
  if (!announcement_id) {
    return NextResponse.json({ error: "missing announcement_id" }, { status: 400 });
  }

  const supabase = await createClient();

  const { data: announcement, error: announcementError } = await supabase
    .from("announcements")
    .select("id, content, visible_groups")
    .eq("id", announcement_id)
    .single();
  if (announcementError || !announcement) {
    return NextResponse.json({ error: "announcement_not_found" }, { status: 404 });
  }

  let shortCode: string | null = null;
  if (announcement.visible_groups.length === 1 && announcement.visible_groups[0] !== "all") {
    const { data: group } = await supabase.from("groups").select("short_code").eq("id", announcement.visible_groups[0]).single();
    shortCode = group?.short_code ?? null;
  }
  const title = shortCode ? `${shortCode} · Ankündigung` : "Ankündigung";

  let pushSent = 0;
  const vapidPublic = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const vapidPrivate = process.env.VAPID_PRIVATE_KEY;
  if (vapidPublic && vapidPrivate) {
    webpush.setVapidDetails("mailto:notifications@the-padellers-app.vercel.app", vapidPublic, vapidPrivate);

    const { data: subscriptions, error: subsError } = await supabase.rpc("get_announcement_push_subscriptions", {
      p_announcement_id: announcement_id,
    });
    if (subsError) {
      return NextResponse.json({ error: subsError.message }, { status: 403 });
    }

    const appUrl = new URL(request.url).origin;
    const payload = JSON.stringify({
      title,
      body: announcement.content.length > 140 ? `${announcement.content.slice(0, 140)}…` : announcement.content,
      url: `${appUrl}/chat`,
    });

    for (const sub of subscriptions ?? []) {
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload);
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
