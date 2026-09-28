-- Three independent additions:
--
-- 1. Trainer as a real account reference instead of free text, so "wer hat
--    wie oft bei welchem Trainer trainiert" can be computed. The old
--    `trainer` text column stays (every existing read site still uses it
--    for display) — trainer_id is new and denormalized alongside it: the
--    admin picks a trainer from a Select now, and the form writes both
--    (trainer = the picked profile's name, trainer_id = their id).
--    Historical termine keep whatever free text they already had, with
--    trainer_id staying null — they just won't count toward the new stats.
--
-- 2. Player skill level (0-5), visible only to trainer/owner. Follows the
--    exact same pattern as profiles.ical_token: the column is added but
--    deliberately left out of the general column grant, so it's invisible
--    to a normal authenticated client query no matter what RLS allows on
--    the row — reachable only through the two SECURITY DEFINER functions
--    below, both gated by the new is_trainer_or_owner() (captain excluded,
--    unlike is_admin()).
--
-- 3. A concrete reason for players who end up on the waitlist after a fair-
--    rotation allocation. registration_allocations already stores each
--    player's quote from that run — this just (a) lets a player read their
--    own row (new RLS policy, admin-only before) and (b) hands the quote
--    back out of confirm_termin_allocation() so the push notification can
--    quote it too (signature change, same drop+recreate need as before).

alter table public.termine
  add column trainer_id uuid references public.profiles (id) on delete set null;

create index termine_trainer_id_idx on public.termine (trainer_id);

create or replace function public.is_trainer_or_owner()
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role in ('owner', 'trainer') from public.profiles where id = auth.uid()), false);
$$;

alter table public.profiles
  add column skill_level smallint check (skill_level is null or skill_level between 0 and 5);

create or replace function public.get_skill_levels()
returns table (user_id uuid, skill_level smallint)
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_trainer_or_owner() then
    raise exception 'not_authorized';
  end if;
  return query select p.id, p.skill_level from public.profiles p;
end;
$$;

create or replace function public.set_skill_level(p_user_id uuid, p_skill_level smallint)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_trainer_or_owner() then
    raise exception 'not_authorized';
  end if;
  if p_skill_level is not null and (p_skill_level < 0 or p_skill_level > 5) then
    raise exception 'invalid_skill_level';
  end if;
  update public.profiles set skill_level = p_skill_level where id = p_user_id;
end;
$$;

revoke execute on function public.get_skill_levels(), public.set_skill_level(uuid, smallint) from public;
grant execute on function public.get_skill_levels(), public.set_skill_level(uuid, smallint) to authenticated;

-- "wer wie oft bei welchem Trainer trainiert hat" — one row per player per
-- trainer they were actually confirmed for (not just registered), across
-- every completed training that had a trainer_id set.
create or replace function public.get_player_trainer_stats()
returns table (user_id uuid, trainer_id uuid, trainer_name text, session_count int)
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'not_authorized';
  end if;

  return query
    select r.user_id, t.trainer_id, p.name as trainer_name, count(*)::int as session_count
    from public.registrations r
    join public.termine t on t.id = r.termin_id
    join public.profiles p on p.id = t.trainer_id
    where r.status = 'angemeldet' and t.type = 'training' and t.trainer_id is not null
      and (t.date + t.start_time) < (now() at time zone 'Europe/Berlin')
    group by r.user_id, t.trainer_id, p.name;
end;
$$;

revoke execute on function public.get_player_trainer_stats() from public;
grant execute on function public.get_player_trainer_stats() to authenticated;

-- A player could already see the waitlist itself (names/positions are
-- public within a termin) but not their own registration_allocations row,
-- which is where the "why" lives — admin-only until now.
create policy registration_allocations_select_own on public.registration_allocations
  for select using (user_id = auth.uid());

drop function if exists public.confirm_termin_allocation(uuid);

create or replace function public.confirm_termin_allocation(p_termin_id uuid)
returns table (
  user_id uuid,
  termin_id uuid,
  title text,
  date date,
  start_time time,
  location text,
  register_groups text[],
  final_status text,
  quote numeric,
  endpoint text,
  p256dh text,
  auth text
)
language plpgsql security definer set search_path = public as $$
declare
  v_alloc record;
begin
  if not exists (select 1 from public.termine t where t.id = p_termin_id and t.allocation_proposed_at is not null) then
    raise exception 'no_proposal';
  end if;

  for v_alloc in
    select ra.user_id, ra.included from public.registration_allocations ra where ra.termin_id = p_termin_id
  loop
    update public.registrations r
      set status = case when v_alloc.included then 'angemeldet' else 'warteliste' end
      where r.termin_id = p_termin_id and r.user_id = v_alloc.user_id and r.status = 'ausstehend';
  end loop;

  update public.termine set allocation_run_at = now() where id = p_termin_id;

  return query
    select ra.user_id, ra.termin_id, t.title, t.date, t.start_time, t.location, t.register_groups,
           case when ra.included then 'angemeldet' else 'warteliste' end as final_status,
           ra.quote,
           ps.endpoint, ps.p256dh, ps.auth
    from public.registration_allocations ra
    join public.termine t on t.id = ra.termin_id
    left join public.push_subscriptions ps on ps.user_id = ra.user_id
    where ra.termin_id = p_termin_id;
end;
$$;

revoke execute on function public.confirm_termin_allocation(uuid) from public;
