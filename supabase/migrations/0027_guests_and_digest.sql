-- Einspringer (guest players) and the weekly "mal nachfragen" digest.
--
-- A guest is a normal profile (so registrations, court groups, notes and
-- levels all just work) backed by a disabled login: is_guest = true, no group,
-- never used to sign in. They are created from the termin screen by typing a
-- name, reused when the same person jumps in again, and — if they join the team
-- for good — merged into the real account together with their whole history.

alter table public.profiles
  add column if not exists is_guest boolean not null default false;

grant select (is_guest) on public.profiles to authenticated;

-- Which weekly digests were already sent (so the cron job sends each one once).
create table if not exists public.owner_digest_log (
  kind text not null,
  week_start date not null,
  sent_at timestamptz not null default now(),
  primary key (kind, week_start)
);
alter table public.owner_digest_log enable row level security;
revoke all on public.owner_digest_log from anon, authenticated;

-- Adding someone by hand: a guest must never go into the fair-rotation pool
-- (they would rank first as "never participated" and take a spot from a
-- member who applied) — the admin adds them on purpose, so they get a spot
-- right away if one is free.
create or replace function public.admin_add_participant(p_termin_id uuid, p_user_id uuid)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_max_tn integer;
  v_register_groups text[];
  v_closes_date date;
  v_closes_time time;
  v_user_status text;
  v_is_guest boolean;
  v_taken integer;
  v_rotation_group_id uuid;
  v_rotation_active boolean := false;
begin
  if not public.is_admin() then
    raise exception 'not_authorized';
  end if;

  select status::text, is_guest into v_user_status, v_is_guest from public.profiles where id = p_user_id;
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

  if not coalesce(v_is_guest, false)
     and coalesce(v_rotation_active, false)
     and v_closes_date is not null
     and (v_closes_date + coalesce(v_closes_time, '00:00'::time)) > (now() at time zone 'Europe/Berlin') then
    insert into public.registrations (termin_id, user_id, status) values (p_termin_id, p_user_id, 'ausstehend');
    return 'ausstehend';
  end if;

  select count(*) into v_taken from public.registrations
    where termin_id = p_termin_id and status::text in ('angemeldet', 'ausstehend');

  if v_taken < v_max_tn then
    insert into public.registrations (termin_id, user_id, status) values (p_termin_id, p_user_id, 'angemeldet');
    return 'angemeldet';
  end if;

  insert into public.registrations (termin_id, user_id, status) values (p_termin_id, p_user_id, 'warteliste');
  return 'warteliste';
end;
$$;

-- Merge a guest into the real member: every registration, court-group seat,
-- note and allocation record moves over, so the member's participation
-- history (and rotation fairness) includes everything the guest did. The
-- member keeps their own data; gaps (level, birth date, gender) are filled
-- from the guest, and the member counts as "dabei" since the guest's first
-- appearance. The guest's login (auth user) is deleted by the app afterwards.
-- Clubmanager only.
create or replace function public.merge_guest_into_member(p_guest_id uuid, p_member_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_regs integer;
  v_notes integer;
  v_seats integer;
begin
  if not public.is_owner() then
    raise exception 'not_authorized';
  end if;
  if p_guest_id = p_member_id then
    raise exception 'same_profile';
  end if;
  if not exists (select 1 from public.profiles where id = p_guest_id and is_guest) then
    raise exception 'not_a_guest';
  end if;
  if not exists (select 1 from public.profiles where id = p_member_id and not is_guest) then
    raise exception 'not_a_member';
  end if;

  -- Both on the same termin: keep the member's registration.
  delete from public.registrations g
    using public.registrations m
    where g.user_id = p_guest_id and m.user_id = p_member_id and g.termin_id = m.termin_id;
  update public.registrations set user_id = p_member_id where user_id = p_guest_id;
  get diagnostics v_regs = row_count;

  delete from public.termin_court_group_members g
    using public.termin_court_group_members m
    where g.user_id = p_guest_id and m.user_id = p_member_id and g.group_id = m.group_id;
  update public.termin_court_group_members set user_id = p_member_id where user_id = p_guest_id;
  get diagnostics v_seats = row_count;

  update public.player_notes set user_id = p_member_id where user_id = p_guest_id;
  get diagnostics v_notes = row_count;

  update public.registration_allocations set user_id = p_member_id where user_id = p_guest_id;
  update public.waitlist_promotions set user_id = p_member_id where user_id = p_guest_id;

  update public.profiles m
    set skill_level = coalesce(m.skill_level, g.skill_level),
        birth_date = coalesce(m.birth_date, g.birth_date),
        gender = coalesce(m.gender, g.gender),
        created_at = least(m.created_at, g.created_at)
    from public.profiles g
    where g.id = p_guest_id and m.id = p_member_id;

  return jsonb_build_object('registrations', v_regs, 'court_seats', v_seats, 'notes', v_notes);
end;
$$;

revoke execute on function public.merge_guest_into_member(uuid, uuid) from public, anon;
grant execute on function public.merge_guest_into_member(uuid, uuid) to authenticated;
