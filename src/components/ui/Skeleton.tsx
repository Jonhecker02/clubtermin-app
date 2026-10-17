import type { CSSProperties } from "react";
import styles from "./Skeleton.module.css";

interface SkeletonProps {
  width?: number | string;
  height?: number | string;
  radius?: number | string;
  style?: CSSProperties;
}

// Shimmering placeholder block. Decorative only — hidden from assistive tech;
// the page announces itself once real content replaces it.
export function Skeleton({ width = "100%", height = 14, radius, style }: SkeletonProps) {
  return <span className={styles.bone} aria-hidden="true" style={{ width, height, borderRadius: radius, ...style }} />;
}

// Same silhouette as an EventRow, so the list doesn't jump when data arrives.
export function SkeletonEventList({ count = 4 }: { count?: number }) {
  return (
    <div className={styles.list} role="status" aria-label="Lädt">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className={styles.card}>
          <div className={styles.cardEnd} style={{ alignItems: "flex-start" }}>
            <Skeleton width={28} height={10} />
            <Skeleton width={38} height={16} />
          </div>
          <div className={styles.cardMain}>
            <Skeleton width="70%" height={16} />
            <Skeleton width="45%" height={12} />
          </div>
          <div className={styles.cardEnd}>
            <Skeleton width={44} height={18} />
            <Skeleton width={30} height={10} />
          </div>
        </div>
      ))}
    </div>
  );
}

// Whole-page placeholder for route transitions: navy header bar + filter pills
// + list rows.
export function SkeletonPage({ rows = 4 }: { rows?: number }) {
  return (
    <>
      <div className={styles.header}>
        <Skeleton width={150} height={24} radius={8} style={{ opacity: 0.35 }} />
      </div>
      <div className={styles.page}>
        <div className={styles.filters}>
          <Skeleton width="100%" height={36} radius={999} />
        </div>
        <SkeletonEventList count={rows} />
      </div>
    </>
  );
}

// Placeholder for a termin detail screen.
export function SkeletonDetail() {
  return (
    <div role="status" aria-label="Lädt">
      <div className={styles.header}>
        <Skeleton width={190} height={22} radius={8} style={{ opacity: 0.35 }} />
      </div>
      <div className={styles.page}>
        <div className={styles.detailCard}>
          <Skeleton width="60%" height={20} />
          <Skeleton width="40%" height={13} />
          <Skeleton width="80%" height={13} />
          <Skeleton width="100%" height={46} radius={999} style={{ marginTop: 8 }} />
        </div>
        <div className={styles.detailCard}>
          <Skeleton width="35%" height={14} />
          <Skeleton width="100%" height={40} />
          <Skeleton width="100%" height={40} />
          <Skeleton width="100%" height={40} />
        </div>
      </div>
    </div>
  );
}
