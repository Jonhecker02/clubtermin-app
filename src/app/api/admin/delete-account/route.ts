import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";

// Full account deletion (not just leaving a group) — needs the Supabase Admin
// API, which only the service role can call. Owner-only, can't target the
// owner account or yourself.
export async function POST(request: Request) {
  const { user_id } = (await request.json()) as { user_id?: string };
  if (!user_id) {
    return NextResponse.json({ error: "missing user_id" }, { status: 400 });
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
  if (user_id === user.id) {
    return NextResponse.json({ error: "cannot_delete_self" }, { status: 400 });
  }

  const service = createServiceRoleClient();
  const { data: targetProfile } = await service.from("profiles").select("role").eq("id", user_id).single();
  if (targetProfile?.role === "owner") {
    return NextResponse.json({ error: "cannot_delete_owner" }, { status: 400 });
  }

  const { error } = await service.auth.admin.deleteUser(user_id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
