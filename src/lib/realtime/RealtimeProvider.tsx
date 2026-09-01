"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/queries/keys";

// A query fetched more recently than this is treated as already up to date —
// skips the redundant refetch below when the change we just heard about over
// the wire is the same one a local mutation's own invalidateQueries() already
// caused a moment ago (that local refetch always lands first; the realtime
// event for your own write follows ~100-500ms later over the websocket).
const FRESH_WINDOW_MS = 3000;

function invalidateUnlessFresh(queryClient: ReturnType<typeof useQueryClient>, queryKey: readonly unknown[]) {
  queryClient.invalidateQueries({
    queryKey,
    refetchType: "active",
    predicate: (query) => Date.now() - query.state.dataUpdatedAt > FRESH_WINDOW_MS,
  });
}

// Keeps every device in sync: any change to termine/registrations/profiles/groups/messages/announcements
// invalidates the relevant React Query caches so open screens refetch live.
export function RealtimeProvider() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("app-sync")
      .on("postgres_changes", { event: "*", schema: "public", table: "termine" }, () => {
        invalidateUnlessFresh(queryClient, queryKeys.termine);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "registrations" }, () => {
        invalidateUnlessFresh(queryClient, ["registrations"]);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, () => {
        invalidateUnlessFresh(queryClient, queryKeys.profile);
        invalidateUnlessFresh(queryClient, queryKeys.profiles);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "groups" }, () => {
        invalidateUnlessFresh(queryClient, queryKeys.groups);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, () => {
        invalidateUnlessFresh(queryClient, ["messages"]);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "announcements" }, () => {
        invalidateUnlessFresh(queryClient, queryKeys.announcements);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return null;
}
