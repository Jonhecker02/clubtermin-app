-- Fair rotation applies to TRAININGS only. Events and Spieltage are decided
-- by registration time (or by the admin adding people by hand) — but the
-- waitlist promotion and the displayed waitlist order used the rotation
-- ranking for EVERY termin of a rotation-enabled team, so a cancelled event
-- spot went to whoever had waited longest instead of whoever registered
-- first. Now all three rotation entry points check the termin type:
--   promote_waitlist()       who moves up when a confirmed spot frees up
--   get_waitlist_rank()      the order the waitlist is displayed in
--   claim_due_allocations()  the batch allocation at the deadline
-- (Registration itself already only rotates when a deadline is set, which the
-- app now only offers for trainings.)

create or replace function public.promote_waitlist()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_next_id uuid;
  v_next_user_id uuid;
  v_register_groups text[];
  v_group_id uuid;
  v_type public.termin_type;
  v_rotation_active boolean := false;
begin
  if old.status = 'angemeldet' then
    select t.register_groups, t.type into v_register_groups, v_type from public.termine t where t.id = old.termin_id;

    -- Fair rotation is for trainings only; events and Spieltage move up by
    -- registration time like any other waitlist.
    if v_type = 'training' and array_length(v_register_groups, 1) = 1 and v_register_groups[1] <> 'all' then
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
  v_type public.termin_type;
begin
  select t.register_groups, t.type into v_register_groups, v_type from public.termine t where t.id = p_termin_id;

  if v_type = 'training' and v_register_groups is not null and array_length(v_register_groups, 1) = 1 and v_register_groups[1] <> 'all'
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
    where t.type = 'training'
      and t.registration_closes_date is not null
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
