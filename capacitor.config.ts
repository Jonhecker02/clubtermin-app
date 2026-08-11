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
    contentInset: "always",
  },
};

export default config;
