// Appearance: "auto" follows the device, "light"/"dark" force one. The choice is
// kept in localStorage; layout.tsx applies it before first paint (inline
// script) so there is no flash, and applyTheme() keeps it live afterwards.

export type ThemeChoice = "auto" | "light" | "dark";

export const THEME_KEY = "ct-theme";

export function getStoredTheme(): ThemeChoice {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return v === "light" || v === "dark" ? v : "auto";
  } catch {
    return "auto";
  }
}

export function resolveTheme(choice: ThemeChoice): "light" | "dark" {
  if (choice !== "auto") return choice;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function applyTheme(choice: ThemeChoice): void {
  try {
    if (choice === "auto") localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, choice);
  } catch {
    // private mode — the choice just won't survive a reload
  }
  document.documentElement.dataset.theme = resolveTheme(choice);
}

// Source of the inline script in <head>; must stay self-contained.
export const THEME_INIT_SCRIPT = `(function(){try{var c=localStorage.getItem("${THEME_KEY}");var d=c==="dark"||(c!=="light"&&window.matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.dataset.theme=d?"dark":"light";}catch(e){document.documentElement.dataset.theme="light";}})();`;
