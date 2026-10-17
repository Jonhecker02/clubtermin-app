"use client";

import { useIsRestoring } from "@tanstack/react-query";

// The saved query cache is restored right after the first client render. A
// page that rendered with that data during hydration would not match the
// server HTML (which never has it), so signed-in screens wait for the restore
// — it takes a moment — and show the same placeholder on server and client
// until then.
export function RestoreGate({ fallback, children }: { fallback: React.ReactNode; children: React.ReactNode }) {
  const restoring = useIsRestoring();
  return restoring ? fallback : children;
}
