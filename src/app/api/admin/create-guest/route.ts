import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";

// An Einspringer (guest) is typed in by an admin: a real profile row — so
// registrations, court groups, notes and levels work like for everybody — but
// with a login nobody can use (random password, account banned) and no group.
// If the same name already belongs to a guest, that guest is reused instead of
// creating a duplicate.
export async function POST(request: Request) {
  const { name } = (await request.json()) as { name?: string };
  const trimmed = (name ?? "").replace(/\s+/g, " ").trim();
  if (trimmed.length < 2 || trimmed.length > 60) {
    return NextResponse.json({ error: "invalid_name" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  const { data: caller } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!caller || !["owner", "trainer", "captain"].includes(caller.role)) {
    return NextResponse.json({ error: "not_authorized" }, { status: 403 });
  }

  const service = createServiceRoleClient();
  const { data: same } = await service.from("profiles").select("id, name, is_guest").ilike("name", trimmed);
  const existingGuest = (same ?? []).find((p) => p.is_guest);
  if (existingGuest) {
    return NextResponse.json({ id: existingGuest.id, name: existingGuest.name, reused: true });
  }

  const email = `guest-${randomUUID().slice(0, 12)}@clubtermin.local`;
  const { data: created, error: createError } = await service.auth.admin.createUser({
    email,
    password: randomUUID() + randomUUID(),
    email_confirm: true,
    user_metadata: { name: trimmed },
  });
  if (createError || !created.user) {
    return NextResponse.json({ error: createError?.message ?? "create_failed" }, { status: 500 });
  }

  const { error: patchError } = await service
    .from("profiles")
    .update({ status: "approved", is_guest: true, role: "member", group_id: null })
    .eq("id", created.user.id);
  if (patchError) {
    await service.auth.admin.deleteUser(created.user.id);
    return NextResponse.json({ error: patchError.message }, { status: 500 });
  }
  // Nobody can ever sign in as a guest.
  await service.auth.admin.updateUserById(created.user.id, { ban_duration: "876000h" });

  return NextResponse.json({ id: created.user.id, name: trimmed, reused: false });
}
