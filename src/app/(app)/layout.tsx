import type { ReactNode } from "react";
import { BottomNav } from "@/components/layout/BottomNav";
import { RealtimeProvider } from "@/lib/realtime/RealtimeProvider";
import styles from "./layout.module.css";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="app-shell">
      <RealtimeProvider />
      <div className={styles.shell}>
        <div className={styles.content}>{children}</div>
        <BottomNav />
      </div>
    </div>
  );
}
