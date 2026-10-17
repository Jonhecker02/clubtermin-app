// Haptic feedback for key interactions.
//  * Android / Chrome: navigator.vibrate.
//  * iPhone (Safari 17.4+, home-screen app): Safari has no vibrate API, but
//    toggling a native <input type="checkbox" switch> plays the system tick —
//    the same trick the OS uses for its own switches. It only fires inside a
//    user gesture, which is exactly where we call it.
// Silently does nothing anywhere else.

type HapticKind = "light" | "success" | "error";

const PATTERNS: Record<HapticKind, number | number[]> = {
  light: 8,
  success: [12, 40, 12],
  error: [30, 50, 30, 50, 30],
};

let iosProbe: HTMLLabelElement | null = null;

function iosTick() {
  try {
    if (!iosProbe) {
      iosProbe = document.createElement("label");
      iosProbe.setAttribute("aria-hidden", "true");
      iosProbe.style.cssText = "position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0;pointer-events:none";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.setAttribute("switch", "");
      input.tabIndex = -1;
      iosProbe.appendChild(input);
      document.body.appendChild(iosProbe);
    }
    iosProbe.click();
  } catch {
    // ignore — haptics are a nicety
  }
}

export function haptic(kind: HapticKind = "light"): void {
  if (typeof window === "undefined") return;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  if (typeof navigator.vibrate === "function") {
    navigator.vibrate(PATTERNS[kind]);
    return;
  }
  iosTick();
  if (kind !== "light") setTimeout(iosTick, 90);
}
