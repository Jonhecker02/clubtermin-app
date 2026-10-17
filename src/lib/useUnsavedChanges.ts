"use client";

import { useEffect, useId } from "react";
import { setDirty } from "./unsavedGuard";

// Call with `true` while a screen holds changes that aren't saved yet.
// Leaving then asks first (in-app navigation, back button/swipe, reload,
// closing the tab). Cleared automatically when the screen goes away.
export function useUnsavedChanges(dirty: boolean): void {
  const id = useId();
  useEffect(() => {
    setDirty(id, dirty);
    return () => setDirty(id, false);
  }, [dirty, id]);
}
