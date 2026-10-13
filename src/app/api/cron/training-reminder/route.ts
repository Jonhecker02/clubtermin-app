import { NextResponse } from "next/server";
import webpush from "web-push";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { isApnsConfigured, sendApnsNotification, shouldPruneApnsToken, type ApnsPayload } from "@/lib/apns";
import { makeLabelResolver } from "@/lib/pushLabel";
import { pushText } from "@/lib/pushText";

// Hit every ~10min by a Supabase pg_cron job (see supabase/migrations/0001_init.sql
// for the RPCs and README/chat instructions for the cron.schedule setup) —
// no user session at all, so it's gated by a shared secret instead of RLS.
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();
  const supabase = createServiceRoleClient();
  const labelFor = makeLabelResolver(supabase);
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
    const { data: place } = await supabase.from("termine").select("location, courts").eq("id", termin.termin_id).single();
    const payload: ApnsPayload = {
      ...pushText.reminder({
        label: await labelFor(termin),
        startTime: termin.start_time,
        location: place?.location || null,
        courts: place?.courts || null,
        terminId: termin.termin_id,
      }),
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
  async function openedPayload(row: NonNullable<typeof opened>[number]): Promise<ApnsPayload> {
    return {
      ...pushText.registrationOpen({
        label: await labelFor(row),
        date: row.date,
        startTime: row.start_time,
        terminId: row.termin_id,
      }),
      url: `/termine/${row.termin_id}`,
    };
  }

  if (vapidPublic && vapidPrivate) {
    for (const row of opened ?? []) {
      if (!row.endpoint || !row.p256dh || !row.auth) continue;

      const payload = JSON.stringify(await openedPayload(row));

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
      const result = await sendApnsNotification(device_token, await openedPayload(row));
      if (result.ok) {
        registrationApnsSent += 1;
      } else if (shouldPruneApnsToken(result)) {
        await supabase.from("apns_tokens").delete().eq("device_token", device_token);
      }
    }
  }

  // Only proposes — writes the registration_allocations explanation log and
  // stops there. Nothing becomes final until an admin reviews it in the
  // termin and taps "Zuteilung bestätigen" (see /api/notify/allocation-confirmed).
  const { error: allocationsError } = await supabase.rpc("claim_due_allocations");
  if (allocationsError) {
    return NextResponse.json({ error: allocationsError.message }, { status: 500 });
  }

  // The admins are the ones waiting on a proposal, so they get the push —
  // without it nobody would know a Saturday-night deadline had passed.
  // Recipients: whoever created the termin, its trainer, and the team's
  // captain; if that yields nobody, the owner(s) as a fallback.
  // 30s of margin covers clock drift between this server and the database;
  // the 10-minute cadence means a proposal can never fall in two windows.
  const proposedSince = new Date(startedAt - 30_000).toISOString();
  const { data: proposed } = await supabase
    .from("termine")
    .select("id, title, date, start_time, register_groups, trainer_id, created_by")
    .gte("allocation_proposed_at", proposedSince)
    .is("allocation_run_at", null);

  let proposalPushSent = 0;
  let proposalApnsSent = 0;
  if ((proposed ?? []).length > 0) {
    const { data: admins } = await supabase.from("profiles").select("id, role, group_id").in("role", ["owner", "trainer", "captain"]);
    for (const termin of proposed ?? []) {
      const { count } = await supabase
        .from("registration_allocations")
        .select("id", { count: "exact", head: true })
        .eq("termin_id", termin.id);
      if (!count) continue;

      const teamId = termin.register_groups.length === 1 && termin.register_groups[0] !== "all" ? termin.register_groups[0] : null;
      const responsible = (admins ?? []).filter(
        (a) => a.id === termin.created_by || a.id === termin.trainer_id || (a.role === "captain" && teamId && a.group_id === teamId),
      );
      const recipients = (responsible.length > 0 ? responsible : (admins ?? []).filter((a) => a.role === "owner")).map((a) => a.id);
      if (recipients.length === 0) continue;

      const payload: ApnsPayload = {
        ...pushText.allocationReady({
          label: await labelFor(termin),
          date: termin.date,
          startTime: termin.start_time,
          terminId: termin.id,
        }),
        url: `/admin/termine/${termin.id}`,
      };

      if (vapidPublic && vapidPrivate) {
        const { data: subs } = await supabase.from("push_subscriptions").select("endpoint, p256dh, auth").in("user_id", recipients);
        for (const sub of subs ?? []) {
          try {
            await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify(payload));
            proposalPushSent += 1;
          } catch (err) {
            const statusCode = (err as { statusCode?: number }).statusCode;
            if (statusCode === 404 || statusCode === 410) {
              await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
            }
          }
        }
      }
      if (apnsConfigured) {
        const { data: apnsTargets } = await supabase.rpc("get_apns_tokens_for_users", { p_user_ids: recipients });
        for (const { device_token } of apnsTargets ?? []) {
          const result = await sendApnsNotification(device_token, payload);
          if (result.ok) {
            proposalApnsSent += 1;
          } else if (shouldPruneApnsToken(result)) {
            await supabase.from("apns_tokens").delete().eq("device_token", device_token);
          }
        }
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
    proposalPushSent,
    proposalApnsSent,
  });
}
