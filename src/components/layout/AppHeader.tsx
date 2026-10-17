import type { ReactNode } from "react";
import styles from "./AppHeader.module.css";

interface AppHeaderProps {
  title: string;
  right?: ReactNode;
  back?: ReactNode;
}

// Top-level screens get an iOS-style large title that scrolls away while the
// bar turns translucent and shows the compact title; screens with a back
// button keep the compact bar throughout.
export function AppHeader({ title, right, back }: AppHeaderProps) {
  if (back) {
    return (
      <div className={styles.header}>
        <div className={styles.withBack}>
          {back}
          <div className={styles.title}>{title}</div>
        </div>
        {right}
      </div>
    );
  }

  return (
    <>
      <div className={`${styles.header} ${styles.headerLarge}`}>
        <div className={`${styles.title} ${styles.compactTitle}`}>{title}</div>
        {right}
      </div>
      <div className={styles.largeTitleWrap}>
        <h1 className={styles.largeTitle}>{title}</h1>
      </div>
    </>
  );
}
