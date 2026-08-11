"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { queryKeys } from "./keys";
import type { UserRole } from "@/types/database";

export interface MessageWithSender {
  id: string;
  group_id: string;
  user_id: string;
  content: string;
  created_at: string;
  name: string;
  role: UserRole;
}

const MESSAGE_LIMIT = 200;

export function useMessages(groupId: string | null) {
  return useQuery({
    queryKey: groupId ? queryKeys.messages(groupId) : ["messages", "none"],
    queryFn: async (): Promise<MessageWithSender[]> => {
      if (!groupId) return [];
      const supabase = createClient();
      const { data: messages, error } = await supabase
        .from("messages")
        .select("id, group_id, user_id, content, created_at")
        .eq("group_id", groupId)
        .order("created_at", { ascending: true })
        .limit(MESSAGE_LIMIT);
      if (error) throw error;
      if (messages.length === 0) return [];

      const userIds = [...new Set(messages.map((m) => m.user_id))];
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id, name, role")
        .in("id", userIds);
      if (profilesError) throw profilesError;

      const byId = new Map(profiles.map((p) => [p.id, p]));
      return messages.map((m) => ({
        ...m,
        name: byId.get(m.user_id)?.name ?? "—",
        role: byId.get(m.user_id)?.role ?? "member",
      }));
    },
    enabled: !!groupId,
  });
}
