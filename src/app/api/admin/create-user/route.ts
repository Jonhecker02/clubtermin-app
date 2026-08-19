import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";

// Owner creates a member directly (no email self-registration) — password is
// derived from initials + the group's short_code, communicated out of band
// since there's no email to send it to. Mirrors delete-account's auth
// pattern: caller-role check on the regular client first, service role only
// for the privileged Admin API call.
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  const first = parts[0][0];
  const last = parts[parts.length - 1][0];
  return (first + last).toUpperCase();
}

export async function POST(request: Request) {
  const { name, group_id, role } = (await request.json()) as {
    name?: string;
    group_id?: string;
    role?: "member" | "trainer" | "captain";
  };
  if (!name?.trim() || !group_id) {
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

  const { data: group } = await service.from("groups").select("id, short_code").eq("id", group_id).single();
  if (!group) {
    return NextResponse.json({ error: "group_not_found" }, { status: 404 });
  }
  if (!group.short_code) {
    return NextResponse.json({ error: "group_missing_short_code" }, { status: 400 });
  }

  const { data: existing } = await service.from("profiles").select("id").ilike("name", trimmedName).maybeSingle();
  if (existing) {
    return NextResponse.json({ error: "name_taken" }, { status: 409 });
  }

  const initialsPart = initials(trimmedName);
  if (!initialsPart) {
    return NextResponse.json({ error: "invalid_name" }, { status: 400 });
  }
  const password = `${initialsPart}${group.short_code}`;
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
    .update({ status: "approved", group_id, role: role ?? "member" })
    .eq("id", created.user.id);
  if (patchError) {
    return NextResponse.json({ error: patchError.message }, { status: 500 });
  }

  return NextResponse.json({ name: trimmedName, password });
}
