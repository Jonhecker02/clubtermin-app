import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/types/database";

const PUBLIC_PATHS = ["/login", "/registrieren", "/privacy"];
// /api/cron/ has no browser session at all (called by pg_net from Postgres) —
// it authenticates itself via the CRON_SECRET header instead, checked inside
// the route handler. "/anleitung" is prefix-matched so both the player-only
// page and "/anleitung/admin" are public without needing a session.
const PUBLIC_PREFIXES = ["/auth/", "/api/ical/", "/api/cron/", "/api/debug/", "/api/auth/", "/anleitung"];

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const { pathname } = request.nextUrl;

  // Checked before any Supabase call: these routes authenticate themselves
  // (CRON_SECRET, ical token, etc.) or must work while signed out, so there's
  // no reason to spend a round trip validating a session here at all.
  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) return response;

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isPublic = PUBLIC_PATHS.includes(pathname);

  if (!user) {
    if (isPublic) return response;
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, group_id, status")
    .eq("id", user.id)
    .single();

  if (!profile) return response;

  const target = resolveTarget(profile, pathname);
  if (target && target !== pathname) {
    return NextResponse.redirect(new URL(target, request.url));
  }

  return response;
}

function resolveTarget(
  profile: { role: string; group_id: string | null; status: string | null },
  pathname: string,
): string | null {
  // Owner/Trainer aren't tied to one team's roster the way a Spieler or
  // Kapitän is — is_admin() already bypasses every group-scoped RLS check
  // for them, so they're always treated as approved and never routed
  // through /teamcode or /pending, regardless of what group_id/status
  // happen to hold (a legacy bootstrap row can have status null, for
  // instance — that shouldn't re-gate an owner behind the teamcode screen).
  //
  // /teamcode itself is legacy now — self-registration (/registrieren) sets
  // status: 'pending' directly with no group, so a real new signup never
  // has status === null. Only a handful of pre-existing accounts from the
  // old teamcode flow can still land here; Gruppe assignment now happens as
  // part of the owner's approval in Admin → Anfragen instead.
  const isOwnerOrTrainer = profile.role === "owner" || profile.role === "trainer";
  const needsTeamcode = !isOwnerOrTrainer && profile.status === null;
  const isPendingOrRejected = !isOwnerOrTrainer && (profile.status === "pending" || profile.status === "rejected");
  const isApproved = isOwnerOrTrainer || profile.status === "approved";

  if (needsTeamcode) {
    return pathname === "/teamcode" ? null : "/teamcode";
  }

  if (isPendingOrRejected) {
    return pathname === "/pending" ? null : "/pending";
  }

  if (isApproved) {
    if (pathname === "/login" || pathname === "/registrieren" || pathname === "/teamcode" || pathname === "/pending" || pathname === "/") {
      // Admins land straight in their admin view — the Termine header has a
      // toggle to flip back to the member view when they need it.
      return profile.role === "member" ? "/termine" : "/admin/termine";
    }
    if (pathname.startsWith("/admin")) {
      if (profile.role === "member") return "/termine";
      const ownerOnly =
        pathname.startsWith("/admin/gruppen") || pathname.startsWith("/admin/rollen") || pathname.startsWith("/admin/accounts");
      if (ownerOnly && profile.role !== "owner") return "/admin/termine";
    }
  }

  return null;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|apple-icon.*|icon.*).*)"],
};
