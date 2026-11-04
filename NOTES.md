# Übergabe-Notizen (Stand 2026-11-04)

Als Erstes lesen, wenn man auf einem Gerät weiterarbeitet. Setup: `DEVELOPMENT.md`.

## Stand
- Web (Vercel, Domain `www.clubtermine.online`) läuft normal im Browser.
- Push: Web Push und APNs sind implementiert; APNs-Env-Variablen sind in Vercel (Production) gesetzt.
- iOS-App "ClubTermine" (`com.clubtermin.app`) baut in Xcode; Push-Capability + `App.entitlements` sind angelegt.
- `capacitor.config.ts` zeigt auf `https://www.clubtermine.online`.

## Offenes Problem
iOS-App zeigt beim Kaltstart ein 404 (Web im Browser ist ok).
- Im nativen Code steht keine URL. Die App liest `ios/App/App/capacitor.config.json` (gitignored, wird von `npx cap sync ios` erzeugt).
- Verdacht: veraltete/fehlende `server.url` dort, dann lädt die App ihr lokales `public/` (ohne index.html) -> 404.
- Nächste Schritte: `npx cap sync ios`, `grep -n "url" ios/App/App/capacitor.config.json` (erwartet `https://www.clubtermine.online`),
  DerivedData löschen (`rm -rf ~/Library/Developer/Xcode/DerivedData/App-*`), in Xcode Clean Build Folder, App vom Gerät löschen, neu starten.
- Falls weiter 404: genauen Text der Fehlerseite + Xcode-Konsole prüfen.

## Hinweise
- Altes Projekt lag auf Mac 1 unter `~/Downloads/the-padellers-app`.
- Xcode-Projekt öffnen: `ios/App/App.xcodeproj` (kein Workspace, SwiftPM).
