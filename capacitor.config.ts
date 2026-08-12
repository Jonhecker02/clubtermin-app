import type { CapacitorConfig } from "@capacitor/cli";

// Bundle-ID ist produktneutral (Produkt: "ClubTermin"), appName bleibt der
// Club-Name dieser konkreten Instanz — der App-Store-Eintrag zeigt Nutzern
// weiterhin "The Padellers", nur die technische ID hängt nicht mehr an einem
// bestimmten Verein.
const config: CapacitorConfig = {
  appId: "com.clubtermin.app",
  appName: "The Padellers",
  webDir: "public",
  server: {
    url: "https://the-padellers-app.vercel.app",
    cleartext: false,
  },
  ios: {
    // "never": WKWebView draws full-bleed (no native safe-area inset), so
    // page backgrounds reach the true screen edge. Content-level clearance
    // (status bar/notch/home indicator) is handled by CSS env(safe-area-inset-*)
    // instead — see AppHeader/IntroShell/BottomNav, plus viewport-fit=cover
    // in layout.tsx (required for env() to resolve to non-zero in WebKit).
    contentInset: "never",
  },
};

export default config;
