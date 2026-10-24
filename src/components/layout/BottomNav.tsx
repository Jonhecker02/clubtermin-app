"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useRouter } from "@/lib/useGuardedRouter";
import { Calendar, Megaphone, User } from "lucide-react";
import { haptic } from "@/lib/haptics";
import styles from "./BottomNav.module.css";

export function BottomNav() {
  const router = useRouter();
  const pathname = usePathname();

  // Warm the three tab screens so switching feels instant.
  useEffect(() => {
    ["/termine", "/ankuendigungen", "/profil"].forEach((path) => router.prefetch(path));
  }, [router]);

  function go(path: string, active: boolean) {
    if (!active) haptic("light");
    router.push(path);
  }

  const termineActive = pathname.startsWith("/termine") || pathname.startsWith("/admin");
  const newsActive = pathname.startsWith("/ankuendigungen");
  const profilActive = pathname.startsWith("/profil");

  return (
    <div className={styles.nav}>
      <button
        type="button"
        className={[styles.item, termineActive ? styles.itemActive : ""].join(" ")}
        onClick={() => go("/termine", termineActive)}
      >
        <Calendar size={22} strokeWidth={2} />
        <span className={styles.label}>Termine</span>
      </button>
      <button
        type="button"
        className={[styles.item, newsActive ? styles.itemActive : ""].join(" ")}
        onClick={() => go("/ankuendigungen", newsActive)}
      >
        <Megaphone size={22} strokeWidth={2} />
        <span className={styles.label}>Ankündigungen</span>
      </button>
      <button
        type="button"
        className={[styles.item, profilActive ? styles.itemActive : ""].join(" ")}
        onClick={() => go("/profil", profilActive)}
      >
        <User size={22} strokeWidth={2} />
        <span className={styles.label}>Profil</span>
      </button>
    </div>
  );
}
