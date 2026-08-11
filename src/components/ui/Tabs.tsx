"use client";

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
  className?: string;
  style?: React.CSSProperties;
}

export function Tabs({ items, value, onChange, size = "md", onDark = false, className, style }: TabsProps) {
  return (
    <div
      className={[styles.track, styles[size], onDark ? styles.trackOnDark : "", className]
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
            onClick={() => onChange(item.id)}
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
