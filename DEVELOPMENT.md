# Entwicklung auf mehreren Geräten

Alles, was zum Weiterarbeiten nötig ist, liegt entweder **im Repo** (Code, Migrationen, iOS-Projekt)
oder in **drei externen Konten** (GitHub, Vercel, Supabase). Geheimnisse liegen **nicht** im Repo.

## Was wo liegt

| Was | Wo |
| --- | --- |
| Code, Migrationen (`supabase/migrations`), iOS-Projekt (`ios/`) | GitHub: `Jonhecker02/clubtermin-app` |
| Produktions-Deploy, Env-Variablen, Domain `clubtermine.online` | Vercel-Projekt |
| Datenbank, Auth, RLS | Supabase-Projekt |
| APNs-Key (`.p8`), Zertifikate, TestFlight | Apple Developer / App Store Connect |

Die Env-Variablen aus `.env.example` stehen in Vercel unter Project → Settings → Environment Variables.
Den APNs-`.p8`-Schlüssel kann man bei Apple nur einmal herunterladen: Kopie im Passwortmanager aufbewahren.

## Setup auf einem neuen Gerät (Web)

```bash
git clone https://github.com/Jonhecker02/clubtermin-app
cd clubtermin-app
npm install
npx vercel link          # einmalig, verknüpft mit dem Vercel-Projekt
npx vercel env pull .env.local   # holt alle Env-Variablen
npm run dev              # http://localhost:3000
```

Ohne Vercel-CLI: `.env.example` nach `.env.local` kopieren und die Werte aus Supabase/Vercel eintragen.

## Setup für die iOS-App (nur Mac mit Xcode)

```bash
npm install
npx cap sync ios
open ios/App/App.xcodeproj
```

- Die App lädt die Oberfläche live von `server.url` in `capacitor.config.ts`
  (aktuell `https://www.clubtermine.online`). Web-Änderungen brauchen deshalb nur einen Vercel-Deploy,
  keinen neuen App-Build. Neu bauen muss man nur bei nativen Änderungen (Swift, Plist, Capabilities, Plugins).
- Bei „Signing" in Xcode das eigene Team wählen (Bundle-ID `com.clubtermin.app`).
- `ios/App/App/capacitor.config.json` wird von `cap sync` erzeugt. Nach jeder Änderung an
  `capacitor.config.ts` `npx cap sync ios` ausführen und in Xcode „Clean Build Folder" (Cmd+Shift+K).
- Release-Ablauf: siehe `appstore/RELEASE_GUIDE.md`.

## Datenbank

Migrationen liegen in `supabase/migrations` (fortlaufend nummeriert). Neue Migration anlegen, im
Supabase-SQL-Editor ausführen und die Datei committen. Anleitung: `SUPABASE_SETUP.md`.

## Arbeitsablauf mit mehreren Geräten

1. Vor dem Arbeiten: `git pull`
2. Nach dem Arbeiten: committen und `git push` (nichts liegen lassen, was nur lokal existiert)
3. Xcode-Änderungen an `project.pbxproj` mitcommitten, wenn sie gewollt sind (z. B. neue Capability)
4. Nie committen: `.env*`, `*.p8`, `*.pem`, `appstore/*.local.*`

## Hinweise für Claude Code

- Cloud-Sitzungen (claude.ai/code) können das Repo klonen und lesen. Zum Pushen muss die
  Claude-GitHub-App für das Repo installiert sein: https://github.com/apps/claude/installations/select_target
- `AGENTS.md`: Dieses Next.js hat Breaking Changes; vor dem Coden die Docs in `node_modules/next/dist/docs/` lesen.
