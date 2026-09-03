-- Backfills a column the app has been sending on every termine insert/update
-- since the "verberge den Öffnungszeitpunkt" feature shipped, but that never
-- actually got added to the database — every single Termin creation (any
-- type) has been failing with "column termine.registration_opens_hidden
-- does not exist" (Postgres 42703) until this runs.
alter table public.termine
  add column if not exists registration_opens_hidden boolean not null default false;
