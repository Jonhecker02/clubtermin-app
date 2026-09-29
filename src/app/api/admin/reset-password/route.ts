import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { generatePassword, initials } from "@/lib/passwordGen";

// Owner-only, same pattern as create-user/delete-account: caller-role check
// on the regular client, service role only for the Admin API call. Only
// touches the auth password — name, role, group, history, everything else
// on the profile stays exactly as it was.
export async function POST(request: Request) {
  const { user_id } = (await request.json()) as { user_id?: string };
  if (!user_id) {
    return NextResponse.json({ error: "missing_user_id" }, { status: 400 });
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

  const service = createServiceRoleClient();
  const { data: target } = await service.from("profiles").select("name, group_id").eq("id", user_id).single();
  if (!target) {
    return NextResponse.json({ error: "user_not_found" }, { status: 404 });
  }

  let shortCode = "";
  if (target.group_id) {
    const { data: group } = await service.from("groups").select("short_code").eq("id", target.group_id).single();
    shortCode = group?.short_code ?? "";
  }

  if (!initials(target.name)) {
    return NextResponse.json({ error: "invalid_name" }, { status: 400 });
  }
  const password = generatePassword(target.name, shortCode);

  const { error } = await service.auth.admin.updateUserById(user_id, { password });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ name: target.name, password });
}
