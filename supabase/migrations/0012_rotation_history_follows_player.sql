-- The fairness quote (confirmed / registered, used to rank who gets the next
-- free spot) was scoped to "the group's own last 10 completed trainings" —
-- so a player who switches teams loses all of their history the moment they
-- join the new group: none of their old team's termine are in the new
-- team's last-10 window, so they look brand-new and get the group-average
-- fallback instead of their real track record. This makes the quote follow
-- the PLAYER instead: their own last 10 training registrations, across
-- whichever team(s) they were on at the time. Only the ranking pool itself
-- (who's actually being compared right now) stays scoped to the specific
-- termin's candidates — that part hasn't changed.
--
-- get_round1_quotes() (0007_court_groups.sql, court-group round placement)
-- intentionally keeps its old team-scoped-window behavior — round 1 vs.
-- round 2 placement is about balancing the CURRENT team's roster, not a
-- personal reliability track record, so it isn't touched here.

create or replace function public.promote_waitlist()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_next_id uuid;
  v_next_user_id uuid;
  v_register_groups text[];
  v_group_id uuid;
  v_rotation_active boolean := false;
begin
  if old.status = 'angemeldet' then
    select register_groups into v_register_groups from public.termine where id = old.termin_id;

    if array_length(v_register_groups, 1) = 1 and v_register_groups[1] <> 'all' then
      v_group_id := v_register_groups[1]::uuid;
      select fair_rotation_enabled into v_rotation_active from public.groups where id = v_group_id;
    end if;

    if coalesce(v_rotation_active, false) then
      with candidates as (
        select r.id, r.user_id, r.created_at
        from public.registrations r
        where r.termin_id = old.termin_id and r.status = 'warteliste'
      ),
      history as (
        select c.user_id,
               count(*) filter (where h.status = 'angemeldet') as confirmed,
               count(*) as registered
        from candidates c
        join lateral (
          select r2.status
          from public.registrations r2
          join public.termine t2 on t2.id = r2.termin_id
          where r2.user_id = c.user_id and t2.type = 'training'
            and (t2.date + t2.start_time) < (now() at time zone 'Europe/Berlin')
          order by t2.date desc, t2.start_time desc
          limit 10
        ) h on true
        group by c.user_id
      ),
      group_avg as (
        select avg(confirmed::numeric / nullif(registered, 0)) as avg_quote from history
      )
      select c.id, c.user_id into v_next_id, v_next_user_id
      from candidates c
      left join history h on h.user_id = c.user_id
      cross join group_avg ga
      order by coalesce(h.confirmed::numeric / nullif(h.registered, 0), ga.avg_quote, 0.5) asc, c.created_at asc
      limit 1;
    else
      select id, user_id into v_next_id, v_next_user_id from public.registrations
        where termin_id = old.termin_id and status = 'warteliste'
        order by created_at asc
        limit 1;
    end if;

    if v_next_id is not null then
      update public.registrations set status = 'angemeldet' where id = v_next_id;
      insert into public.waitlist_promotions (registration_id, termin_id, user_id)
        values (v_next_id, old.termin_id, v_next_user_id);
    end if;
  end if;
  return old;
end;
$$;

create or replace function public.claim_due_allocations()
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_termin record;
  v_group_id uuid;
  v_remaining integer;
  v_reg record;
begin
  for v_termin in
    select t.id, t.max_tn, t.register_groups
    from public.termine t
    where t.registration_closes_date is not null
      and (t.registration_closes_date + coalesce(t.registration_closes_time, '00:00'::time)) <= (now() at time zone 'Europe/Berlin')
      and t.allocation_proposed_at is null
      and array_length(t.register_groups, 1) = 1
      and t.register_groups[1] <> 'all'
    for update of t
  loop
    v_group_id := v_termin.register_groups[1]::uuid;

    select v_termin.max_tn - count(*) into v_remaining
      from public.registrations r where r.termin_id = v_termin.id and r.status = 'angemeldet';

    if not exists (select 1 from public.groups g where g.id = v_group_id and g.fair_rotation_enabled) then
      for v_reg in
        select r.id, r.user_id from public.registrations r
        where r.termin_id = v_termin.id and r.status = 'ausstehend'
        order by r.created_at asc
      loop
        if v_remaining > 0 then
          insert into public.registration_allocations (termin_id, user_id, quote, included, excluded_from_rotation)
            values (v_termin.id, v_reg.user_id, null, true, false);
          v_remaining := v_remaining - 1;
        else
          insert into public.registration_allocations (termin_id, user_id, quote, included, excluded_from_rotation)
            values (v_termin.id, v_reg.user_id, null, false, false);
        end if;
      end loop;
      update public.termine set allocation_proposed_at = now() where id = v_termin.id;
      continue;
    end if;

    for v_reg in
      select r.id, r.user_id from public.registrations r
      join public.profiles p on p.id = r.user_id
      where r.termin_id = v_termin.id and r.status = 'ausstehend' and p.rotation_excluded
      order by r.created_at asc
    loop
      if v_remaining > 0 then
        insert into public.registration_allocations (termin_id, user_id, quote, included, excluded_from_rotation)
          values (v_termin.id, v_reg.user_id, null, true, true);
        v_remaining := v_remaining - 1;
      else
        insert into public.registration_allocations (termin_id, user_id, quote, included, excluded_from_rotation)
          values (v_termin.id, v_reg.user_id, null, false, true);
      end if;
    end loop;

    for v_reg in
      with candidates as (
        select r.id, r.user_id, r.created_at
        from public.registrations r
        join public.profiles p on p.id = r.user_id
        where r.termin_id = v_termin.id and r.status = 'ausstehend' and not p.rotation_excluded
      ),
      history as (
        select c.user_id,
               count(*) filter (where h.status = 'angemeldet') as confirmed,
               count(*) as registered
        from candidates c
        join lateral (
          select r2.status
          from public.registrations r2
          join public.termine t2 on t2.id = r2.termin_id
          where r2.user_id = c.user_id and t2.type = 'training'
            and (t2.date + t2.start_time) < (now() at time zone 'Europe/Berlin')
          order by t2.date desc, t2.start_time desc
          limit 10
        ) h on true
        group by c.user_id
      ),
      group_avg as (
        select avg(confirmed::numeric / nullif(registered, 0)) as avg_quote from history
      )
      select
        c.id, c.user_id,
        coalesce(h.confirmed::numeric / nullif(h.registered, 0), ga.avg_quote, 0.5) as quote
      from candidates c
      left join history h on h.user_id = c.user_id
      cross join group_avg ga
      order by quote asc, c.created_at asc
    loop
      if v_remaining > 0 then
        insert into public.registration_allocations (termin_id, user_id, quote, included, excluded_from_rotation)
          values (v_termin.id, v_reg.user_id, v_reg.quote, true, false);
        v_remaining := v_remaining - 1;
      else
        insert into public.registration_allocations (termin_id, user_id, quote, included, excluded_from_rotation)
          values (v_termin.id, v_reg.user_id, v_reg.quote, false, false);
      end if;
    end loop;

    update public.termine set allocation_proposed_at = now() where id = v_termin.id;
  end loop;
end;
$$;

revoke execute on function public.claim_due_allocations() from public;

create or replace function public.get_waitlist_rank(p_termin_id uuid)
returns table (user_id uuid, rank_order int)
language plpgsql security definer set search_path = public as $$
declare
  v_register_groups text[];
begin
  select t.register_groups into v_register_groups from public.termine t where t.id = p_termin_id;

  if v_register_groups is not null and array_length(v_register_groups, 1) = 1 and v_register_groups[1] <> 'all'
     and exists (
       select 1 from public.groups g
       where g.id = v_register_groups[1]::uuid and g.fair_rotation_enabled
     )
  then
    return query
      with candidates as (
        select r.user_id, r.created_at
        from public.registrations r
        where r.termin_id = p_termin_id and r.status = 'warteliste'
      ),
      history as (
        select c.user_id,
               count(*) filter (where h.status = 'angemeldet') as confirmed,
               count(*) as registered
        from candidates c
        join lateral (
          select r2.status
          from public.registrations r2
          join public.termine t2 on t2.id = r2.termin_id
          where r2.user_id = c.user_id and t2.type = 'training'
            and (t2.date + t2.start_time) < (now() at time zone 'Europe/Berlin')
          order by t2.date desc, t2.start_time desc
          limit 10
        ) h on true
        group by c.user_id
      ),
      group_avg as (
        select avg(confirmed::numeric / nullif(registered, 0)) as avg_quote from history
      ),
      ranked as (
        select c.user_id,
               coalesce(h.confirmed::numeric / nullif(h.registered, 0), ga.avg_quote, 0.5) as quote,
               c.created_at
        from candidates c
        left join history h on h.user_id = c.user_id
        cross join group_avg ga
      )
      select ranked.user_id, (row_number() over (order by ranked.quote asc, ranked.created_at asc))::int
      from ranked;
  else
    return query
      select r.user_id, (row_number() over (order by r.created_at asc))::int
      from public.registrations r
      where r.termin_id = p_termin_id and r.status = 'warteliste';
  end if;
end;
$$;

revoke execute on function public.get_waitlist_rank(uuid) from public;
grant execute on function public.get_waitlist_rank(uuid) to authenticated;
