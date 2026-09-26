"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { queryKeys } from "./keys";
import type { PlayerAttendanceStat } from "@/types/database";

// Clubmanager-only ("wie ist die Bereitschaft der Leute") — is_admin()-gated
// on the RPC itself, so this just surfaces whatever it returns.
export function useAttendanceStats() {
  return useQuery({
    queryKey: queryKeys.attendanceStats,
    queryFn: async (): Promise<PlayerAttendanceStat[]> => {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("get_player_attendance_stats");
      if (error) throw error;
      return data ?? [];
    },
  });
}
