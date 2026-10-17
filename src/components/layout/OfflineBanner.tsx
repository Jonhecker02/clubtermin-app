"use client";

import { useSyncExternalStore } from "react";
import { WifiOff } from "lucide-react";
import styles from "./OfflineBanner.module.css";

function subscribe(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

export function OfflineBanner() {
  const online = useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );
  if (online) return null;
  return (
    <div className={styles.banner} role="status">
      <WifiOff size={15} strokeWidth={2.4} />
      Offline — du siehst zuletzt geladene Daten
    </div>
  );
}
