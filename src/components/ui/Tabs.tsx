"use client";

import { useEffect, useRef } from "react";
import { haptic } from "@/lib/haptics";
import styles from "./Tabs.module.css";

export interface TabItem {
  id: string;
  label: string;
}

interface TabsProps {
  items: TabItem[];
  value: string;
  onChange: (id: string) => void;
  size?: "sm" | "md";
  onDark?: boolean;
  // Never shorten labels: when they don't all fit, the row scrolls sideways
  // instead (and keeps the active tab in view).
  scrollable?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export function Tabs({ items, value, onChange, size = "md", onDark = false, scrollable = false, className, style }: TabsProps) {
  const trackRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!scrollable) return;
    const track = trackRef.current;
    const active = track?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (!track || !active) return;
    track.scrollLeft = active.offsetLeft - (track.clientWidth - active.offsetWidth) / 2;
  }, [scrollable, value, items.length]);

  return (
    <div
      ref={trackRef}
      className={[styles.track, styles[size], onDark ? styles.trackOnDark : "", scrollable ? styles.trackScroll : "", className]
        .filter(Boolean)
        .join(" ")}
      style={style}
      role="tablist"
    >
      {items.map((item) => {
        const active = item.id === value;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => {
              if (!active) haptic("light");
              onChange(item.id);
            }}
            className={[styles.item, styles[size], onDark && !active ? styles.itemOnDark : "", active ? styles.itemActive : ""]
              .filter(Boolean)
              .join(" ")}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
