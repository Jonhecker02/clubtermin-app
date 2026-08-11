import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import type { Database } from "@/types/database";
import { buildIcs } from "@/lib/ical";

// Public, unauthenticated feed for calendar apps (Apple Calendar, Google
// Calendar, ...) to poll on their own schedule — the token in the URL is the
// only credential, see get_ical_events() in supabase/migrations/0001_init.sql.
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const supabase = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  const { data, error } = await supabase.rpc("get_ical_events", { p_token: token });

  if (error || !data) {
    return new NextResponse("Not found", { status: 404 });
  }

  return new NextResponse(buildIcs(data), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="the-padellers.ics"',
      "Cache-Control": "no-store",
    },
  });
}
