import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/types/database";

const PUBLIC_PATHS = ["/login", "/privacy"];
// /api/cron/ has no browser session at all (called by pg_net from Postgres) —
// it authenticates itself via the CRON_SECRET header instead, checked inside
// the route handler.
const PUBLIC_PREFIXES = ["/auth/", "/api/ical/", "/api/cron/", "/api/debug/", "/api/auth/"];

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
  const needsTeamcode = !profile.group_id || !profile.status;
  const isPendingOrRejected = profile.status === "pending" || profile.status === "rejected";
  const isApproved = profile.status === "approved";

  if (needsTeamcode) {
    return pathname === "/teamcode" ? null : "/teamcode";
  }

  if (isPendingOrRejected) {
    return pathname === "/pending" ? null : "/pending";
  }

  if (isApproved) {
    if (pathname === "/login" || pathname === "/teamcode" || pathname === "/pending" || pathname === "/") {
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
