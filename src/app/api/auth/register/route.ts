import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";

// Public self-registration — replaces the old teamcode flow for players.
// No group is chosen here at all; the new profile lands with status
// 'pending' (handle_new_user's trigger default is role='member', group_id
// null, status null — patched to 'pending' right after) and shows up in
// Admin → Anfragen, where the owner assigns a Mannschaft and approves in
// one step. Mirrors create-user's synthetic-email pattern (no real email,
// no confirmation step) and login's "sign in on the cookie-bound server
// client so the session lands via Set-Cookie" pattern.
export async function POST(request: Request) {
  const { name, password } = (await request.json()) as { name?: string; password?: string };
  if (!name?.trim() || !password || password.length < 6) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }

  const trimmedName = name.trim();
  const service = createServiceRoleClient();

  const { data: existing } = await service.from("profiles").select("id").ilike("name", trimmedName).maybeSingle();
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

  const { error: patchError } = await service.from("profiles").update({ status: "pending" }).eq("id", created.user.id);
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
