# App Review – Angaben für Apple

Einzutragen in App Store Connect → Version → **App Review Information**.

## Anmeldedaten

Die Zugangsdaten stehen in `appstore/REVIEW_ACCESS.local.txt` (wird nicht committet). Dort Name und Passwort kopieren:

- „Anmeldename“ = `Apple Review` (Spieler)
- Zweiter Zugang `Apple Review Trainer` (zeigt zusätzlich den Admin-Bereich) → in das Notizfeld

## Kontakt

Vorname, Nachname, Telefon und E-Mail des Betreibers (werden nur von Apple gesehen).

## Notizen für das Review-Team (einfügen)

```
Thank you for reviewing ClubTermine.

ClubTermine is a private organisation app for sports teams (padel/tennis clubs): players register for trainings and match days, and trainers manage courts and groups.

HOW TO SIGN IN
The app signs in with first + last name and a password (no email). Use the demo account from the fields above:
  Player:  name "Apple Review"  – see password field
  Trainer: name "Apple Review Trainer" – same password (shows the admin area)
New self-registrations must be approved by a club manager, so please use the demo accounts. The demo team ("App-Review Demo") is isolated from all real teams.

NATIVE FUNCTIONALITY (guideline 4.2)
• Native push notifications via APNs (new trainings, waitlist promotions, reminders)
• Haptic feedback on interactions, native status bar / splash handling
• Offline cache so lists open instantly without network
• Calendar subscription (iCal) of one's own registrations
• Role-based experience (player / captain / trainer / club manager) with a fair-rotation allocation engine and court-group planner

NO USER-GENERATED CONTENT
There is no chat or other user-to-user messaging. Announcements can only be written by trainers and the club manager (role-based).

ACCOUNT DELETION (guideline 5.1.1(v))
Profile → "Konto löschen" (bottom of the screen) permanently deletes the account and its data after password confirmation.

NO PAYMENTS / NO TRACKING
The app has no in-app purchases, no ads and no third-party analytics or tracking.

Language: German.
```

## Hinweise

- **Konto löschen testen:** Nicht mit den Demo-Konten – sonst sind sie weg. (Sie lassen sich mit `node --env-file=.env.local scripts/seed-review-demo.mjs` neu anlegen, vorher `--remove`.)
- **Demo-Termine** liegen 3, 5 und 10 Tage in der Zukunft. Läuft die Prüfung länger, einmal `--remove` und neu anlegen, damit sie wieder in der Zukunft liegen.
