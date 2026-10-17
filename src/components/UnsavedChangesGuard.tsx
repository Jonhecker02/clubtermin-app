"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/Button";
import { haptic } from "@/lib/haptics";
import {
  cancelLeave,
  confirmLeave,
  hasPendingLeave,
  isDirty,
  isLeaving,
  requestLeave,
  subscribe,
} from "@/lib/unsavedGuard";
import styles from "./UnsavedChangesGuard.module.css";

const SENTINEL = "__unsavedGuard";

// Mounted once for the whole app. While any screen has unsaved changes:
//  * reloading / closing the tab shows the browser's own warning,
//  * the browser back button and the iPhone swipe-back gesture are caught
//    (a spare history entry soaks up the first "back"),
//  * in-app navigation (see useGuardedRouter) and internal links ask first,
// all through the same "Änderungen verwerfen?" dialog.
export function UnsavedChangesGuard() {
  const dirty = useSyncExternalStore(subscribe, isDirty, () => false);
  const pending = useSyncExternalStore(subscribe, hasPendingLeave, () => false);
  const armed = useRef(false);

  // Reload / close tab.
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  // Spare history entry, so "back" lands on the same page instead of leaving.
  useEffect(() => {
    if (dirty && !armed.current) {
      window.history.pushState({ ...(window.history.state ?? {}), [SENTINEL]: true }, "", window.location.href);
      armed.current = true;
    } else if (!dirty && armed.current) {
      armed.current = false;
      // Saved (not left): take the spare entry away again, unless a navigation
      // is already on its way — then history is no longer ours to touch.
      if (!isLeaving() && window.history.state?.[SENTINEL]) window.history.back();
    }
  }, [dirty]);

  // Back button / swipe-back.
  useEffect(() => {
    function onPopState(e: PopStateEvent) {
      if (!armed.current) return;
      // Stepped from the spare entry back onto the real one: hold the user here.
      if (!e.state?.[SENTINEL]) {
        e.stopImmediatePropagation();
        const ok = requestLeave(() => {
          armed.current = false;
          window.history.go(-1);
        });
        if (!ok) haptic("light");
      }
    }
    window.addEventListener("popstate", onPopState, { capture: true });
    return () => window.removeEventListener("popstate", onPopState, { capture: true });
  }, []);

  // Dialog dismissed with "weiter bearbeiten": put the spare entry back.
  const wasPending = useRef(false);
  useEffect(() => {
    if (wasPending.current && !pending && isDirty() && armed.current && !window.history.state?.[SENTINEL]) {
      window.history.pushState({ ...(window.history.state ?? {}), [SENTINEL]: true }, "", window.location.href);
    }
    wasPending.current = pending;
  }, [pending]);

  // Internal <a href> links (the app mostly navigates via the router).
  useEffect(() => {
    if (!dirty) return;
    function onClick(e: MouseEvent) {
      const anchor = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      e.preventDefault();
      e.stopPropagation();
      requestLeave(() => {
        window.location.assign(url.href);
      });
    }
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [dirty]);

  if (!pending) return null;
  return (
    <div className={styles.overlay} role="presentation" onClick={cancelLeave}>
      <div
        className={styles.sheet}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="unsaved-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.grabber} aria-hidden="true" />
        <div id="unsaved-title" className={styles.title}>
          Änderungen nicht gespeichert
        </div>
        <div className={styles.text}>Wenn du die Seite jetzt verlässt, gehen deine Eingaben verloren.</div>
        <div className={styles.actions}>
          <Button variant="accent" size="lg" full onClick={cancelLeave}>
            Weiter bearbeiten
          </Button>
          <Button variant="outline" size="lg" full onClick={confirmLeave}>
            Verwerfen &amp; verlassen
          </Button>
        </div>
      </div>
    </div>
  );
}
