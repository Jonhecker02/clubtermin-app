import type { CapacitorConfig } from "@capacitor/cli";

// Sowohl die Bundle-ID als auch der sichtbare App-Name sind produktneutral
// ("ClubTermine") — das Icon/App-Label auf dem Homescreen hängt nicht mehr
// an einem bestimmten Verein. Die eigentliche App-Oberfläche (Wordmark,
// Login-Screen etc.) bleibt weiterhin "The Padellers"-gebrandet, da dieser
// Deploy konkret für diesen Verein läuft.
const config: CapacitorConfig = {
  appId: "com.clubtermin.app",
  appName: "ClubTermine",
  webDir: "public",
  server: {
    url: "https://clubtermine-app.vercel.app",
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
