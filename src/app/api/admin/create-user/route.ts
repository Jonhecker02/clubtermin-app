import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { generatePassword, initials } from "@/lib/passwordGen";

// Owner creates a member directly (no email self-registration) — password is
// derived from initials + the group's short_code, communicated out of band
// since there's no email to send it to. Mirrors delete-account's auth
// pattern: caller-role check on the regular client first, service role only
// for the privileged Admin API call.

export async function POST(request: Request) {
  const { name, group_id, role } = (await request.json()) as {
    name?: string;
    group_id?: string | null;
    role?: "member" | "trainer" | "captain";
  };
  // Trainer aren't tied to one team's roster (unlike Spieler/Kapitän), so a
  // Gruppe is optional for them — everyone else still needs one.
  const groupRequired = role !== "trainer";
  if (!name?.trim() || (groupRequired && !group_id)) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  const { data: callerProfile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (callerProfile?.role !== "owner") {
    return NextResponse.json({ error: "not_authorized" }, { status: 403 });
  }

  const trimmedName = name.trim();
  const service = createServiceRoleClient();

  // No group picked (trainer only) — short_code stays empty, the password
  // just leans on a longer random suffix instead to keep its entropy up.
  let shortCode = "";
  if (group_id) {
    const { data: group } = await service.from("groups").select("id, short_code").eq("id", group_id).single();
    if (!group) {
      return NextResponse.json({ error: "group_not_found" }, { status: 404 });
    }
    if (!group.short_code) {
      return NextResponse.json({ error: "group_missing_short_code" }, { status: 400 });
    }
    shortCode = group.short_code;
  }

  const { data: existing } = await service.from("profiles").select("id").ilike("name", trimmedName).maybeSingle();
  if (existing) {
    return NextResponse.json({ error: "name_taken" }, { status: 409 });
  }

  if (!initials(trimmedName)) {
    return NextResponse.json({ error: "invalid_name" }, { status: 400 });
  }
  const password = generatePassword(trimmedName, shortCode);
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

  const { error: patchError } = await service
    .from("profiles")
    .update({ status: "approved", group_id: group_id ?? null, role: role ?? "member" })
    .eq("id", created.user.id);
  if (patchError) {
    return NextResponse.json({ error: patchError.message }, { status: 500 });
  }

  return NextResponse.json({ name: trimmedName, password });
}
