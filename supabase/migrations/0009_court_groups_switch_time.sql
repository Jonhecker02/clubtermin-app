-- The Runde 1 / Runde 2 boundary used to always be the exact midpoint of
-- start_time/end_time. Usually that's fine (a 2-hour slot splits into 1h
-- training + 1h play either way), but the admin wants to override it for
-- the odd session that isn't a clean 50/50 split. Null keeps the old
-- behaviour (defaults to start_time + 60 min, clamped to end_time) — see
-- the app-side computation in CourtGroupsEditor/CourtGroupsExportCard.
alter table public.termine
  add column if not exists court_groups_switch_time time;
