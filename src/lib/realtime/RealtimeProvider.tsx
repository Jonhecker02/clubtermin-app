"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/queries/keys";

// Keeps every device in sync: any change to termine/registrations/profiles/groups/messages/announcements
// invalidates the relevant React Query caches so open screens refetch live.
export function RealtimeProvider() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("app-sync")
      .on("postgres_changes", { event: "*", schema: "public", table: "termine" }, () => {
        queryClient.invalidateQueries({ queryKey: queryKeys.termine });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "registrations" }, () => {
        queryClient.invalidateQueries({ queryKey: ["registrations"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, () => {
        queryClient.invalidateQueries({ queryKey: queryKeys.profile });
        queryClient.invalidateQueries({ queryKey: queryKeys.profiles });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "groups" }, () => {
        queryClient.invalidateQueries({ queryKey: queryKeys.groups });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, () => {
        queryClient.invalidateQueries({ queryKey: ["messages"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "announcements" }, () => {
        queryClient.invalidateQueries({ queryKey: queryKeys.announcements });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return null;
}
