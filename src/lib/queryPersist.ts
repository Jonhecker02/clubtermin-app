import type { QueryClient } from "@tanstack/react-query";
import type { Query } from "@tanstack/react-query";

export const CACHE_KEY = "clubtermine-query-cache";
export const PAGE_CACHE_NAME = "ct-pages-v1";

// Only plain club data is kept on the device for instant reopening/offline
// reading. Trainer-internal data (Spielstärken, Notizen, Zuteilungen,
// Statistiken, Platzgruppen) is never written to storage.
const PERSISTED_ROOTS = new Set([
  "profile",
  "profiles",
  "groups",
  "trainerGroups",
  "termine",
  "registrations",
  "announcements",
]);

export function shouldPersistQuery(query: Query): boolean {
  const root = query.queryKey[0];
  return typeof root === "string" && PERSISTED_ROOTS.has(root) && query.state.status === "success";
}

// Everything that could show one account's data to the next person on this
// device: in-memory queries, the persisted copy and the cached page shells.
// Call on every login, registration and logout.
export function clearAllCaches(queryClient: QueryClient): void {
  queryClient.clear();
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {
    // storage unavailable (private mode) — nothing persisted anyway
  }
  if (typeof caches !== "undefined") {
    caches.delete(PAGE_CACHE_NAME).catch(() => {});
  }
}
