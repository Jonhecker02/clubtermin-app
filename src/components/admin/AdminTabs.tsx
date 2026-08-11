"use client";

import { useRouter } from "next/navigation";
import { Tabs } from "@/components/ui/Tabs";
import { useProfiles } from "@/lib/queries/useProfiles";

interface AdminTabsProps {
  current: "termine" | "gruppen" | "anfragen" | "rollen" | "accounts";
  isOwner: boolean;
}

export function AdminTabs({ current, isOwner }: AdminTabsProps) {
  const router = useRouter();
  const { data: profiles = [] } = useProfiles();
  const pendingCount = profiles.filter((p) => p.status === "pending").length;

  const items = [
    { id: "termine", label: "Termine" },
    ...(isOwner ? [{ id: "gruppen", label: "Gruppen" }] : []),
    { id: "anfragen", label: `Anfragen (${pendingCount})` },
    ...(isOwner ? [{ id: "rollen", label: "Rollen" }] : []),
    ...(isOwner ? [{ id: "accounts", label: "Accounts" }] : []),
  ];

  return (
    <Tabs
      items={items}
      value={current}
      onChange={(id) => router.push(`/admin/${id}`)}
      size={items.length > 3 ? "sm" : "md"}
      style={{ marginBottom: 14 }}
    />
  );
}
