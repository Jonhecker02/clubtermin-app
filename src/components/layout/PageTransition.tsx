"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import styles from "./PageTransition.module.css";

// Remembers how deep the previous screen was, so going deeper slides in from
// the right (like a push), going back slides in from the left, and switching
// between sibling tabs just cross-fades.
let lastDepth: number | null = null;

function depthOf(pathname: string): number {
  return pathname.split("/").filter(Boolean).length;
}

export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [direction] = useState<"forward" | "back" | "fade">(() => {
    const depth = depthOf(pathname);
    if (lastDepth === null || depth === lastDepth) return "fade";
    return depth > lastDepth ? "forward" : "back";
  });

  useEffect(() => {
    lastDepth = depthOf(pathname);
  }, [pathname]);

  return <div className={`${styles.page} ${styles[direction]}`}>{children}</div>;
}
