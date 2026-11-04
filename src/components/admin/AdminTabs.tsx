"use client";

import { useEffect, useState } from "react";
import { useRouter } from "@/lib/useGuardedRouter";
import { Tabs } from "@/components/ui/Tabs";
import { useProfile } from "@/lib/queries/useProfile";
import { useProfiles } from "@/lib/queries/useProfiles";

interface AdminTabsProps {
  current: "termine" | "gruppen" | "anfragen" | "spielstaerke" | "rollen" | "accounts" | "statistik";
}

export function AdminTabs({ current }: AdminTabsProps) {
  const router = useRouter();
  // Highlight the tapped tab right away; the new page follows a moment later.
  const [pending, setPending] = useState<string | null>(null);
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
    // Registration requests: Clubmanager and Kapitän only, not trainers.
    ...(profile?.role !== "trainer" ? [{ id: "anfragen", label: `Anfragen (${pendingCount})` }] : []),
    ...(isTrainerOrOwner ? [{ id: "spielstaerke", label: "Spieler" }] : []),
    ...(isOwner ? [{ id: "rollen", label: "Rollen" }] : []),
    ...(isOwner ? [{ id: "accounts", label: "Accounts" }] : []),
    // Participation overview: every admin role (captains only see their own team).
    { id: "statistik", label: "Teilnahme" },
  ];

  // If the navigation didn't happen (e.g. "discard changes?" was declined),
  // fall back to the real tab.
  useEffect(() => {
    if (!pending) return;
    const t = setTimeout(() => setPending(null), 1500);
    return () => clearTimeout(t);
  }, [pending]);

  // Warm every tab's route so the switch doesn't wait on the network.
  const ids = items.map((i) => i.id).join(",");
  useEffect(() => {
    ids.split(",").forEach((id) => router.prefetch(`/admin/${id}`));
  }, [ids, router]);

  return (
    <Tabs
      items={items}
      value={pending ?? current}
      onChange={(id) => {
        if (id === current) return;
        setPending(id);
        router.push(`/admin/${id}`);
      }}
      size={items.length > 3 ? "sm" : "md"}
      scrollable
      style={{ marginBottom: 14 }}
    />
  );
}
