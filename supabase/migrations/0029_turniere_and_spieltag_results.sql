-- Two additions to the termine:
--
-- 1. A new type "turnier" (e.g. GPS tournaments). Registration does not happen
--    in the app: the termin carries an external link and a short hint on how
--    to sign up. The database refuses app registrations for these termine.
-- 2. Results for Spieltage. A Spieltag has several Begegnungen (one opponent
--    team each), and each Begegnung has several Spiele (e.g. three doubles)
--    with the players on both sides and the set scores.

-- ---------------------------------------------------------------------------
-- 1. Turniere
-- ---------------------------------------------------------------------------
alter type public.termin_type add value if not exists 'turnier';

alter table public.termine
  add column if not exists external_url text check (external_url is null or length(external_url) <= 500),
  add column if not exists external_hint text check (external_hint is null or length(external_hint) <= 1000);

-- Nobody registers for a tournament through the app — not via the register
-- function, not via the admin "add participant" function. Compared as text so
-- this does not depend on the new enum value being committed yet.
create or replace function public.block_turnier_registration()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.termine t where t.id = new.termin_id and t.type::text = 'turnier') then
    raise exception 'registration_not_possible';
  end if;
  return new;
end;
$$;

drop trigger if exists registrations_block_turnier on public.registrations;
create trigger registrations_block_turnier
  before insert on public.registrations
  for each row execute function public.block_turnier_registration();

-- ---------------------------------------------------------------------------
-- 2. Spieltag results
-- ---------------------------------------------------------------------------
create table public.spieltag_matches (
  id uuid primary key default gen_random_uuid(),
  termin_id uuid not null references public.termine (id) on delete cascade,
  opponent text not null check (length(trim(opponent)) between 1 and 80),
  position integer not null default 1,
  created_at timestamptz not null default now()
);

create index spieltag_matches_termin_idx on public.spieltag_matches (termin_id, position);

create table public.spieltag_games (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.spieltag_matches (id) on delete cascade,
  position integer not null default 1,
  -- Our pair. A deleted account just leaves the slot empty ("former member").
  our_player_1 uuid references public.profiles (id) on delete set null,
  our_player_2 uuid references public.profiles (id) on delete set null,
  -- The opponents, free text and optional.
  opp_player_1 text not null default '' check (length(opp_player_1) <= 80),
  opp_player_2 text not null default '' check (length(opp_player_2) <= 80),
  -- [[6,3],[4,6],[10,8]] — our games first. An empty list = not played / not entered yet.
  sets jsonb not null default '[]'::jsonb
    check (jsonb_typeof(sets) = 'array' and jsonb_array_length(sets) <= 5),
  created_at timestamptz not null default now()
);

create index spieltag_games_match_idx on public.spieltag_games (match_id, position);

alter table public.spieltag_matches enable row level security;
alter table public.spieltag_games enable row level security;

-- Readable by everybody who can see the Spieltag itself (the termine policy
-- applies inside the subquery); written by admins only.
create policy spieltag_matches_select on public.spieltag_matches
  for select using (exists (select 1 from public.termine t where t.id = termin_id));
create policy spieltag_matches_insert on public.spieltag_matches for insert with check (public.is_admin());
create policy spieltag_matches_update on public.spieltag_matches for update using (public.is_admin()) with check (public.is_admin());
create policy spieltag_matches_delete on public.spieltag_matches for delete using (public.is_admin());

create policy spieltag_games_select on public.spieltag_games
  for select using (exists (select 1 from public.spieltag_matches m where m.id = match_id));
create policy spieltag_games_insert on public.spieltag_games for insert with check (public.is_admin());
create policy spieltag_games_update on public.spieltag_games for update using (public.is_admin()) with check (public.is_admin());
create policy spieltag_games_delete on public.spieltag_games for delete using (public.is_admin());

revoke all on public.spieltag_matches, public.spieltag_games from anon, authenticated;
grant select, insert, update, delete on public.spieltag_matches, public.spieltag_games to authenticated;
