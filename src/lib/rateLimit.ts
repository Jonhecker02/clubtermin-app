import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

// Best-effort client address behind Vercel's proxy.
export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

// Both helpers fail open: if the rate-limit tables/functions are unreachable
// (or not migrated yet), logging in and registering must keep working rather
// than lock everybody out.
export async function isRateLimited(
  service: SupabaseClient<Database>,
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<boolean> {
  const { data, error } = await service.rpc("rate_limit_blocked", {
    p_key: key,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });
  if (error) return false;
  return data === true;
}

export async function recordAttempt(service: SupabaseClient<Database>, key: string): Promise<void> {
  await service.rpc("rate_limit_record", { p_key: key });
}
