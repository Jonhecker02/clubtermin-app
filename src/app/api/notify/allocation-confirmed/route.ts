import { NextResponse } from "next/server";
import webpush from "web-push";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { isApnsConfigured, sendApnsNotification, shouldPruneApnsToken, type ApnsPayload } from "@/lib/apns";
import { hhmm } from "@/lib/domain";

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

  let pushSent = 0;
  let apnsSent = 0;
  const vapidPublic = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const vapidPrivate = process.env.VAPID_PRIVATE_KEY;
  if (vapidPublic && vapidPrivate) {
    webpush.setVapidDetails("mailto:notifications@clubtermine-app.vercel.app", vapidPublic, vapidPrivate);
  }

  const shortCodeCache = new Map<string, string | null>();
  async function labelFor(row: { termin_id: string; title: string; register_groups: string[] }) {
    if (!shortCodeCache.has(row.termin_id)) {
      let shortCode: string | null = null;
      if (row.register_groups.length === 1 && row.register_groups[0] !== "all") {
        const { data: group } = await service.from("groups").select("short_code").eq("id", row.register_groups[0]).single();
        shortCode = group?.short_code ?? null;
      }
      shortCodeCache.set(row.termin_id, shortCode);
    }
    return shortCodeCache.get(row.termin_id) ? `${shortCodeCache.get(row.termin_id)} · ${row.title}` : row.title;
  }

  function bodyFor(row: { user_id: string; final_status: string; start_time: string; quote: number | null }, label: string): string {
    if (row.final_status === "angemeldet") {
      return `${label} — du bist dabei (${hhmm(row.start_time)} Uhr).`;
    }
    const rank = waitlistRankByUser.get(row.user_id);
    const rankNote = rank ? ` (Platz ${rank})` : "";
    // row.quote is this player's own fairness quote from the allocation run
    // (registration_allocations.quote) — the concrete "why", not just "you
    // didn't make it": other players simply had a higher recent quote.
    const reasonNote = row.quote != null ? ` Deine Anmeldequote lag zuletzt bei ${Math.round(row.quote * 100)}%.` : "";
    return `${label} — du stehst aktuell auf der Warteliste${rankNote} (${hhmm(row.start_time)} Uhr).${reasonNote}`;
  }

  if (vapidPublic && vapidPrivate) {
    for (const row of allocations ?? []) {
      if (!row.endpoint || !row.p256dh || !row.auth) continue;
      const label = await labelFor(row);
      const confirmed = row.final_status === "angemeldet";
      const payload = JSON.stringify({
        title: confirmed ? "Deine Anmeldung wurde final zugeteilt! 🎉" : "Zuteilung abgeschlossen",
        body: bodyFor(row, label),
        url: `/termine/${row.termin_id}`,
      });
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
      const label = await labelFor(row);
      const confirmed = row.final_status === "angemeldet";
      const payload: ApnsPayload = {
        title: confirmed ? "Deine Anmeldung wurde final zugeteilt! 🎉" : "Zuteilung abgeschlossen",
        body: bodyFor(row, label),
        url: `/termine/${row.termin_id}`,
      };
      const result = await sendApnsNotification(device_token, payload);
      if (result.ok) {
        apnsSent += 1;
      } else if (shouldPruneApnsToken(result)) {
        await service.from("apns_tokens").delete().eq("device_token", device_token);
      }
    }
  }

  return NextResponse.json({ confirmed: allocations?.length ?? 0, pushSent, apnsSent });
}
