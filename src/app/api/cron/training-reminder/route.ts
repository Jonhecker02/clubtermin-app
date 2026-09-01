import { NextResponse } from "next/server";
import webpush from "web-push";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { isApnsConfigured, sendApnsNotification, shouldPruneApnsToken, type ApnsPayload } from "@/lib/apns";
import { hhmm } from "@/lib/domain";

// Hit every ~10min by a Supabase pg_cron job (see supabase/migrations/0001_init.sql
// for the RPCs and README/chat instructions for the cron.schedule setup) —
// no user session at all, so it's gated by a shared secret instead of RLS.
const MESSAGES = [
  "🎾 Heute Abend gehts auf den Platz!",
  "🎾 Viel Spaß gleich beim Training!",
  "🎾 Schläger eingepackt? Bald geht's los! 🙌",
  "🎾 In 2 Stunden auf dem Court — bis gleich! 💪",
  "🎾 Zeit, sich warmzumachen — dein Training startet bald 🔥",
  "🎾 Auf geht's! Bald ist Anpfiff auf dem Court",
  "🎾 Nicht vergessen: gleich ist Training. Viel Spaß! 😄",
  "🎾 Bald startet's — schnapp dir deine Schläger!",
  "🎾 In Kürze geht's los — wir sehen uns auf dem Court!",
];

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createServiceRoleClient();
  const { data: dueTermine, error } = await supabase.rpc("claim_due_training_reminders");
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let pushSent = 0;
  let apnsSent = 0;
  const vapidPublic = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const vapidPrivate = process.env.VAPID_PRIVATE_KEY;
  if (vapidPublic && vapidPrivate) {
    webpush.setVapidDetails("mailto:notifications@clubtermine-app.vercel.app", vapidPublic, vapidPrivate);
  }
  const apnsConfigured = isApnsConfigured();

  for (const termin of dueTermine ?? []) {
    let shortCode: string | null = null;
    if (termin.register_groups.length === 1 && termin.register_groups[0] !== "all") {
      const { data: group } = await supabase.from("groups").select("short_code").eq("id", termin.register_groups[0]).single();
      shortCode = group?.short_code ?? null;
    }
    const label = shortCode ? `${shortCode} · ${termin.title}` : termin.title;
    const message = MESSAGES[Math.floor(Math.random() * MESSAGES.length)];

    const payload: ApnsPayload = {
      title: label,
      body: `${message} (${hhmm(termin.start_time)} Uhr)`,
      url: `/termine/${termin.termin_id}`,
    };

    if (vapidPublic && vapidPrivate) {
      const { data: subs } = await supabase.rpc("get_confirmed_push_subscriptions", { p_termin_id: termin.termin_id });
      for (const sub of subs ?? []) {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            JSON.stringify(payload),
          );
          pushSent += 1;
        } catch (err) {
          const statusCode = (err as { statusCode?: number }).statusCode;
          if (statusCode === 404 || statusCode === 410) {
            await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
          }
        }
      }
    }

    if (apnsConfigured) {
      const { data: apnsTargets } = await supabase.rpc("get_confirmed_apns_tokens", { p_termin_id: termin.termin_id });
      for (const { device_token } of apnsTargets ?? []) {
        const result = await sendApnsNotification(device_token, payload);
        if (result.ok) {
          apnsSent += 1;
        } else if (shouldPruneApnsToken(result)) {
          await supabase.from("apns_tokens").delete().eq("device_token", device_token);
        }
      }
    }
  }

  const { data: opened, error: openedError } = await supabase.rpc("claim_opened_registrations");
  if (openedError) {
    return NextResponse.json({ error: openedError.message }, { status: 500 });
  }

  let registrationPushSent = 0;
  let registrationApnsSent = 0;
  const shortCodeCache = new Map<string, string | null>();

  async function labelFor(row: { termin_id: string; title: string; register_groups: string[] }) {
    if (!shortCodeCache.has(row.termin_id)) {
      let shortCode: string | null = null;
      if (row.register_groups.length === 1 && row.register_groups[0] !== "all") {
        const { data: group } = await supabase.from("groups").select("short_code").eq("id", row.register_groups[0]).single();
        shortCode = group?.short_code ?? null;
      }
      shortCodeCache.set(row.termin_id, shortCode);
    }
    const shortCode = shortCodeCache.get(row.termin_id);
    return shortCode ? `${shortCode} · ${row.title}` : row.title;
  }

  if (vapidPublic && vapidPrivate) {
    for (const row of opened ?? []) {
      if (!row.endpoint || !row.p256dh || !row.auth) continue;

      const label = await labelFor(row);
      const payload = JSON.stringify({
        title: "Anmeldung ist jetzt offen! 🎉",
        body: `${label} — meld dich jetzt an (${hhmm(row.start_time)} Uhr).`,
        url: `/termine/${row.termin_id}`,
      });

      try {
        await webpush.sendNotification({ endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } }, payload);
        registrationPushSent += 1;
      } catch (err) {
        const statusCode = (err as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await supabase.from("push_subscriptions").delete().eq("endpoint", row.endpoint);
        }
      }
    }
  }

  if (apnsConfigured) {
    const userIds = [...new Set((opened ?? []).map((r) => r.user_id))];
    const byUser = new Map((opened ?? []).map((r) => [r.user_id, r]));
    const { data: apnsTargets } = await supabase.rpc("get_apns_tokens_for_users", { p_user_ids: userIds });
    for (const { user_id, device_token } of apnsTargets ?? []) {
      const row = byUser.get(user_id);
      if (!row) continue;
      const label = await labelFor(row);
      const payload: ApnsPayload = {
        title: "Anmeldung ist jetzt offen! 🎉",
        body: `${label} — meld dich jetzt an (${hhmm(row.start_time)} Uhr).`,
        url: `/termine/${row.termin_id}`,
      };
      const result = await sendApnsNotification(device_token, payload);
      if (result.ok) {
        registrationApnsSent += 1;
      } else if (shouldPruneApnsToken(result)) {
        await supabase.from("apns_tokens").delete().eq("device_token", device_token);
      }
    }
  }

  const { data: allocations, error: allocationsError } = await supabase.rpc("claim_due_allocations");
  if (allocationsError) {
    return NextResponse.json({ error: allocationsError.message }, { status: 500 });
  }

  let allocationPushSent = 0;
  let allocationApnsSent = 0;

  if (vapidPublic && vapidPrivate) {
    for (const row of allocations ?? []) {
      if (!row.endpoint || !row.p256dh || !row.auth) continue;

      const label = await labelFor(row);
      const confirmed = row.final_status === "angemeldet";
      const payload = JSON.stringify({
        title: confirmed ? "Deine Anmeldung wurde final zugeteilt! 🎉" : "Zuteilung abgeschlossen",
        body: confirmed
          ? `${label} — du bist dabei (${hhmm(row.start_time)} Uhr).`
          : `${label} — du stehst aktuell auf der Warteliste (${hhmm(row.start_time)} Uhr).`,
        url: `/termine/${row.termin_id}`,
      });

      try {
        await webpush.sendNotification({ endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } }, payload);
        allocationPushSent += 1;
      } catch (err) {
        const statusCode = (err as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await supabase.from("push_subscriptions").delete().eq("endpoint", row.endpoint);
        }
      }
    }
  }

  if (apnsConfigured) {
    const rowByUser = new Map((allocations ?? []).map((r) => [r.user_id, r]));
    const userIds = [...rowByUser.keys()];
    const { data: apnsTargets } = await supabase.rpc("get_apns_tokens_for_users", { p_user_ids: userIds });
    for (const { user_id, device_token } of apnsTargets ?? []) {
      const row = rowByUser.get(user_id);
      if (!row) continue;
      const label = await labelFor(row);
      const confirmed = row.final_status === "angemeldet";
      const payload: ApnsPayload = {
        title: confirmed ? "Deine Anmeldung wurde final zugeteilt! 🎉" : "Zuteilung abgeschlossen",
        body: confirmed
          ? `${label} — du bist dabei (${hhmm(row.start_time)} Uhr).`
          : `${label} — du stehst aktuell auf der Warteliste (${hhmm(row.start_time)} Uhr).`,
        url: `/termine/${row.termin_id}`,
      };
      const result = await sendApnsNotification(device_token, payload);
      if (result.ok) {
        allocationApnsSent += 1;
      } else if (shouldPruneApnsToken(result)) {
        await supabase.from("apns_tokens").delete().eq("device_token", device_token);
      }
    }
  }

  return NextResponse.json({
    processed: dueTermine?.length ?? 0,
    pushSent,
    apnsSent,
    registrationOpenedProcessed: new Set((opened ?? []).map((r) => r.termin_id)).size,
    registrationPushSent,
    registrationApnsSent,
    allocationsProcessed: new Set((allocations ?? []).map((r) => r.termin_id)).size,
    allocationPushSent,
    allocationApnsSent,
  });
}
