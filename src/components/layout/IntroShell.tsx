import type { ReactNode } from "react";
import styles from "./IntroShell.module.css";

interface IntroShellProps {
  mood?: "pink" | "navy";
  children: ReactNode;
}

export function IntroShell({ mood, children }: IntroShellProps) {
  return (
    <div className="app-shell" data-mood={mood}>
      <div className={`${styles.wrap} ${mood === "navy" ? styles.wrapNavy : ""}`}>{children}</div>
    </div>
  );
}

export { styles as introStyles };
