import type { ReactNode } from "react";
import styles from "./Badge.module.css";

type BadgeTone = "navy" | "pink" | "outline" | "soft" | "amber";

interface BadgeProps {
  tone?: BadgeTone;
  size?: "sm" | "md";
  children: ReactNode;
  className?: string;
}

export function Badge({ tone = "soft", size = "md", children, className }: BadgeProps) {
  return (
    <span className={[styles.badge, styles[tone], styles[size], className].filter(Boolean).join(" ")}>
      {children}
    </span>
  );
}
