-- Fair training-slot rotation, replacing pure FCFS waitlist handling for
-- opted-in teams. Rotation only ever applies to a termin whose
-- register_groups is exactly one specific group (not 'all', not several) —
-- "fair rotation" is inherently team-scoped, there's no single team history
-- to rank by once multiple groups/everyone is eligible. Everything here is
-- additive and defaults to off, so termine/groups that don't opt in behave
-- exactly as before.
--
-- IMPORTANT: run this file in TWO separate steps. The `alter type ... add
-- value` below must commit on its own before anything else in this file can
-- reference the new enum value (a well-known Postgres restriction — see
-- 0001_init.sql's own history for the same constraint). Run section 1 alone
-- first, then run the rest (section 2 onward) as a second statement/batch.

-- ============================================================
-- SECTION 1 — run alone, then commit, before anything below
-- ============================================================
alter type public.registration_status add value 'ausstehend';


-- ============================================================
-- SECTION 2 — run after section 1 has committed
-- ============================================================

alter table public.termine
  add column registration_closes_date date,
  add column registration_closes_time time,
  add column allocation_run_at timestamptz;

alter table public.groups
  add column fair_rotation_enabled boolean not null default false;

alter table public.profiles
  add column rotation_excluded boolean not null default false;

-- profiles uses a column-scoped select grant (see 0001_init.sql) — new
-- columns need their own explicit grant, they don't inherit the existing one.
grant select (rotation_excluded) on public.profiles to authenticated;

-- Owner-only toggles, same is_owner() gating as create_group/rename_group.
create or replace function public.set_group_rotation(p_group_id uuid, p_enabled boolean)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_owner() then
    raise exception 'not_authorized';
  end if;
  update public.groups set fair_rotation_enabled = p_enabled where id = p_group_id;
end;
$$;

create or replace function public.admin_set_rotation_excluded(p_user_id uuid, p_excluded boolean)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_owner() then
    raise exception 'not_authorized';
  end if;
  update public.profiles set rotation_excluded = p_excluded where id = p_user_id;
end;
$$;

revoke execute on function
  public.set_group_rotation(uuid, boolean),
  public.admin_set_rotation_excluded(uuid, boolean)
from public;

grant execute on function
  public.set_group_rotation(uuid, boolean),
  public.admin_set_rotation_excluded(uuid, boolean)
to authenticated;

-- One row per player per allocation run — the "explain this allocation" log.
create table public.registration_allocations (
  id uuid primary key default gen_random_uuid(),
  termin_id uuid not null references public.termine (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  quote numeric,
  included boolean not null,
  excluded_from_rotation boolean not null default false,
  decided_at timestamptz not null default now()
);

create index registration_allocations_termin_idx on public.registration_allocations (termin_id);

alter table public.registration_allocations enable row level security;

create policy registration_allocations_select on public.registration_allocations
  for select using (public.is_admin());

grant select on public.registration_allocations to authenticated;

-- ============================================================
-- register_for_termin — unchanged except for a new rotation branch inserted
-- right before the existing instant-capacity-check block. If rotation isn't
-- active for this termin (group flag off, no deadline set, or the deadline
-- already passed), execution falls straight through to the original logic,
-- byte-for-byte.
-- ============================================================
create or replace function public.register_for_termin(p_termin_id uuid)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_max_tn integer;
  v_register_groups text[];
  v_opens_date date;
  v_opens_time time;
  v_closes_date date;
  v_closes_time time;
  v_group_id uuid;
  v_status public.user_status;
  v_current_count integer;
  v_result text;
  v_rotation_group_id uuid;
  v_rotation_active boolean := false;
begin
  select group_id, status into v_group_id, v_status from public.profiles where id = auth.uid();
  if v_status is distinct from 'approved' then
    raise exception 'not_approved';
  end if;

  select max_tn, register_groups, registration_opens_date, registration_opens_time,
         registration_closes_date, registration_closes_time
    into v_max_tn, v_register_groups, v_opens_date, v_opens_time, v_closes_date, v_closes_time
    from public.termine where id = p_termin_id
    for update;

  if v_max_tn is null then
    raise exception 'termin_not_found';
  end if;

  if not ('all' = any (v_register_groups) or v_group_id::text = any (v_register_groups)) then
    raise exception 'not_eligible';
  end if;

  if v_opens_date is not null
     and (v_opens_date + coalesce(v_opens_time, '00:00'::time)) > (now() at time zone 'Europe/Berlin') then
    raise exception 'registration_not_open_yet';
  end if;

  if exists (select 1 from public.registrations where termin_id = p_termin_id and user_id = auth.uid()) then
    raise exception 'already_registered';
  end if;

  if array_length(v_register_groups, 1) = 1 and v_register_groups[1] <> 'all' then
    v_rotation_group_id := v_register_groups[1]::uuid;
    select fair_rotation_enabled into v_rotation_active from public.groups where id = v_rotation_group_id;
  end if;

  if coalesce(v_rotation_active, false)
     and v_closes_date is not null
     and (v_closes_date + coalesce(v_closes_time, '00:00'::time)) > (now() at time zone 'Europe/Berlin') then
    insert into public.registrations (termin_id, user_id, status)
      values (p_termin_id, auth.uid(), 'ausstehend');
    return 'ausstehend';
  end if;

  select count(*) into v_current_count from public.registrations
    where termin_id = p_termin_id and status = 'angemeldet';

  v_result := case when v_current_count < v_max_tn then 'angemeldet' else 'warteliste' end;

  insert into public.registrations (termin_id, user_id, status)
    values (p_termin_id, auth.uid(), v_result::public.registration_status);

  return v_result;
end;
$$;

-- ============================================================
-- admin_add_participant — same rotation branch as register_for_termin,
-- minus the eligibility/cutoff checks it already didn't have.
-- ============================================================
create or replace function public.admin_add_participant(p_termin_id uuid, p_user_id uuid)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_max_tn integer;
  v_register_groups text[];
  v_closes_date date;
  v_closes_time time;
  v_user_status public.user_status;
  v_current_count integer;
  v_result text;
  v_rotation_group_id uuid;
  v_rotation_active boolean := false;
begin
  if not public.is_admin() then
    raise exception 'not_authorized';
  end if;

  select status into v_user_status from public.profiles where id = p_user_id;
  if v_user_status is distinct from 'approved' then
    raise exception 'user_not_approved';
  end if;

  select max_tn, register_groups, registration_closes_date, registration_closes_time
    into v_max_tn, v_register_groups, v_closes_date, v_closes_time
    from public.termine where id = p_termin_id for update;
  if v_max_tn is null then
    raise exception 'termin_not_found';
  end if;

  if exists (select 1 from public.registrations where termin_id = p_termin_id and user_id = p_user_id) then
    raise exception 'already_registered';
  end if;

  if array_length(v_register_groups, 1) = 1 and v_register_groups[1] <> 'all' then
    v_rotation_group_id := v_register_groups[1]::uuid;
    select fair_rotation_enabled into v_rotation_active from public.groups where id = v_rotation_group_id;
  end if;

  if coalesce(v_rotation_active, false)
     and v_closes_date is not null
     and (v_closes_date + coalesce(v_closes_time, '00:00'::time)) > (now() at time zone 'Europe/Berlin') then
    insert into public.registrations (termin_id, user_id, status) values (p_termin_id, p_user_id, 'ausstehend');
    return 'ausstehend';
  end if;

  select count(*) into v_current_count from public.registrations
    where termin_id = p_termin_id and status = 'angemeldet';

  v_result := case when v_current_count < v_max_tn then 'angemeldet' else 'warteliste' end;

  insert into public.registrations (termin_id, user_id, status)
    values (p_termin_id, p_user_id, v_result::public.registration_status);

  return v_result;
end;
$$;

-- ============================================================
-- promote_waitlist — the FIFO branch is untouched (else branch below, same
-- as the original function body); a rotation-aware branch is added ahead of
-- it, active only for termine tied to exactly one rotation-enabled group.
-- ============================================================
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
        select avg(confirmed::numeric / nullif(registered, 0)) as avg_quote from history
      )
      select r.id, r.user_id into v_next_id, v_next_user_id
      from public.registrations r
      left join history h on h.user_id = r.user_id
      cross join group_avg ga
      where r.termin_id = old.termin_id and r.status = 'warteliste'
      order by coalesce(h.confirmed::numeric / nullif(h.registered, 0), ga.avg_quote, 0.5) asc, r.created_at asc
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

-- ============================================================
-- claim_due_allocations — service-role-only, "claim once" pattern (mirrors
-- claim_due_training_reminders). Runs the actual batch decision at the
-- registration deadline for every due, rotation-enabled, single-group
-- termin: reserves spots for rotation_excluded players first (oldest
-- registration first among them), then ranks the rest by fairness quote
-- ascending (lower quote = higher priority) for the remaining capacity.
-- Writes one registration_allocations row per player as it goes (the
-- "explain this allocation" log), then marks allocation_run_at.
-- ============================================================
create or replace function public.claim_due_allocations()
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
  v_termin record;
  v_group_id uuid;
  v_remaining integer;
  v_reg record;
  v_processed_ids uuid[] := '{}';
begin
  for v_termin in
    select t.id, t.max_tn, t.register_groups
    from public.termine t
    where t.registration_closes_date is not null
      and (t.registration_closes_date + coalesce(t.registration_closes_time, '00:00'::time)) <= (now() at time zone 'Europe/Berlin')
      and t.allocation_run_at is null
      and array_length(t.register_groups, 1) = 1
      and t.register_groups[1] <> 'all'
    for update of t
  loop
    v_group_id := v_termin.register_groups[1]::uuid;
    v_processed_ids := array_append(v_processed_ids, v_termin.id);

    -- Capacity already spent by confirmed registrations counts against
    -- max_tn regardless of which branch runs below — covers the edge case
    -- where rotation got toggled off mid-flight and register_for_termin
    -- started instantly confirming people again before the deadline hit.
    select v_termin.max_tn - count(*) into v_remaining
      from public.registrations where termin_id = v_termin.id and status = 'angemeldet';

    -- Rotation got switched off for this group after people already
    -- registered 'ausstehend' for this termin (edge case, but leaving those
    -- rows stuck pending forever would be worse) — fall back to plain
    -- oldest-first resolution instead of ranking by quote, still logged.
    if not exists (select 1 from public.groups g where g.id = v_group_id and g.fair_rotation_enabled) then
      for v_reg in
        select r.id, r.user_id from public.registrations r
        where r.termin_id = v_termin.id and r.status = 'ausstehend'
        order by r.created_at asc
      loop
        if v_remaining > 0 then
          update public.registrations set status = 'angemeldet' where id = v_reg.id;
          insert into public.registration_allocations (termin_id, user_id, quote, included, excluded_from_rotation)
            values (v_termin.id, v_reg.user_id, null, true, false);
          v_remaining := v_remaining - 1;
        else
          update public.registrations set status = 'warteliste' where id = v_reg.id;
          insert into public.registration_allocations (termin_id, user_id, quote, included, excluded_from_rotation)
            values (v_termin.id, v_reg.user_id, null, false, false);
        end if;
      end loop;
      update public.termine set allocation_run_at = now() where id = v_termin.id;
      continue;
    end if;

    -- Step 1: rotation-excluded players get their spot reserved first,
    -- oldest registration first among them.
    for v_reg in
      select r.id, r.user_id from public.registrations r
      join public.profiles p on p.id = r.user_id
      where r.termin_id = v_termin.id and r.status = 'ausstehend' and p.rotation_excluded
      order by r.created_at asc
    loop
      if v_remaining > 0 then
        update public.registrations set status = 'angemeldet' where id = v_reg.id;
        insert into public.registration_allocations (termin_id, user_id, quote, included, excluded_from_rotation)
          values (v_termin.id, v_reg.user_id, null, true, true);
        v_remaining := v_remaining - 1;
      else
        update public.registrations set status = 'warteliste' where id = v_reg.id;
        insert into public.registration_allocations (termin_id, user_id, quote, included, excluded_from_rotation)
          values (v_termin.id, v_reg.user_id, null, false, true);
      end if;
    end loop;

    -- Step 2: remaining capacity goes to the rest, ranked by fairness quote
    -- over the group's last 10 completed trainings (confirmed / registered),
    -- new players default to the group average, brand-new groups to 0.5.
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
        select avg(confirmed::numeric / nullif(registered, 0)) as avg_quote from history
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
        update public.registrations set status = 'angemeldet' where id = v_reg.id;
        insert into public.registration_allocations (termin_id, user_id, quote, included, excluded_from_rotation)
          values (v_termin.id, v_reg.user_id, v_reg.quote, true, false);
        v_remaining := v_remaining - 1;
      else
        update public.registrations set status = 'warteliste' where id = v_reg.id;
        insert into public.registration_allocations (termin_id, user_id, quote, included, excluded_from_rotation)
          values (v_termin.id, v_reg.user_id, v_reg.quote, false, false);
      end if;
    end loop;

    update public.termine set allocation_run_at = now() where id = v_termin.id;
  end loop;

  return query
    select ra.user_id, ra.termin_id, t.title, t.date, t.start_time, t.location, t.register_groups,
           case when ra.included then 'angemeldet' else 'warteliste' end as final_status,
           ps.endpoint, ps.p256dh, ps.auth
    from public.registration_allocations ra
    join public.termine t on t.id = ra.termin_id
    left join public.push_subscriptions ps on ps.user_id = ra.user_id
    where ra.termin_id = any (v_processed_ids);
end;
$$;

revoke execute on function public.claim_due_allocations() from public;
