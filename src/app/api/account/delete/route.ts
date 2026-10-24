import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";

// A person deletes their own account (App Store guideline 5.1.1 (v)). Needs
// the Supabase Admin API, so it runs with the service role — but only ever on
// the id of the signed-in caller, who has to type their password again first.
// The Clubmanager account cannot be deleted this way: someone else has to
// become Clubmanager first, otherwise the club would be left without one.
export async function POST(request: Request) {
  const { password } = (await request.json()) as { password?: string };
  if (!password) {
    return NextResponse.json({ error: "missing_password" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !user.email) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  const service = createServiceRoleClient();
  const { data: profile } = await service.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role === "owner") {
    return NextResponse.json({ error: "owner_cannot_delete" }, { status: 400 });
  }

  // Re-check the password on a throwaway client so the live session is untouched.
  const { createClient: createBareClient } = await import("@supabase/supabase-js");
  const check = createBareClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: passwordError } = await check.auth.signInWithPassword({ email: user.email, password });
  if (passwordError) {
    return NextResponse.json({ error: "wrong_password" }, { status: 403 });
  }

  const { error } = await service.auth.admin.deleteUser(user.id);
  if (error) {
    return NextResponse.json({ error: "delete_failed" }, { status: 500 });
  }

  await supabase.auth.signOut();
  return NextResponse.json({ success: true });
}
