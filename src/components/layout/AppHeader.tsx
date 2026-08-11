import type { ReactNode } from "react";
import styles from "./AppHeader.module.css";

interface AppHeaderProps {
  title: string;
  right?: ReactNode;
  back?: ReactNode;
}

export function AppHeader({ title, right, back }: AppHeaderProps) {
  return (
    <div className={styles.header}>
      {back ? (
        <div className={styles.withBack}>
          {back}
          <div className={styles.title}>{title}</div>
        </div>
      ) : (
        <div className={styles.title}>{title}</div>
      )}
      {right}
    </div>
  );
}
