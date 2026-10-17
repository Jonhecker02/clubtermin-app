import type { ReactNode } from "react";
import { BottomNav } from "@/components/layout/BottomNav";
import { AppScroll } from "@/components/layout/AppScroll";
import { OfflineBanner } from "@/components/layout/OfflineBanner";
import { RestoreGate } from "@/components/RestoreGate";
import { SkeletonPage } from "@/components/ui/Skeleton";
import { RealtimeProvider } from "@/lib/realtime/RealtimeProvider";
import styles from "./layout.module.css";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className={`app-shell ${styles.wide}`}>
      <RealtimeProvider />
      <div className={styles.shell}>
        <AppScroll>
          <RestoreGate fallback={<SkeletonPage />}>{children}</RestoreGate>
        </AppScroll>
        <OfflineBanner />
        <BottomNav />
      </div>
    </div>
  );
}
