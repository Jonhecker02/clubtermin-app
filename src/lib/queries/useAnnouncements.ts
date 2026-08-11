"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { queryKeys } from "./keys";
import type { UserRole } from "@/types/database";

export interface AnnouncementWithAuthor {
  id: string;
  content: string;
  visible_groups: string[];
  created_by: string | null;
  created_at: string;
  authorName: string;
  authorRole: UserRole;
}

const ANNOUNCEMENT_LIMIT = 100;

export function useAnnouncements() {
  return useQuery({
    queryKey: queryKeys.announcements,
    queryFn: async (): Promise<AnnouncementWithAuthor[]> => {
      const supabase = createClient();
      const { data: announcements, error } = await supabase
        .from("announcements")
        .select("id, content, visible_groups, created_by, created_at")
        .order("created_at", { ascending: false })
        .limit(ANNOUNCEMENT_LIMIT);
      if (error) throw error;
      if (announcements.length === 0) return [];

      const authorIds = [...new Set(announcements.map((a) => a.created_by).filter((id): id is string => !!id))];
      const { data: profiles, error: profilesError } = await supabase.from("profiles").select("id, name, role").in("id", authorIds);
      if (profilesError) throw profilesError;

      const byId = new Map(profiles.map((p) => [p.id, p]));
      return announcements.map((a) => {
        const author = a.created_by ? byId.get(a.created_by) : undefined;
        return {
          ...a,
          authorName: author?.name ?? "—",
          authorRole: author?.role ?? "member",
        };
      });
    },
  });
}
