# Supabase einrichten

Diese App braucht ein eigenes Supabase-Projekt (kostenloser Free-Plan reicht locker für einen Padel-Club). Alles unten passiert einmalig.

## 1. Projekt anlegen

1. Gehe zu [supabase.com](https://supabase.com) und logge dich ein / erstelle ein Konto.
2. Klicke auf **New Project**.
3. Wähle eine Organisation, vergib einen Projektnamen (z. B. `the-padellers`), setze ein sicheres Datenbank-Passwort (merken oder in einem Passwortmanager speichern) und wähle eine Region in der Nähe (z. B. `eu-central-1 (Frankfurt)`).
4. Klicke **Create new project** und warte, bis das Projekt hochgefahren ist (~2 Minuten).

## 2. API-Keys holen

1. Im Projekt links auf das Zahnrad **Project Settings** → **API**.
2. Kopiere:
   - **Project URL** (sieht aus wie `https://abcdefgh.supabase.co`)
   - **anon public** Key (langer String unter "Project API keys")
3. Im App-Ordner `the-padellers-app/`: kopiere `.env.example` zu `.env.local` und trage beide Werte ein:

```bash
cp .env.example .env.local
```

```
NEXT_PUBLIC_SUPABASE_URL=https://abcdefgh.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

## 3. Datenbank-Schema einspielen

1. Im Supabase-Dashboard links auf **SQL Editor** → **New query**.
2. Öffne die Datei `supabase/migrations/0001_init.sql` aus diesem Projekt, kopiere den kompletten Inhalt und füge ihn in den SQL Editor ein.
3. Klicke **Run**. Das legt alle Tabellen, Sicherheitsregeln (RLS), Funktionen und Trigger an.
4. (Optional) Wiederhole das mit `supabase/seed.sql`, um die drei Beispiel-Gruppen aus dem Design (Trainingsgruppe A/B, Anfänger) direkt anzulegen. Du kannst Gruppen später jederzeit im Admin-Bereich umbenennen oder neue anlegen — das ist nur ein Startpunkt.

**Alternative für später (optional):** Falls du die [Supabase CLI](https://supabase.com/docs/guides/cli) installierst, geht das auch per `supabase link` + `supabase db push` direkt aus diesem Ordner. Für den Start reicht aber der SQL Editor völlig.

## 4. Auth-Einstellungen prüfen

1. **Authentication** → **Providers** → **Email**: sollte standardmäßig aktiviert sein (E-Mail + Passwort). Lass alles auf den Standardwerten.
2. **Authentication** → **URL Configuration**:
   - **Site URL**: für lokale Entwicklung `http://localhost:3000`
   - **Redirect URLs**: füge ebenfalls `http://localhost:3000/**` hinzu
   - Sobald die App später live auf einer echten Domain läuft (z. B. über Vercel), trage die Domain hier zusätzlich ein (z. B. `https://trainingsanmeldung.thepadellers.de/**`) und aktualisiere die Site URL entsprechend.
3. Standardmäßig verlangt Supabase eine E-Mail-Bestätigung nach der Registrierung (**Confirm email** ist an). Das ist die sichere Standardeinstellung — jede:r neue Nutzer:in bekommt eine Bestätigungs-Mail von Supabase und muss den Link klicken, bevor der Login funktioniert. Für einen kleinen Verein reicht das automatische Supabase-Mailsystem (stark ratenlimitiert, aber für wenige Anmeldungen pro Tag ausreichend). Für höheres Volumen später unter **Project Settings → Auth → SMTP Settings** einen eigenen Mailversand (z. B. Resend, Postmark) hinterlegen.
4. Damit nach dem Klick auf den Bestätigungslink der schöne Erfolgs-Screen der App erscheint (statt einer leeren Supabase-Standardseite): **Authentication** → **Email Templates** → **Confirm signup** öffnen und im Link den Platzhalter `{{ .ConfirmationURL }}` ersetzen durch:
   ```
   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup
   ```
   Speichern nicht vergessen. Ohne diesen Schritt funktioniert die Bestätigung trotzdem, landet aber nicht auf dem eigenen Erfolgs-Screen.

## 5. Realtime prüfen

Die Migration aktiviert Realtime für `termine`, `registrations`, `profiles` und `groups` bereits automatisch (`alter publication supabase_realtime add table ...`). Nichts weiter zu tun — das sorgt dafür, dass z. B. der Freigabe-Wartescreen automatisch weiterspringt, sobald ein Admin die Anfrage bestätigt, und dass Teilnehmerlisten auf allen Geräten live aktuell bleiben.

## 6. App lokal starten

Im Ordner `the-padellers-app/`:

```bash
npm install
npm run dev
```

Öffne `http://localhost:3000`.

## 7. Ersten Zugang einrichten

1. Auf **Registrieren** klicken, Name + E-Mail + Passwort eingeben.
2. Falls E-Mail-Bestätigung aktiv ist: die Bestätigungs-Mail öffnen und den Link klicken, danach einloggen.
3. **Der erste registrierte Nutzer wird automatisch zum "Owner"** (volle Admin-Rechte, inkl. Gruppen- und Rollenverwaltung — siehe README im Handoff-Ordner für das Rollenmodell). Das passiert automatisch per Datenbank-Trigger, keine weitere Aktion nötig.
4. Nach dem Login fragt die App nach einem Teamcode. Falls du Schritt 3 in Abschnitt 3 (Seed) ausgeführt hast, funktioniert z. B. `TP-GRUPPEA-26`. Als Owner wirst du sofort freigeschaltet (kein Warten auf Bestätigung).
5. Ab jetzt: im Profil-Tab auf **Admin-Bereich öffnen**, um Termine, Gruppen, Anfragen und Rollen zu verwalten.

## 8. Später live schalten (z. B. Vercel)

1. Projekt zu Vercel deployen (oder Hosting deiner Wahl), `NEXT_PUBLIC_SUPABASE_URL` und `NEXT_PUBLIC_SUPABASE_ANON_KEY` dort als Environment Variables setzen.
2. Supabase **Site URL** / **Redirect URLs** (Schritt 4) um die echte Domain ergänzen.
3. Fertig — die Datenbank ist dieselbe, es ändert sich nur, wo die App gehostet ist.
