// Tracks whether any screen holds changes that haven't been saved, and lets
// navigation ask before throwing them away. Pure store — the browser-level
// parts (reload warning, back button, the dialog) live in
// components/UnsavedChangesGuard.tsx.

const dirtyKeys = new Set<string>();
const listeners = new Set<() => void>();
let pendingProceed: (() => void) | null = null;
// True for a moment while the user's own "leave anyway" is being carried out,
// so cleanup code doesn't fight the navigation.
let leaving = false;

function emit() {
  listeners.forEach((l) => l());
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setDirty(key: string, dirty: boolean): void {
  const had = dirtyKeys.has(key);
  if (dirty && !had) dirtyKeys.add(key);
  else if (!dirty && had) dirtyKeys.delete(key);
  else return;
  emit();
}

export const isDirty = (): boolean => dirtyKeys.size > 0;
export const hasPendingLeave = (): boolean => pendingProceed !== null;
export const isLeaving = (): boolean => leaving;

// Called before any navigation. Returns true when there is nothing to lose
// (the caller goes ahead); otherwise remembers what the caller wanted to do,
// returns false and lets the dialog decide.
export function requestLeave(proceed: () => void): boolean {
  if (dirtyKeys.size === 0) return true;
  pendingProceed = proceed;
  emit();
  return false;
}

export function confirmLeave(): void {
  const proceed = pendingProceed;
  pendingProceed = null;
  leaving = true;
  dirtyKeys.clear();
  emit();
  proceed?.();
  setTimeout(() => {
    leaving = false;
  }, 1000);
}

export function cancelLeave(): void {
  pendingProceed = null;
  emit();
}
