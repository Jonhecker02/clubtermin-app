-- "Nachrücker": after the registration deadline of a fair-rotation training,
-- people can still sign up for spots that are free. Two gaps in the old logic
-- are closed at the same time:
--   * a late sign-up counted only CONFIRMED people, so between the deadline
--     and the admin's confirmation it could take a spot away from someone who
--     had applied in time (their registration was still 'ausstehend');
--   * a sign-up in the few minutes between the deadline and the moment the
--     allocation is computed would have been treated the same way.
-- New rule after the deadline:
--   allocation not computed yet  -> joins the pending pool ('ausstehend'), so
--                                   it is allocated fairly with everyone else
--   otherwise                    -> free spot (confirmed + pending < max) means
--                                   'angemeldet' right away (a Nachrücker),
--                                   else 'warteliste'.
-- Court-group placement of a Nachrücker is proposed in the app and confirmed
-- by the Clubmanager when saving the groups.

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
  v_proposed_at timestamptz;
  v_group_id uuid;
  v_status public.user_status;
  v_taken integer;
  v_result text;
  v_rotation_group_id uuid;
  v_rotation_active boolean := false;
  v_deadline_passed boolean := false;
begin
  select group_id, status into v_group_id, v_status from public.profiles where id = auth.uid();
  if v_status is distinct from 'approved' then
    raise exception 'not_approved';
  end if;

  select max_tn, register_groups, registration_opens_date, registration_opens_time,
         registration_closes_date, registration_closes_time, allocation_proposed_at
    into v_max_tn, v_register_groups, v_opens_date, v_opens_time, v_closes_date, v_closes_time, v_proposed_at
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

  if coalesce(v_rotation_active, false) and v_closes_date is not null then
    v_deadline_passed := (v_closes_date + coalesce(v_closes_time, '00:00'::time)) <= (now() at time zone 'Europe/Berlin');

    -- Before the deadline, or after it but before the allocation was computed:
    -- everybody waits in the pool and is allocated together.
    if not v_deadline_passed or v_proposed_at is null then
      insert into public.registrations (termin_id, user_id, status)
        values (p_termin_id, auth.uid(), 'ausstehend');
      return 'ausstehend';
    end if;
  end if;

  -- People still waiting for the allocation hold a spot too.
  select count(*) into v_taken from public.registrations
    where termin_id = p_termin_id and status in ('angemeldet', 'ausstehend');

  v_result := case when v_taken < v_max_tn then 'angemeldet' else 'warteliste' end;

  insert into public.registrations (termin_id, user_id, status)
    values (p_termin_id, auth.uid(), v_result::public.registration_status);

  return v_result;
end;
$$;

create or replace function public.admin_add_participant(p_termin_id uuid, p_user_id uuid)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_max_tn integer;
  v_register_groups text[];
  v_closes_date date;
  v_closes_time time;
  v_user_status public.user_status;
  v_taken integer;
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

  select count(*) into v_taken from public.registrations
    where termin_id = p_termin_id and status in ('angemeldet', 'ausstehend');

  v_result := case when v_taken < v_max_tn then 'angemeldet' else 'warteliste' end;

  insert into public.registrations (termin_id, user_id, status)
    values (p_termin_id, p_user_id, v_result::public.registration_status);

  return v_result;
end;
$$;
