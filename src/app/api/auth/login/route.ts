import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { clientIp, isRateLimited, recordAttempt } from "@/lib/rateLimit";

// Failed logins allowed per address in the window before it is blocked.
const LOGIN_FAILS_LIMIT = 10;
const LOGIN_WINDOW_SECONDS = 15 * 60;

// Login by name instead of email. Resolves name -> email server-side via the
// service role and never sends the email to the client — a public RPC doing
// that same lookup would leak real email addresses (for self-registered
// accounts that have one) to any anonymous caller who just knows a name.
// The actual sign-in runs on a cookie-bound server client, so the resulting
// session lands in the response as Set-Cookie the same way it would from a
// direct client-side signInWithPassword call.
export async function POST(request: Request) {
  const { name, password } = (await request.json()) as { name?: string; password?: string };
  if (!name?.trim() || !password) {
    return NextResponse.json({ error: "invalid_credentials" }, { status: 401 });
  }

  const service = createServiceRoleClient();
  const limitKey = `login:${clientIp(request)}`;
  if (await isRateLimited(service, limitKey, LOGIN_FAILS_LIMIT, LOGIN_WINDOW_SECONDS)) {
    return NextResponse.json({ error: "too_many_attempts" }, { status: 429 });
  }

  const { data: profile } = await service.from("profiles").select("email").ilike("name", name.trim()).eq("is_guest", false).maybeSingle();
  if (!profile) {
    await recordAttempt(service, limitKey);
    return NextResponse.json({ error: "invalid_credentials" }, { status: 401 });
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email: profile.email, password });
  if (error) {
    await recordAttempt(service, limitKey);
    return NextResponse.json({ error: "invalid_credentials" }, { status: 401 });
  }

  return NextResponse.json({ ok: true });
}
