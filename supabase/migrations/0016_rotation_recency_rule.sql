-- Fair rotation, simplified and made independent of registration speed.
--
-- Old rule: rank by fairness quote (confirmed / registered), ties broken by
-- registration time — so whoever was on their phone first still won every
-- tie, and quotes are coarse enough that ties are common.
--
-- New rule, one sentence for players: "Wer am längsten nicht dabei war, hat
-- Vorrang." Concretely, candidates are ordered by
--   1. date of their last confirmed training (any team; players who were
--      never confirmed count from the day their account was created),
--      older first,
--   2. then the old quote (confirmed / applications over the last 10), lower
--      first,
--   3. then a lot that is fixed per (termin, player) — an md5-based value, so
--      it can't be influenced by anyone and always reproduces the same order.
-- Registration time no longer plays any role in the rotation ranking.
--
-- Also: the quote's history used to be built only from registrations that
-- still exist, so a player who was turned down and then removed themselves
-- from the waitlist lost that record. The allocation log (which keeps every
-- "not included" decision) now counts too.
--
-- All three ranking spots (batch allocation, waitlist promotion, waitlist
-- display) share ONE function so they can never drift apart again.

alter table public.registration_allocations
  add column if not exists rank_order int,
  add column if not exists applicant_count int,
  -- last confirmed training; for never_participated rows this holds the
  -- day the account was created (the date the player is "waiting since")
  add column if not exists last_participation date,
  add column if not exists never_participated boolean not null default false;

create or replace function public.rotation_priority(p_termin_id uuid, p_user_ids uuid[])
returns table (uid uuid, last_part date, never_part boolean, quote_val numeric, rank_pos int)
language sql stable security definer set search_path = public as $$
  with cand as (
    select u.id as cid from unnest(p_user_ids) as u(id)
  ),
  played as (
    select c.cid,
           (select max(t2.date)
              from public.registrations r2
              join public.termine t2 on t2.id = r2.termin_id
             where r2.user_id = c.cid and r2.status = 'angemeldet' and t2.type = 'training'
               and (t2.date + t2.start_time) < (now() at time zone 'Europe/Berlin')) as last_date
    from cand c
  ),
  history as (
    select c.cid,
           count(*) filter (where h.confirmed) as confirmed,
           count(*) as registered
    from cand c
    join lateral (
      select coalesce(bool_or(r2.status = 'angemeldet'), false) as confirmed
      from public.termine t2
      left join public.registrations r2 on r2.termin_id = t2.id and r2.user_id = c.cid
      left join public.registration_allocations ra
        on ra.termin_id = t2.id and ra.user_id = c.cid and not ra.included
      where t2.type = 'training'
        and (t2.date + t2.start_time) < (now() at time zone 'Europe/Berlin')
        and (r2.id is not null or ra.id is not null)
      group by t2.id, t2.date, t2.start_time
      order by t2.date desc, t2.start_time desc
      limit 10
    ) h on true
    group by c.cid
  ),
  avg_q as (
    select avg(hh.confirmed::numeric / nullif(hh.registered, 0)) as q from history hh
  ),
  scored as (
    select c.cid,
           coalesce(pl.last_date, (p.created_at at time zone 'Europe/Berlin')::date) as eff_date,
           pl.last_date is null as never,
           coalesce(h.confirmed::numeric / nullif(h.registered, 0), a.q, 0.5) as qv,
           ('x' || substr(md5(p_termin_id::text || c.cid::text), 1, 8))::bit(32)::bigint as lot
    from cand c
    join public.profiles p on p.id = c.cid
    join played pl on pl.cid = c.cid
    left join history h on h.cid = c.cid
    cross join avg_q a
  )
  select s.cid, s.eff_date, s.never, s.qv,
         (row_number() over (order by s.eff_date asc, s.qv asc, s.lot asc, s.cid asc))::int
  from scored s;
$$;

-- Internal only: no grant to authenticated (it exposes other players' last
-- participation dates). Reached through the definer functions below.
revoke execute on function public.rotation_priority(uuid, uuid[]) from public;

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
      select r.id, r.user_id into v_next_id, v_next_user_id
      from public.registrations r
      join public.rotation_priority(
        old.termin_id,
        (select coalesce(array_agg(w.user_id), '{}'::uuid[])
           from public.registrations w
          where w.termin_id = old.termin_id and w.status = 'warteliste')
      ) rp on rp.uid = r.user_id
      where r.termin_id = old.termin_id and r.status = 'warteliste'
      order by rp.rank_pos asc
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
      select rp.uid, rp.rank_pos
      from public.rotation_priority(
        p_termin_id,
        (select coalesce(array_agg(w.user_id), '{}'::uuid[])
           from public.registrations w
          where w.termin_id = p_termin_id and w.status = 'warteliste')
      ) rp;
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

create or replace function public.claim_due_allocations()
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_termin record;
  v_group_id uuid;
  v_remaining integer;
  v_reg record;
  v_rank record;
  v_excluded_ids uuid[];
  v_other_ids uuid[];
  v_excluded_count integer;
  v_total integer;
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

    -- Rotation switched off after people already registered 'ausstehend':
    -- plain oldest-first (no rotation to apply), still logged.
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

    select coalesce(array_agg(r.user_id), '{}'::uuid[]) into v_excluded_ids
      from public.registrations r
      join public.profiles p on p.id = r.user_id
      where r.termin_id = v_termin.id and r.status = 'ausstehend' and p.rotation_excluded;
    select coalesce(array_agg(r.user_id), '{}'::uuid[]) into v_other_ids
      from public.registrations r
      join public.profiles p on p.id = r.user_id
      where r.termin_id = v_termin.id and r.status = 'ausstehend' and not p.rotation_excluded;

    v_excluded_count := coalesce(array_length(v_excluded_ids, 1), 0);
    v_total := v_excluded_count + coalesce(array_length(v_other_ids, 1), 0);

    -- Rotation-excluded players first: guaranteed spots, ordered among
    -- themselves by the same rule as everyone else.
    for v_rank in
      select rp.uid, rp.last_part, rp.never_part, rp.rank_pos
      from public.rotation_priority(v_termin.id, v_excluded_ids) rp
      order by rp.rank_pos
    loop
      insert into public.registration_allocations
        (termin_id, user_id, quote, included, excluded_from_rotation, rank_order, applicant_count, last_participation, never_participated)
        values (v_termin.id, v_rank.uid, null, v_remaining > 0, true, v_rank.rank_pos, v_total, v_rank.last_part, v_rank.never_part);
      if v_remaining > 0 then
        v_remaining := v_remaining - 1;
      end if;
    end loop;

    for v_rank in
      select rp.uid, rp.last_part, rp.never_part, rp.quote_val, rp.rank_pos
      from public.rotation_priority(v_termin.id, v_other_ids) rp
      order by rp.rank_pos
    loop
      insert into public.registration_allocations
        (termin_id, user_id, quote, included, excluded_from_rotation, rank_order, applicant_count, last_participation, never_participated)
        values (v_termin.id, v_rank.uid, v_rank.quote_val, v_remaining > 0, false, v_excluded_count + v_rank.rank_pos, v_total, v_rank.last_part, v_rank.never_part);
      if v_remaining > 0 then
        v_remaining := v_remaining - 1;
      end if;
    end loop;

    update public.termine set allocation_proposed_at = now() where id = v_termin.id;
  end loop;
end;
$$;

revoke execute on function public.claim_due_allocations() from public;
