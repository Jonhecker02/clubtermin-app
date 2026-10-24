# Schritt für Schritt in den App Store

Was im Code vorbereitet ist, steht unten unter „Schon erledigt“. Hier steht, was **du** tun musst – in der richtigen Reihenfolge. Reine Wartezeit ist markiert.

## Schon erledigt (im Projekt)

- Server-Adresse der App zeigt auf `https://www.clubtermine.online`
- Push-Berechtigung (`App.entitlements`), Datenschutz-Manifest (`PrivacyInfo.xcprivacy`), nur iPhone, nur Hochformat, Verschlüsselungs-Angabe (`ITSAppUsesNonExemptEncryption = NO`)
- Konto selbst löschen (Profil → Konto löschen), Zustimmung zur Datenschutzerklärung bei der Registrierung
- Seiten für Datenschutz, Impressum, Hilfe & Kontakt (mit deinen Angaben)
- Chat entfernt (dadurch keine Moderationspflicht); Ankündigungen bleiben
- Demo-Zugang für Apples Prüfer, fertige Texte und Antworten (`LISTING.md`, `REVIEW_NOTES.md`, `PRIVACY_LABELS.md`)

## Schritt 1 – Xcode installieren (einmalig, ca. 1 Std., 10+ GB)

1. Mac App Store → **Xcode** laden und einmal öffnen (Lizenz akzeptieren, iOS-Plattform nachinstallieren lassen).
2. Im Terminal einmalig: `sudo xcode-select -s /Applications/Xcode.app/Contents/Developer`
3. In Xcode → Settings → Accounts → mit deiner Apple-ID anmelden (Developer-Account).

## Schritt 2 – App in App Store Connect anlegen

[appstoreconnect.apple.com](https://appstoreconnect.apple.com) → Apps → **+** → Neue App:

- Plattform iOS, Name `ClubTermine` (oder Alternative aus `LISTING.md`), Sprache Deutsch
- **Bundle-ID:** `com.clubtermin.app`. Falls sie nicht in der Liste steht: erst unter developer.apple.com → Certificates, Identifiers & Profiles → Identifiers → **+** → App IDs → Bundle-ID `com.clubtermin.app` anlegen und dabei **Push Notifications** aktivieren.
- SKU: beliebig, z. B. `clubtermine-ios`

## Schritt 3 – Projekt in Xcode öffnen und signieren

```bash
cd /Users/adrianvonderdecken/Downloads/the-padellers-app
open ios/App/App.xcodeproj
```

1. Links das Projekt **App** → Target **App** → Reiter **Signing & Capabilities**.
2. **Team:** dein Developer-Team wählen. „Automatically manage signing“ bleibt an.
3. Prüfen: Dort steht **Push Notifications** (kommt aus `App.entitlements`). Falls nicht: **+ Capability → Push Notifications**.
4. Reiter **General**: Display Name `ClubTermine`, Version `1.0`, Build `1`.

> Hinweis: Das Projekt nutzt Swift Package Manager (CapApp-SPM). Beim ersten Öffnen lädt Xcode die Pakete – kurz warten.

## Schritt 4 – Auf dem eigenen iPhone testen

1. iPhone per Kabel anschließen, oben in Xcode als Ziel wählen, **Run (▶)**.
2. Prüfen: Login, Termine, Anmelden, Ankündigungen, Push erlauben, App schließen und Push empfangen, Konto löschen (mit einem Testkonto!).
3. Push auf einem Xcode-Debug-Build nutzt den Apple-**Sandbox**-Server. Zum Testen in Vercel temporär `APNS_ENV=development` setzen, danach wieder entfernen. Für TestFlight und den App Store gilt Produktion (Standard, nichts setzen).

## Schritt 5 – Archivieren und hochladen

1. Oben als Ziel **Any iOS Device (arm64)** wählen.
2. Menü **Product → Archive**.
3. Im Organizer **Distribute App → App Store Connect → Distribute**. Der Upload dauert wenige Minuten, die Verarbeitung bei Apple ca. 10–30 Minuten (du bekommst eine E-Mail).

## Schritt 6 – TestFlight (optional, aber empfohlen)

In App Store Connect → **TestFlight**: Der Build erscheint nach der Verarbeitung. Interne Tester (bis 100, aus deinem Team) sofort, externe per Link brauchen eine kurze Beta-Prüfung (meist < 1 Tag). So prüfen Kollegen die App, bevor sie öffentlich ist.

## Schritt 7 – Store-Eintrag ausfüllen

Alles Weitere steht fertig in den Dateien:

| Bereich | Datei |
|---|---|
| Texte, Keywords, Kategorie, Altersfreigabe, Screenshots | `LISTING.md` |
| Datenschutz-Angaben, Händlerstatus | `PRIVACY_LABELS.md` |
| Review-Informationen, Demo-Zugang | `REVIEW_NOTES.md` + `REVIEW_ACCESS.local.txt` |

Dann: Build der Version zuordnen → **Zur Prüfung einreichen**.

## Schritt 8 – Warten (Apple-Prüfung)

Meist 1–3 Tage. Bei Rückfragen antwortest du im Resolution Center in App Store Connect. Typische Rückfragen: Demo-Zugang geht nicht, „nur eine Webseite“ (siehe Notizen in `REVIEW_NOTES.md`), fehlende Datenschutz-Angaben.

## Vor dem Einreichen prüfen

- [x] Name, Anschrift, E-Mail in `src/lib/legal.ts` eingetragen
- [x] Migration `0028_store_readiness.sql` ausgeführt
- [ ] Web-App deployed (`npx vercel --prod`), Demo-Login auf www.clubtermine.online funktioniert
- [ ] Demo-Termine liegen in der Zukunft (sonst `scripts/seed-review-demo.mjs` mit `--remove` und neu)
- [ ] Screenshots (6,9 Zoll) hochgeladen
- [ ] Händlerstatus und Datenschutz-Angaben ausgefüllt
- [ ] Altersfreigabe-Fragebogen ausgefüllt
- [ ] Review-Notizen und Demo-Zugang eingetragen

## Neue Versionen später

Code-Änderungen an der Web-App (alles hinter `www.clubtermine.online`) kommen **sofort ohne neues Apple-Update** bei den Nutzern an. Nur Änderungen an `ios/` (Push, Icons, Berechtigungen) brauchen einen neuen Build: Build-Nummer in Xcode erhöhen → Archive → Distribute.
