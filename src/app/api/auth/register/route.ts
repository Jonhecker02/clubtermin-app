import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { clientIp, isRateLimited, recordAttempt } from "@/lib/rateLimit";

// New accounts allowed per address per hour (a whole squad registering from
// the club wifi still fits comfortably).
const REGISTER_LIMIT = 10;
const REGISTER_WINDOW_SECONDS = 60 * 60;

// Public self-registration — replaces the old teamcode flow for players.
// No group is chosen here at all; the new profile lands with status
// 'pending' (handle_new_user's trigger default is role='member', group_id
// null, status null — patched to 'pending' right after) and shows up in
// Admin → Anfragen, where the owner assigns a Mannschaft and approves in
// one step. Mirrors create-user's synthetic-email pattern (no real email,
// no confirmation step) and login's "sign in on the cookie-bound server
// client so the session lands via Set-Cookie" pattern.
export async function POST(request: Request) {
  const { name, password, birth_date, gender } = (await request.json()) as {
    name?: string;
    password?: string;
    birth_date?: string;
    gender?: string;
  };
  // Date of birth is required at registration (team planning); plausible only.
  const todayISO = new Date().toISOString().slice(0, 10);
  const birthOk =
    typeof birth_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(birth_date) && birth_date >= "1900-01-01" && birth_date <= todayISO;
  if (!name?.trim() || !password || password.length < 6 || !birthOk || (gender !== "m" && gender !== "w")) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }

  const trimmedName = name.trim();
  const service = createServiceRoleClient();
  const limitKey = `register:${clientIp(request)}`;
  if (await isRateLimited(service, limitKey, REGISTER_LIMIT, REGISTER_WINDOW_SECONDS)) {
    return NextResponse.json({ error: "too_many_attempts" }, { status: 429 });
  }
  await recordAttempt(service, limitKey);

  const { data: existing } = await service.from("profiles").select("id").ilike("name", trimmedName).eq("is_guest", false).maybeSingle();
  if (existing) {
    return NextResponse.json({ error: "name_taken" }, { status: 409 });
  }

  const syntheticEmail = `user-${randomUUID().slice(0, 12)}@clubtermin.local`;
  const { data: created, error: createError } = await service.auth.admin.createUser({
    email: syntheticEmail,
    password,
    email_confirm: true,
    user_metadata: { name: trimmedName },
  });
  if (createError || !created.user) {
    return NextResponse.json({ error: createError?.message ?? "create_failed" }, { status: 500 });
  }

  const { error: patchError } = await service.from("profiles").update({ status: "pending", birth_date, gender }).eq("id", created.user.id);
  if (patchError) {
    return NextResponse.json({ error: patchError.message }, { status: 500 });
  }

  const supabase = await createClient();
  const { error: signInError } = await supabase.auth.signInWithPassword({ email: syntheticEmail, password });
  if (signInError) {
    return NextResponse.json({ error: "signin_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
