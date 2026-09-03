-- Splits a training's confirmed participants into small courts (typically 4
-- players each), each assigned a trainer and a round ("trains in round 1,
-- plays round 2" or vice versa). Fully manual — who goes in which group and
-- with which trainer is a skill/chemistry call only an admin can make — but
-- WHICH round each group trains in should rotate fairly over time, so
-- get_round1_quotes() below gives the admin a fairness signal to work from
-- when deciding that, the same way claim_due_allocations() does for who
-- gets a spot at all.
create table public.termin_court_groups (
  id uuid primary key default gen_random_uuid(),
  termin_id uuid not null references public.termine (id) on delete cascade,
  label text not null,
  trainer_name text not null default '',
  trains_in_round smallint not null check (trains_in_round in (1, 2)),
  created_at timestamptz not null default now()
);

create table public.termin_court_group_members (
  group_id uuid not null references public.termin_court_groups (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  primary key (group_id, user_id)
);

create index termin_court_groups_termin_idx on public.termin_court_groups (termin_id);
create index termin_court_group_members_user_idx on public.termin_court_group_members (user_id);

alter table public.termin_court_groups enable row level security;
alter table public.termin_court_group_members enable row level security;

-- Admin-only for now, matching the request's own framing ("Admins sollen
-- zuordnen können") — members don't see their court/trainer assignment in
-- the app yet; that's a separate, later addition if wanted.
create policy termin_court_groups_select on public.termin_court_groups
  for select using (public.is_admin());
create policy termin_court_group_members_select on public.termin_court_group_members
  for select using (public.is_admin());

grant select on public.termin_court_groups, public.termin_court_group_members to authenticated;

-- Saves a whole grouping at once (delete + reinsert) rather than diffing —
-- the admin builds/edits the full set of groups as one unit in the UI, so
-- there's no partial-update case to support.
create or replace function public.save_termin_court_groups(p_termin_id uuid, p_groups jsonb)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_group jsonb;
  v_group_id uuid;
  v_member_id text;
begin
  if not public.is_admin() then
    raise exception 'not_authorized';
  end if;

  delete from public.termin_court_groups where termin_id = p_termin_id;

  for v_group in select * from jsonb_array_elements(p_groups)
  loop
    insert into public.termin_court_groups (termin_id, label, trainer_name, trains_in_round)
      values (
        p_termin_id,
        v_group->>'label',
        coalesce(v_group->>'trainer_name', ''),
        (v_group->>'trains_in_round')::smallint
      )
      returning id into v_group_id;

    for v_member_id in select jsonb_array_elements_text(v_group->'member_ids')
    loop
      insert into public.termin_court_group_members (group_id, user_id) values (v_group_id, v_member_id::uuid);
    end loop;
  end loop;
end;
$$;

-- Fairness signal for "trains in round 1 vs round 2", scoped to one club
-- team's last 10 training termine that actually had court groups (mirrors
-- claim_due_allocations()'s admission-quote window exactly). A player with
-- no history — or a team with no history at all — defaults the same way:
-- to the team average, or 0.5 if the team has no history either.
create or replace function public.get_round1_quotes(p_club_group_id uuid, p_user_ids uuid[])
returns table (user_id uuid, quote numeric)
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'not_authorized';
  end if;

  return query
  with recent_termine as (
    select t.id from public.termine t
    where t.type = 'training' and t.register_groups = array[p_club_group_id::text]
      and (t.date + t.start_time) < (now() at time zone 'Europe/Berlin')
      and exists (select 1 from public.termin_court_groups cg where cg.termin_id = t.id)
    order by t.date desc, t.start_time desc
    limit 10
  ),
  history as (
    select m.user_id,
           count(*) filter (where cg.trains_in_round = 1) as round1_count,
           count(*) as total_count
    from public.termin_court_group_members m
    join public.termin_court_groups cg on cg.id = m.group_id
    where cg.termin_id in (select id from recent_termine)
    group by m.user_id
  ),
  avg_quote as (
    select avg(h.round1_count::numeric / nullif(h.total_count, 0)) as avg_q from history h
  )
  select u.id,
         coalesce(h.round1_count::numeric / nullif(h.total_count, 0), aq.avg_q, 0.5)
  from unnest(p_user_ids) as u(id)
  left join history h on h.user_id = u.id
  cross join avg_quote aq;
end;
$$;

revoke execute on function public.save_termin_court_groups(uuid, jsonb) from public;
revoke execute on function public.get_round1_quotes(uuid, uuid[]) from public;
grant execute on function public.save_termin_court_groups(uuid, jsonb) to authenticated;
grant execute on function public.get_round1_quotes(uuid, uuid[]) to authenticated;
