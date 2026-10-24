import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";

// Clubmanager merges an Einspringer into the real member account: the database
// function moves the whole history over (checked against the caller's own
// session, so it refuses anybody but the owner), then the now-empty guest
// login is deleted.
export async function POST(request: Request) {
  const { guest_id, member_id } = (await request.json()) as { guest_id?: string; member_id?: string };
  if (!guest_id || !member_id) {
    return NextResponse.json({ error: "missing_ids" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("merge_guest_into_member", { p_guest_id: guest_id, p_member_id: member_id });
  if (error) {
    const known = ["not_authorized", "same_profile", "not_a_guest", "not_a_member"].find((m) => error.message.includes(m));
    return NextResponse.json({ error: known ?? "merge_failed" }, { status: known === "not_authorized" ? 403 : 400 });
  }

  const service = createServiceRoleClient();
  const { error: deleteError } = await service.auth.admin.deleteUser(guest_id);
  if (deleteError) {
    // History is already merged; only the empty guest account is left behind.
    return NextResponse.json({ ...data, warning: "guest_not_deleted" });
  }
  return NextResponse.json(data);
}
