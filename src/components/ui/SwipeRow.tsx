"use client";

import { useRef, useState, type ReactNode } from "react";
import { Pencil, Trash2 } from "lucide-react";
import styles from "./SwipeRow.module.css";

interface SwipeRowProps {
  children: ReactNode;
  onEdit: () => void;
  onDelete: () => void | Promise<void>;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

// Discrete swipe detection (classify the gesture once on touchend) rather
// than following the finger in real time — avoids fighting the list's own
// vertical scroll with preventDefault, at the cost of the reveal not
// tracking the finger 1:1 (it animates open via CSS transition instead).
const SWIPE_THRESHOLD = 40;
const ACTIONS_WIDTH = 152;

export function SwipeRow({ children, onEdit, onDelete, isOpen, onOpenChange }: SwipeRowProps) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const start = useRef<{ x: number; y: number } | null>(null);

  function handleTouchStart(e: React.TouchEvent) {
    const t = e.touches[0];
    start.current = { x: t.clientX, y: t.clientY };
  }

  function handleTouchEnd(e: React.TouchEvent) {
    if (!start.current) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.current.x;
    const dy = t.clientY - start.current.y;
    start.current = null;
    if (Math.abs(dx) > SWIPE_THRESHOLD && Math.abs(dx) > Math.abs(dy) * 1.5) {
      onOpenChange(dx < 0);
      if (dx > 0) setConfirming(false);
    }
  }

  // While open, the first tap on the row just closes it (matches iOS) —
  // swallow the click so it doesn't also trigger the wrapped row's own
  // onClick (e.g. navigating into the termin).
  function handleContentClick(e: React.MouseEvent) {
    if (isOpen) {
      e.preventDefault();
      e.stopPropagation();
      onOpenChange(false);
      setConfirming(false);
    }
  }

  async function handleDeleteClick() {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setDeleting(true);
    await onDelete();
    setDeleting(false);
    setConfirming(false);
    onOpenChange(false);
  }

  return (
    <div className={styles.wrap}>
      {/* Content and actions are normal flex-row siblings inside .track — the
          actions column's height comes from flexbox stretch-alignment against
          content, never from manually matching an absolutely-positioned box.
          .track is wider than .wrap (content 100% + actions width) and
          .wrap clips the overflow; sliding .track left reveals actions
          instead of positioning them independently on top of content. */}
      <div className={styles.track} style={{ transform: isOpen ? `translateX(-${ACTIONS_WIDTH}px)` : "translateX(0)" }}>
        <div
          className={styles.content}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          onClickCapture={handleContentClick}
        >
          {children}
        </div>
        <div className={styles.actions} style={{ width: ACTIONS_WIDTH }}>
          {confirming ? (
            <div className={styles.confirm}>
              <span className={styles.confirmText}>Löschen?</span>
              <button type="button" className={styles.confirmYes} onClick={handleDeleteClick} disabled={deleting}>
                Ja
              </button>
              <button type="button" className={styles.confirmNo} onClick={() => setConfirming(false)} disabled={deleting}>
                Nein
              </button>
            </div>
          ) : (
            <>
              <button
                type="button"
                className={styles.actionEdit}
                onClick={() => {
                  onOpenChange(false);
                  onEdit();
                }}
              >
                <Pencil size={17} strokeWidth={2.2} />
                <span>Bearbeiten</span>
              </button>
              <button type="button" className={styles.actionDelete} onClick={handleDeleteClick}>
                <Trash2 size={17} strokeWidth={2.2} />
                <span>Löschen</span>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
