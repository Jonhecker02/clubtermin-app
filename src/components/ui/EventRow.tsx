"use client";

import styles from "./EventRow.module.css";
import type { TerminType } from "@/types/database";

interface EventRowProps {
  weekday: string;
  dateLabel: string;
  title: string;
  subtitle: string;
  time: string;
  meta?: string;
  notice?: string | null;
  dimmed?: boolean;
  type?: TerminType;
  onClick?: () => void;
}

const TYPE_ROW_CLASS: Record<TerminType, string> = {
  training: "row",
  event: "rowEvent",
  spieltag: "rowSpieltag",
};

export function EventRow({
  weekday,
  dateLabel,
  title,
  subtitle,
  time,
  meta,
  notice,
  dimmed = false,
  type = "training",
  onClick,
}: EventRowProps) {
  return (
    <button
      type="button"
      className={[styles[TYPE_ROW_CLASS[type]], dimmed ? styles.dimmed : ""].join(" ")}
      onClick={onClick}
    >
      <div className={styles.mainRow}>
        <div className={styles.dateCol}>
          <span className={styles.weekday}>{weekday}</span>
          <span className={styles.date}>{dateLabel}</span>
        </div>
        <div className={styles.main}>
          <span className={styles.title}>{title}</span>
          <span className={styles.subtitle}>{subtitle}</span>
        </div>
        <div className={styles.timeCol}>
          <span className={styles.time}>{time}</span>
          <span className={styles.uhr}>Uhr</span>
          {meta && <span className={styles.meta}>{meta}</span>}
        </div>
      </div>
      {notice && <div className={styles.noticeRow}>{notice}</div>}
    </button>
  );
}
