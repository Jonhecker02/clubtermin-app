-- Fair-rotation allocation now stops at "propose" instead of finalizing
-- immediately at the deadline. The admin reviews the algorithm's suggestion
-- (and why, via the existing registration_allocations log), can flip
-- individual people, then explicitly confirms — nothing about a termin's
-- registrations changes until that confirm happens.
--
-- allocation_run_at keeps its existing column but changes meaning: it used
-- to mean "the batch job finalized this termin"; it now means "an admin
-- confirmed this termin's proposal". allocation_proposed_at is new and
-- marks the earlier, automatic step.
alter table public.termine
  add column if not exists allocation_proposed_at timestamptz;

-- Return type changes (was a push-notify row set, now nothing — nothing is
-- final yet, so nothing to notify players about), which Postgres won't let
-- CREATE OR REPLACE do across a signature change.
drop function if exists public.claim_due_allocations();

-- Same ranking logic as before (rotation-excluded first, then by fairness
-- quote over the team's last 10 trainings), but registrations.status is
-- left untouched — only the registration_allocations log rows get written,
-- and allocation_proposed_at replaces allocation_run_at as the "claim once"
-- guard so this never re-proposes a termin the admin is already reviewing.
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
      with history as (
        select r2.user_id,
               count(*) filter (where r2.status = 'angemeldet') as confirmed,
               count(*) as registered
        from public.registrations r2
        where r2.termin_id in (
          select t3.id from public.termine t3
          where t3.type = 'training' and t3.register_groups = array[v_group_id::text]
            and (t3.date + t3.start_time) < (now() at time zone 'Europe/Berlin')
          order by t3.date desc, t3.start_time desc
          limit 10
        )
        group by r2.user_id
      ),
      group_avg as (
        select avg(h.confirmed::numeric / nullif(h.registered, 0)) as avg_quote from history h
      )
      select
        r.id, r.user_id,
        coalesce(h.confirmed::numeric / nullif(h.registered, 0), ga.avg_quote, 0.5) as quote
      from public.registrations r
      join public.profiles p on p.id = r.user_id
      left join history h on h.user_id = r.user_id
      cross join group_avg ga
      where r.termin_id = v_termin.id and r.status = 'ausstehend' and not p.rotation_excluded
      order by quote asc, r.created_at asc
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

-- Admin toggles one proposed person's inclusion before confirming — called
-- straight from the browser (regular authenticated client), so this one
-- does carry its own is_admin() check, unlike claim_due_allocations/
-- confirm_termin_allocation below which are service-role-only.
create or replace function public.toggle_allocation_inclusion(p_allocation_id uuid, p_included boolean)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'not_authorized';
  end if;
  update public.registration_allocations set included = p_included where id = p_allocation_id;
end;
$$;

revoke execute on function public.toggle_allocation_inclusion(uuid, boolean) from public;
grant execute on function public.toggle_allocation_inclusion(uuid, boolean) to authenticated;

-- Applies a termin's current proposal: every registration_allocations row
-- for it becomes the registration's real status (only rows still
-- 'ausstehend' — someone who cancelled or got manually moved between
-- propose and confirm is left alone), then marks allocation_run_at
-- (the real "this termin is settled" flag). Returns the same push-notify
-- row shape claim_due_allocations used to, since THIS is the step where
-- something is actually final — but service-role-only like that function,
-- since it hands back raw push_subscriptions secrets. No is_admin() check
-- inside (auth.uid() is null under the service role this is always called
-- with) — the calling API route checks the caller is an admin first, same
-- division of responsibility as /api/admin/create-user.
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
           ps.endpoint, ps.p256dh, ps.auth
    from public.registration_allocations ra
    join public.termine t on t.id = ra.termin_id
    left join public.push_subscriptions ps on ps.user_id = ra.user_id
    where ra.termin_id = p_termin_id;
end;
$$;

revoke execute on function public.confirm_termin_allocation(uuid) from public;
