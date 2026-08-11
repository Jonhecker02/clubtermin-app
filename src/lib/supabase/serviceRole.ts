import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

// Bypasses RLS entirely — only for trusted server-only routes (cron jobs,
// system-triggered notifications) that never forward this client or its
// results containing secrets (push subscription keys) back to a browser.
// Never import this outside src/app/api/**.
export function createServiceRoleClient() {
  return createSupabaseClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
