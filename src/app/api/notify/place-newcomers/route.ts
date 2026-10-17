import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { makeLabelResolver } from "@/lib/pushLabel";
import { pushText } from "@/lib/pushText";
import { placeNewcomers } from "@/lib/newcomerPlacement";
import { sendPushToUsers } from "@/lib/serverPush";

// Called (fire-and-forget) after anything that changes who is confirmed for a
// termin: a registration, a cancellation, a waitlist promotion, a manual add
// or removal. If the termin already has court groups, newcomers are put into
// the court that fits best and the Clubmanager gets a push to check it. Safe
// for any signed-in user to call — it only brings the groups in line with the
// registrations that already exist, and does nothing when there is nothing to
// do.
export async function POST(request: Request) {
  const { termin_id } = (await request.json()) as { termin_id?: string };
  if (!termin_id) {
    return NextResponse.json({ error: "missing termin_id" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  const service = createServiceRoleClient();
  const result = await placeNewcomers(service, termin_id);

  let pushSent = 0;
  if (result.placed.length > 0 || result.unplaced.length > 0) {
    const { data: termin } = await service
      .from("termine")
      .select("id, title, date, start_time, register_groups")
      .eq("id", termin_id)
      .single();
    const { data: owners } = await service.from("profiles").select("id").eq("role", "owner");
    // SKIP_OWNER_PUSH=1 is a safety switch for local tests against the real
    // database, so they never ping the real Clubmanager.
    if (termin && owners && owners.length > 0 && process.env.SKIP_OWNER_PUSH !== "1") {
      const labelFor = makeLabelResolver(service);
      const payload = {
        ...pushText.newcomersPlaced({
          label: await labelFor(termin),
          date: termin.date,
          startTime: termin.start_time,
          terminId: termin.id,
          placed: result.placed.map((p) => ({ name: p.name, groupLabel: p.groupLabel })),
          unplacedNames: result.unplaced.map((u) => u.name),
        }),
        url: `/admin/termine/${termin.id}`,
      };
      const sent = await sendPushToUsers(
        service,
        owners.map((o) => o.id),
        payload,
      );
      pushSent = sent.pushSent + sent.apnsSent;
    }
  }

  return NextResponse.json({ placed: result.placed.length, unplaced: result.unplaced.length, removed: result.removed, pushSent });
}
