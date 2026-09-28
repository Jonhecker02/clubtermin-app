"use client";

import { useRouter } from "next/navigation";
import { Tabs } from "@/components/ui/Tabs";
import { useProfile } from "@/lib/queries/useProfile";
import { useProfiles } from "@/lib/queries/useProfiles";

interface AdminTabsProps {
  current: "termine" | "gruppen" | "anfragen" | "spielstaerke" | "rollen" | "accounts" | "statistik";
}

export function AdminTabs({ current }: AdminTabsProps) {
  const router = useRouter();
  const { data: profile } = useProfile();
  const { data: profiles = [] } = useProfiles();
  const pendingCount = profiles.filter((p) => p.status === "pending").length;
  const isOwner = profile?.role === "owner";
  // Spielstärke is trainer/owner-only — narrower than is_admin() (which also
  // includes captain), matching the RPCs it calls (is_trainer_or_owner()).
  const isTrainerOrOwner = profile?.role === "owner" || profile?.role === "trainer";

  const items = [
    { id: "termine", label: "Termine" },
    ...(isOwner ? [{ id: "gruppen", label: "Gruppen" }] : []),
    { id: "anfragen", label: `Anfragen (${pendingCount})` },
    ...(isTrainerOrOwner ? [{ id: "spielstaerke", label: "Spielstärke" }] : []),
    ...(isOwner ? [{ id: "rollen", label: "Rollen" }] : []),
    ...(isOwner ? [{ id: "accounts", label: "Accounts" }] : []),
    ...(isOwner ? [{ id: "statistik", label: "Statistik" }] : []),
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
