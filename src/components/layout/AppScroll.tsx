"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { haptic } from "@/lib/haptics";
import styles from "./AppScroll.module.css";

const THRESHOLD = 64; // px of (damped) pull that triggers a refresh
const MAX_PULL = 110;
const DAMPING = 0.5;
const MIN_SPIN_MS = 700;

// The app's one scroll container. Adds two iOS-style behaviours:
//  * pull down at the very top to refresh all on-screen data
//  * data-scrolled on the container, which headers use to switch from the
//    solid bar + large title to the translucent compact bar
export function AppScroll({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const [pull, setPull] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const pullRef = useRef(0);
  const refreshingRef = useRef(false);

  // A new page always opens at its top.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.scrollTop = 0;
    el.dataset.scrolled = "false";
  }, [pathname]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    function onScroll() {
      const scrolled = el!.scrollTop > 24 ? "true" : "false";
      if (el!.dataset.scrolled !== scrolled) el!.dataset.scrolled = scrolled;
    }

    let startY: number | null = null;
    let startX = 0;
    let armed = false;

    async function refresh() {
      refreshingRef.current = true;
      setRefreshing(true);
      setPull(THRESHOLD);
      const started = Date.now();
      try {
        await queryClient.refetchQueries({ type: "active" });
      } catch {
        // individual query errors surface in their own screens
      }
      const wait = MIN_SPIN_MS - (Date.now() - started);
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      haptic("success");
      refreshingRef.current = false;
      setRefreshing(false);
      setPull(0);
    }

    function onTouchStart(e: TouchEvent) {
      if (refreshingRef.current || el!.scrollTop > 0) return;
      startY = e.touches[0].clientY;
      startX = e.touches[0].clientX;
      armed = false;
    }

    function onTouchMove(e: TouchEvent) {
      if (startY === null) return;
      const dy = e.touches[0].clientY - startY;
      const dx = e.touches[0].clientX - startX;
      if (!armed && (dy <= 0 || Math.abs(dx) > Math.abs(dy)) ) {
        if (dy < -4 || Math.abs(dx) > 10) startY = null;
        return;
      }
      if (el!.scrollTop > 0) {
        startY = null;
        return;
      }
      armed = true;
      setDragging(true);
      // Stop the browser's own rubber-band while we show ours.
      if (e.cancelable) e.preventDefault();
      const damped = Math.min(Math.max(dy, 0) * DAMPING, MAX_PULL);
      if (pullRef.current < THRESHOLD && damped >= THRESHOLD) haptic("light");
      pullRef.current = damped;
      setPull(damped);
    }

    function onTouchEnd() {
      if (startY === null) return;
      startY = null;
      setDragging(false);
      const reached = pullRef.current >= THRESHOLD;
      pullRef.current = 0;
      if (reached && !refreshingRef.current) {
        void refresh();
      } else {
        setPull(0);
      }
    }

    el.addEventListener("scroll", onScroll, { passive: true });
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    el.addEventListener("touchcancel", onTouchEnd, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [queryClient]);

  const progress = Math.min(pull / THRESHOLD, 1);

  return (
    <div ref={ref} className={styles.scroll} data-scrolled="false">
      <div
        className={styles.indicator}
        style={{ opacity: progress, transform: `translateY(${Math.min(pull, THRESHOLD) - 44}px)` }}
        aria-hidden="true"
      >
        <RefreshCw
          size={20}
          strokeWidth={2.4}
          className={refreshing ? styles.spin : undefined}
          style={refreshing ? undefined : { transform: `rotate(${progress * 270}deg)` }}
        />
      </div>
      <div
        className={styles.inner}
        style={{
          transform: pull > 0 ? `translateY(${pull}px)` : undefined,
          transition: dragging ? "none" : "transform 380ms var(--ease-spring)",
        }}
      >
        {children}
      </div>
    </div>
  );
}
