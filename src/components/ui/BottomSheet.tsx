"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import { useVisualViewport } from "@/lib/useVisualViewport";
import styles from "./BottomSheet.module.css";

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}

// iOS-style sheet that slides up from the bottom; tapping the dimmed area or
// the close button dismisses it.
export function BottomSheet({ open, onClose, title, subtitle, children }: BottomSheetProps) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Follow the visible area so the keyboard never covers what is being typed.
  const viewport = useVisualViewport(open);

  // When a field gets focus (keyboard opening), keep it in view inside the sheet.
  useEffect(() => {
    if (!open) return;
    function onFocus(e: FocusEvent) {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "TEXTAREA" || el.tagName === "INPUT")) {
        setTimeout(() => el.scrollIntoView({ block: "nearest", behavior: "smooth" }), 320);
      }
    }
    document.addEventListener("focusin", onFocus);
    return () => document.removeEventListener("focusin", onFocus);
  }, [open]);

  if (!open) return null;
  return (
    <div
      className={styles.overlay}
      role="presentation"
      onClick={onClose}
      style={viewport ? { top: viewport.top, bottom: "auto", height: viewport.height } : undefined}
    >
      <div className={styles.sheet} role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className={styles.grabber} aria-hidden="true" />
        <div className={styles.head}>
          <div className={styles.headText}>
            <div className={styles.title}>{title}</div>
            {subtitle && <div className={styles.subtitle}>{subtitle}</div>}
          </div>
          <button type="button" className={styles.close} onClick={onClose} aria-label="Schließen">
            <X size={18} strokeWidth={2.4} />
          </button>
        </div>
        <div className={styles.body}>{children}</div>
      </div>
    </div>
  );
}
