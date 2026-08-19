import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { isApnsConfigured, sendApnsNotification } from "@/lib/apns";

// Temporary diagnostic route — remove after debugging the APNs send failure.
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (!isApnsConfigured()) {
    return NextResponse.json({ error: "apns_not_configured" }, { status: 500 });
  }

  const service = createServiceRoleClient();
  const { data: tokens, error } = await service.from("apns_tokens").select("device_token, created_at").order("created_at", { ascending: false }).limit(1);
  if (error || !tokens?.length) {
    return NextResponse.json({ error: "no_token_found", detail: error?.message }, { status: 404 });
  }

  const deviceToken = tokens[0].device_token;
  try {
    const result = await sendApnsNotification(deviceToken, {
      title: "🔧 Test-Push",
      body: "Diagnose-Nachricht",
      url: "/profil",
    });
    return NextResponse.json({ deviceTokenPrefix: deviceToken.slice(0, 12), result });
  } catch (err) {
    return NextResponse.json({ error: "send_threw", detail: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
