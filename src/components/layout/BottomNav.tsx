"use client";

import { useRouter, usePathname } from "next/navigation";
import { Calendar, MessageCircle, User } from "lucide-react";
import styles from "./BottomNav.module.css";

export function BottomNav() {
  const router = useRouter();
  const pathname = usePathname();

  const termineActive = pathname.startsWith("/termine") || pathname.startsWith("/admin");
  const chatActive = pathname.startsWith("/chat");
  const profilActive = pathname.startsWith("/profil");

  return (
    <div className={styles.nav}>
      <button
        type="button"
        className={[styles.item, termineActive ? styles.itemActive : ""].join(" ")}
        onClick={() => router.push("/termine")}
      >
        <Calendar size={22} strokeWidth={2} />
        <span className={styles.label}>Termine</span>
      </button>
      <button
        type="button"
        className={[styles.item, chatActive ? styles.itemActive : ""].join(" ")}
        onClick={() => router.push("/chat")}
      >
        <MessageCircle size={22} strokeWidth={2} />
        <span className={styles.label}>Chat</span>
      </button>
      <button
        type="button"
        className={[styles.item, profilActive ? styles.itemActive : ""].join(" ")}
        onClick={() => router.push("/profil")}
      >
        <User size={22} strokeWidth={2} />
        <span className={styles.label}>Profil</span>
      </button>
    </div>
  );
}
