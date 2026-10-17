"use client";

import { useEffect, useState } from "react";

// Current time in ms, refreshed on an interval — for things that change by
// themselves while a screen stays open (e.g. "live" status).
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
