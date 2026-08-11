# The Padellers — Trainingsanmeldung

Next.js (App Router) + Supabase (Auth, Postgres, Realtime) Umsetzung des Design-Handoffs in
`design_handoff_trainingsapp/` (siehe dort `README.md` für die vollständige Spezifikation).

## Setup

1. Supabase-Projekt einrichten: Schritt-für-Schritt-Anleitung in [`SUPABASE_SETUP.md`](./SUPABASE_SETUP.md).
2. `.env.local` mit den Supabase-Keys befüllen (siehe `.env.example`).
3. `npm install`
4. `npm run dev` und `http://localhost:3000` öffnen.

## Rollen

- **Owner** — genau einer, automatisch der erste registrierte Nutzer, volle Rechte (Termine, Gruppen, Anfragen, Rollen).
- **Trainer** — vom Owner ernannt, verwaltet Termine und Anfragen, aber keine Gruppen/Rollen.
- **Mitglied** — normale Nutzeransicht.

## Projektstruktur

- `src/app` — Next.js-Routen (App Router)
- `src/components` — UI-Komponenten (`ui/`) und Layout-Bausteine (`layout/`, `admin/`)
- `src/lib` — Supabase-Clients, React-Query-Hooks, Realtime, Domain-Helper
- `supabase/migrations` — Datenbankschema, RLS-Policies, RPC-Funktionen, Trigger
- `supabase/seed.sql` — optionale Beispiel-Gruppen

## Scripts

```bash
npm run dev     # Entwicklungsserver
npm run build   # Produktions-Build
npm run lint    # ESLint
```
