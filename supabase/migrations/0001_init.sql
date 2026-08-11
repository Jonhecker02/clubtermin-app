-- The Padellers — Trainingsanmeldung
-- Initial schema: tables, RLS, RPC functions, triggers, realtime.
-- Run once against a fresh Supabase project (SQL Editor or `supabase db push`).

create extension if not exists "pgcrypto";

-- ============================================================
-- ENUM TYPES
-- ============================================================
create type public.user_role as enum ('owner', 'trainer', 'captain', 'member');
create type public.user_status as enum ('pending', 'approved', 'rejected');
create type public.termin_type as enum ('training', 'event', 'spieltag');
create type public.registration_status as enum ('angemeldet', 'warteliste');

-- ============================================================
-- TABLES
-- ============================================================
create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,
  -- short display label (e.g. "H00"), distinct from `code` (the join teamcode).
  -- Shown before the group name in Admin > Gruppen, on Termine, and in push notifications.
  short_code text,
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null,
  email text not null unique,
  role public.user_role not null default 'member',
  group_id uuid references public.groups (id) on delete set null,
  status public.user_status,
  -- bearer secret for the personal iCal subscription feed (/api/ical/<token>);
  -- kept out of the normal column grant below, only readable via get_my_ical_token().
  ical_token uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now()
);

create unique index profiles_ical_token_idx on public.profiles (ical_token);

create index profiles_group_id_idx on public.profiles (group_id);

-- type/date/time/location intentionally mirror the design handoff's Termin model 1:1
create table public.termine (
  id uuid primary key default gen_random_uuid(),
  type public.termin_type not null,
  title text not null,
  trainer text not null default '',
  location text not null default '',
  courts text not null default '',
  date date not null,
  start_time time not null,
  end_time time not null,
  description text not null default '',
  max_tn integer not null check (max_tn > 0),
  price numeric(6, 2) check (price is null or price >= 0),
  -- entries are either the literal 'all' or a group id cast to text
  visible_groups text[] not null default array['all'],
  register_groups text[] not null default array['all'],
  notify_create boolean not null default true,
  reminder_enabled boolean not null default true,
  -- internal: set by claim_due_training_reminders() so the 2h-before push
  -- reminder fires exactly once per termin, independent of cron cadence.
  reminder_sent boolean not null default false,
  -- null on both = registration open immediately (the historical default).
  -- Otherwise register_for_termin() rejects attempts before this date+time.
  registration_opens_date date,
  registration_opens_time time,
  -- internal: set by claim_opened_registrations(), mirrors reminder_sent's
  -- exactly-once pattern for the "registration is now open" push.
  registration_opened_notified boolean not null default false,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

create index termine_date_idx on public.termine (date);

create table public.registrations (
  id uuid primary key default gen_random_uuid(),
  termin_id uuid not null references public.termine (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  status public.registration_status not null,
  created_at timestamptz not null default now(),
  unique (termin_id, user_id)
);

create index registrations_termin_status_idx on public.registrations (termin_id, status, created_at);

-- Gruppen-Chat: one channel per group. No edit/delete in v1 (no moderation yet).
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  content text not null check (length(trim(content)) > 0 and length(content) <= 2000),
  created_at timestamptz not null default now()
);

create index messages_group_created_idx on public.messages (group_id, created_at);

-- One-way broadcast posts from admins, distinct from the per-group live Chat.
-- Same visible_groups shape as termine ('all' or specific group ids) so an
-- announcement can be club-wide or scoped to particular groups.
create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  content text not null check (length(trim(content)) > 0 and length(content) <= 2000),
  visible_groups text[] not null default array['all'],
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

create index announcements_created_idx on public.announcements (created_at desc);

-- One row per browser/device a user subscribed to Web Push on.
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

-- Queue of waitlist->confirmed promotions still needing a push notification.
-- Populated by promote_waitlist(), drained by claim_waitlist_promotions()
-- (called from /api/notify/waitlist-promoted right after any cancel/kick).
-- No RLS policies on purpose: only SECURITY DEFINER functions touch this table.
create table public.waitlist_promotions (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null references public.registrations (id) on delete cascade,
  termin_id uuid not null references public.termine (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  notified boolean not null default false,
  created_at timestamptz not null default now()
);

create index waitlist_promotions_pending_idx on public.waitlist_promotions (notified) where not notified;

-- ============================================================
-- HELPER FUNCTIONS (security definer -> bypass RLS on profiles,
-- avoids recursive-policy issues; used inside RLS policies below)
-- ============================================================
create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role in ('owner', 'trainer', 'captain') from public.profiles where id = auth.uid()), false);
$$;

create or replace function public.is_owner()
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'owner' from public.profiles where id = auth.uid()), false);
$$;

create or replace function public.is_approved()
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select status = 'approved' from public.profiles where id = auth.uid()), false);
$$;

-- ============================================================
-- TRIGGERS
-- ============================================================

-- New auth.users row -> create matching profile. First-ever profile becomes 'owner'
-- and gets a default group auto-created + approved immediately: otherwise the very
-- first owner would be stuck on the teamcode screen with no group to enter a code for.
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_is_first boolean;
  v_group_id uuid;
begin
  select not exists (select 1 from public.profiles) into v_is_first;

  if v_is_first then
    insert into public.groups (name, code)
    values ('Hauptgruppe', 'TP-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)) || '-26')
    returning id into v_group_id;
  end if;

  insert into public.profiles (id, name, email, role, group_id, status)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'name'), ''), split_part(new.email, '@', 1)),
    new.email,
    (case when v_is_first then 'owner' else 'member' end)::public.user_role,
    v_group_id,
    case when v_is_first then 'approved'::public.user_status else null end
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Deleting a confirmed ('angemeldet') registration promotes the oldest waitlist entry.
-- Centralized here so cancel/kick/remove-from-group all get correct nachrück-logic for free.
create or replace function public.promote_waitlist()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_next_id uuid;
  v_next_user_id uuid;
begin
  if old.status = 'angemeldet' then
    select id, user_id into v_next_id, v_next_user_id from public.registrations
      where termin_id = old.termin_id and status = 'warteliste'
      order by created_at asc
      limit 1;
    if v_next_id is not null then
      update public.registrations set status = 'angemeldet' where id = v_next_id;
      insert into public.waitlist_promotions (registration_id, termin_id, user_id)
        values (v_next_id, old.termin_id, v_next_user_id);
    end if;
  end if;
  return old;
end;
$$;

create trigger on_registration_deleted
  after delete on public.registrations
  for each row execute function public.promote_waitlist();

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
alter table public.profiles enable row level security;
alter table public.groups enable row level security;
alter table public.termine enable row level security;
alter table public.registrations enable row level security;
alter table public.messages enable row level security;
alter table public.announcements enable row level security;
alter table public.push_subscriptions enable row level security;
-- waitlist_promotions: no policies at all — only reachable through the
-- SECURITY DEFINER functions below (and the service role, which bypasses RLS).
alter table public.waitlist_promotions enable row level security;

-- profiles: own row always; any row once approved (needed to render names/emails
-- across participant lists, admin views, group rosters).
create policy profiles_select on public.profiles
  for select using (id = auth.uid() or public.is_approved());

-- Column-scoped: only the name is writable by the owner of the row (see GRANTS
-- below), so this can't be abused to change role/status/group_id.
create policy profiles_update_own_name on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- groups: admins see every group (Gruppen-Verwaltung, Termin-Formular-Checkboxen);
-- everyone else only sees their own group's row (Profil-Badge, Pending-Screen-Name).
create policy groups_select on public.groups
  for select using (
    public.is_admin()
    or id = (select group_id from public.profiles where id = auth.uid())
  );

-- termine: admins see all; everyone else only termine visible to their group.
create policy termine_select on public.termine
  for select using (
    public.is_admin()
    or (
      public.is_approved()
      and (
        'all' = any (visible_groups)
        or (select group_id from public.profiles where id = auth.uid())::text = any (visible_groups)
      )
    )
  );

create policy termine_insert on public.termine
  for insert with check (public.is_admin());

create policy termine_update on public.termine
  for update using (public.is_admin()) with check (public.is_admin());

-- Cascades to registrations/waitlist_promotions (both on delete cascade),
-- so deleting a termin cleanly drops its registrations too.
create policy termine_delete on public.termine
  for delete using (public.is_admin());

-- registrations: admins see all; everyone else only registrations for termine they can view.
create policy registrations_select on public.registrations
  for select using (
    public.is_admin()
    or (
      public.is_approved()
      and exists (
        select 1 from public.termine t
        where t.id = registrations.termin_id
          and (
            'all' = any (t.visible_groups)
            or (select group_id from public.profiles where id = auth.uid())::text = any (t.visible_groups)
          )
      )
    )
  );

-- messages: admins see/post in every group's chat; everyone else only their own
-- group's chat. No update/delete policy -> no editing or moderation in v1.
create policy messages_select on public.messages
  for select using (
    public.is_admin()
    or (
      public.is_approved()
      and group_id = (select group_id from public.profiles where id = auth.uid())
    )
  );

create policy messages_insert on public.messages
  for insert with check (
    user_id = auth.uid()
    and (
      public.is_admin()
      or (
        public.is_approved()
        and group_id = (select group_id from public.profiles where id = auth.uid())
      )
    )
  );

-- announcements: same visibility rule as termine. No update policy (posts
-- aren't edited); delete only via the owner-gated delete_announcement() RPC.
create policy announcements_select on public.announcements
  for select using (
    public.is_admin()
    or (
      public.is_approved()
      and (
        'all' = any (visible_groups)
        or (select group_id from public.profiles where id = auth.uid())::text = any (visible_groups)
      )
    )
  );

create policy announcements_insert on public.announcements
  for insert with check (created_by = auth.uid() and public.is_admin());

-- push_subscriptions: strictly own rows, both directions (register/unregister a device).
create policy push_subscriptions_select on public.push_subscriptions
  for select using (user_id = auth.uid());

create policy push_subscriptions_insert on public.push_subscriptions
  for insert with check (user_id = auth.uid());

create policy push_subscriptions_delete on public.push_subscriptions
  for delete using (user_id = auth.uid());

-- ============================================================
-- RPC FUNCTIONS
-- All mutations beyond "create a termin" go through these so capacity checks,
-- the 24h cutoff, and the single-owner invariant are enforced server-side,
-- not just in the UI.
-- ============================================================

create or replace function public.submit_teamcode(p_code text)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_group_id uuid;
  v_role public.user_role;
  v_status text;
begin
  select id into v_group_id from public.groups where upper(code) = upper(trim(p_code));
  if v_group_id is null then
    raise exception 'invalid_code';
  end if;

  select role into v_role from public.profiles where id = auth.uid();
  if v_role is null then
    raise exception 'not_authenticated';
  end if;

  v_status := case when v_role in ('owner', 'trainer', 'captain') then 'approved' else 'pending' end;

  update public.profiles
    set group_id = v_group_id, status = v_status::public.user_status
    where id = auth.uid();

  return v_status;
end;
$$;

create or replace function public.retry_code()
returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.profiles set group_id = null, status = null
    where id = auth.uid() and status = 'rejected';
end;
$$;

create or replace function public.approve_request(p_user_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'not_authorized';
  end if;
  update public.profiles set status = 'approved' where id = p_user_id and status = 'pending';
end;
$$;

create or replace function public.reject_request(p_user_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'not_authorized';
  end if;
  update public.profiles set status = 'rejected' where id = p_user_id and status = 'pending';
end;
$$;

-- Locks the termin row so concurrent sign-ups for the same termin serialize,
-- keeping the "first maxTn go to participants, rest to waitlist" rule atomic.
create or replace function public.register_for_termin(p_termin_id uuid)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_max_tn integer;
  v_register_groups text[];
  v_opens_date date;
  v_opens_time time;
  v_group_id uuid;
  v_status public.user_status;
  v_current_count integer;
  v_result text;
begin
  select group_id, status into v_group_id, v_status from public.profiles where id = auth.uid();
  if v_status is distinct from 'approved' then
    raise exception 'not_approved';
  end if;

  select max_tn, register_groups, registration_opens_date, registration_opens_time
    into v_max_tn, v_register_groups, v_opens_date, v_opens_time
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

  select count(*) into v_current_count from public.registrations
    where termin_id = p_termin_id and status = 'angemeldet';

  v_result := case when v_current_count < v_max_tn then 'angemeldet' else 'warteliste' end;

  insert into public.registrations (termin_id, user_id, status)
    values (p_termin_id, auth.uid(), v_result::public.registration_status);

  return v_result;
end;
$$;

-- Cutoff is enforced here (server-side), not just disabled in the UI.
create or replace function public.cancel_registration(p_termin_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_status public.registration_status;
  v_date date;
  v_start_time time;
  v_cutoff_hours numeric := 24; -- keep in sync with CANCEL_CUTOFF_HOURS in the app
begin
  select status into v_status from public.registrations
    where termin_id = p_termin_id and user_id = auth.uid();

  if v_status is null then
    raise exception 'not_registered';
  end if;

  if v_status = 'angemeldet' then
    select date, start_time into v_date, v_start_time from public.termine where id = p_termin_id;
    -- club is based in Essen/Germany; compare wall-clock times in that timezone
    if (v_date + v_start_time) - (now() at time zone 'Europe/Berlin') < (v_cutoff_hours || ' hours')::interval then
      raise exception 'cutoff_passed';
    end if;
  end if;

  delete from public.registrations where termin_id = p_termin_id and user_id = auth.uid();
end;
$$;

create or replace function public.admin_remove_participant(p_termin_id uuid, p_user_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'not_authorized';
  end if;
  delete from public.registrations where termin_id = p_termin_id and user_id = p_user_id;
end;
$$;

-- Manual admin add: bypasses the register_groups eligibility check (any approved
-- member can be added to any termin) and, unlike cancel_registration, has no
-- 24h-cutoff — admins can add people right up to (and after) the start time.
-- Still respects max_tn, same first-come capacity rule as register_for_termin.
create or replace function public.admin_add_participant(p_termin_id uuid, p_user_id uuid)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_max_tn integer;
  v_user_status public.user_status;
  v_current_count integer;
  v_result text;
begin
  if not public.is_admin() then
    raise exception 'not_authorized';
  end if;

  select status into v_user_status from public.profiles where id = p_user_id;
  if v_user_status is distinct from 'approved' then
    raise exception 'user_not_approved';
  end if;

  select max_tn into v_max_tn from public.termine where id = p_termin_id for update;
  if v_max_tn is null then
    raise exception 'termin_not_found';
  end if;

  if exists (select 1 from public.registrations where termin_id = p_termin_id and user_id = p_user_id) then
    raise exception 'already_registered';
  end if;

  select count(*) into v_current_count from public.registrations
    where termin_id = p_termin_id and status = 'angemeldet';

  v_result := case when v_current_count < v_max_tn then 'angemeldet' else 'warteliste' end;

  insert into public.registrations (termin_id, user_id, status)
    values (p_termin_id, p_user_id, v_result::public.registration_status);

  return v_result;
end;
$$;

create or replace function public.create_group(p_name text, p_short_code text default null)
returns public.groups
language plpgsql security definer set search_path = public as $$
declare
  v_name text := trim(p_name);
  v_slug text;
  v_code text;
  v_suffix integer := 0;
  v_row public.groups;
begin
  if not public.is_owner() then
    raise exception 'not_authorized';
  end if;
  if v_name = '' then
    raise exception 'name_required';
  end if;

  v_slug := left(regexp_replace(upper(v_name), '[^A-Z0-9]+', '', 'g'), 12);
  if v_slug = '' then
    v_slug := 'GRUPPE';
  end if;

  loop
    v_code := 'TP-' || v_slug || case when v_suffix = 0 then '' else v_suffix::text end || '-26';
    exit when not exists (select 1 from public.groups where upper(code) = v_code);
    v_suffix := v_suffix + 1;
  end loop;

  insert into public.groups (name, code, short_code)
    values (v_name, v_code, nullif(trim(coalesce(p_short_code, '')), ''))
    returning * into v_row;
  return v_row;
end;
$$;

create or replace function public.rename_group(p_group_id uuid, p_name text, p_short_code text default null)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_owner() then
    raise exception 'not_authorized';
  end if;
  if trim(p_name) = '' then
    raise exception 'name_required';
  end if;
  update public.groups
    set name = trim(p_name),
        short_code = nullif(trim(coalesce(p_short_code, '')), '')
    where id = p_group_id;
end;
$$;

-- Removes a member from their group. Also drops registrations tied exclusively
-- to that one group (register_groups = {group_id}); the waitlist trigger
-- promotes replacements automatically.
create or replace function public.remove_group_member(p_user_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_group_id uuid;
begin
  if not public.is_owner() then
    raise exception 'not_authorized';
  end if;

  select group_id into v_group_id from public.profiles where id = p_user_id;
  if v_group_id is null then
    return;
  end if;

  delete from public.registrations r
    using public.termine t
    where r.termin_id = t.id
      and r.user_id = p_user_id
      and t.register_groups = array[v_group_id::text];

  update public.profiles set group_id = null, status = null where id = p_user_id;
end;
$$;

-- Only the owner may promote/demote 'trainer'/'captain'; the owner role itself is immutable.
create or replace function public.set_user_role(p_user_id uuid, p_role text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_owner() then
    raise exception 'not_authorized';
  end if;
  if p_role not in ('member', 'trainer', 'captain') then
    raise exception 'invalid_role';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'cannot_change_own_role';
  end if;
  update public.profiles set role = p_role::public.user_role
    where id = p_user_id and role <> 'owner';
end;
$$;

-- Admin/Accounts overview: lets the owner fix a name or move someone to a
-- different group directly (bypassing the teamcode flow). Reuses
-- remove_group_member's same-group-only registration cleanup so moving
-- groups can't leave a stale registration for a termin the person no longer
-- has any eligibility for — the waitlist trigger promotes replacements
-- automatically, same as everywhere else registrations get deleted.
create or replace function public.admin_update_profile(p_user_id uuid, p_name text, p_group_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_old_group_id uuid;
begin
  if not public.is_owner() then
    raise exception 'not_authorized';
  end if;
  if trim(p_name) = '' then
    raise exception 'name_required';
  end if;

  select group_id into v_old_group_id from public.profiles where id = p_user_id;

  if v_old_group_id is distinct from p_group_id and v_old_group_id is not null then
    delete from public.registrations r
      using public.termine t
      where r.termin_id = t.id
        and r.user_id = p_user_id
        and t.register_groups = array[v_old_group_id::text];
  end if;

  update public.profiles set name = trim(p_name), group_id = p_group_id where id = p_user_id;
end;
$$;

-- Chat has no moderation beyond this: the owner can delete any message for everyone.
create or replace function public.delete_message(p_message_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_owner() then
    raise exception 'not_authorized';
  end if;
  delete from public.messages where id = p_message_id;
end;
$$;

create or replace function public.delete_announcement(p_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_owner() then
    raise exception 'not_authorized';
  end if;
  delete from public.announcements where id = p_id;
end;
$$;

-- Hands the caller their own iCal subscription-link token (never exposed via
-- a plain profiles select — see the column-scoped grant below).
create or replace function public.get_my_ical_token()
returns uuid
language sql stable security definer set search_path = public as $$
  select ical_token from public.profiles where id = auth.uid();
$$;

-- Called unauthenticated (anon) by the /api/ical/<token> route — Apple
-- Calendar/etc. poll this periodically with no way to send a session. The
-- token itself (122 bits of randomness) is the only credential.
create or replace function public.get_ical_events(p_token uuid)
returns table (
  id uuid,
  title text,
  description text,
  location text,
  date date,
  start_time time,
  end_time time
)
language sql stable security definer set search_path = public as $$
  select t.id, t.title, t.description, t.location, t.date, t.start_time, t.end_time
  from public.termine t
  join public.registrations r on r.termin_id = t.id
  join public.profiles p on p.id = r.user_id
  where p.ical_token = p_token and r.status = 'angemeldet'
  order by t.date, t.start_time;
$$;

-- Who to notify when a termin is created: every approved profile eligible to
-- register for it (same rule as register_for_termin's eligibility check).
-- Admin-only — used by the /api/notify/termin-created route on the admin's behalf.
create or replace function public.get_termin_notification_recipients(p_termin_id uuid)
returns table (
  user_id uuid,
  name text,
  email text
)
language plpgsql security definer set search_path = public as $$
declare
  v_register_groups text[];
begin
  if not public.is_admin() then
    raise exception 'not_authorized';
  end if;

  select register_groups into v_register_groups from public.termine where id = p_termin_id;
  if v_register_groups is null then
    raise exception 'termin_not_found';
  end if;

  return query
    select p.id, p.name, p.email
    from public.profiles p
    where p.status = 'approved'
      and ('all' = any (v_register_groups) or p.group_id::text = any (v_register_groups));
end;
$$;

-- Same eligibility rule as above, but the Web Push subscriptions to send to
-- instead of email addresses — push_subscriptions' own RLS only lets a user
-- read their own rows, so the notify route needs this admin-gated bypass.
create or replace function public.get_termin_push_subscriptions(p_termin_id uuid)
returns table (
  endpoint text,
  p256dh text,
  auth text
)
language plpgsql security definer set search_path = public as $$
declare
  v_register_groups text[];
begin
  if not public.is_admin() then
    raise exception 'not_authorized';
  end if;

  select register_groups into v_register_groups from public.termine where id = p_termin_id;
  if v_register_groups is null then
    raise exception 'termin_not_found';
  end if;

  return query
    select s.endpoint, s.p256dh, s.auth
    from public.push_subscriptions s
    join public.profiles p on p.id = s.user_id
    where p.status = 'approved'
      and ('all' = any (v_register_groups) or p.group_id::text = any (v_register_groups));
end;
$$;

-- Same shape as get_termin_push_subscriptions, for the announcement's
-- visible_groups instead of a termin's register_groups.
create or replace function public.get_announcement_push_subscriptions(p_announcement_id uuid)
returns table (
  endpoint text,
  p256dh text,
  auth text
)
language plpgsql security definer set search_path = public as $$
declare
  v_visible_groups text[];
begin
  if not public.is_admin() then
    raise exception 'not_authorized';
  end if;

  select visible_groups into v_visible_groups from public.announcements where id = p_announcement_id;
  if v_visible_groups is null then
    raise exception 'announcement_not_found';
  end if;

  return query
    select s.endpoint, s.p256dh, s.auth
    from public.push_subscriptions s
    join public.profiles p on p.id = s.user_id
    where p.status = 'approved'
      and ('all' = any (v_visible_groups) or p.group_id::text = any (v_visible_groups));
end;
$$;

-- Lets the notify route prune subscriptions the push service reports as
-- gone (404/410), even for recipients other than the admin who's cleaning up.
create or replace function public.admin_delete_push_subscription(p_endpoint text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'not_authorized';
  end if;
  delete from public.push_subscriptions where endpoint = p_endpoint;
end;
$$;

-- ============================================================
-- SERVICE-ROLE-ONLY FUNCTIONS
-- Deliberately NOT granted to anon/authenticated below — they return other
-- users' push subscription secrets (endpoint/p256dh/auth), so only the
-- server-side service-role client (never exposed to the browser) may call
-- them. Regular Postgres grants don't apply to the service_role, which is
-- why these are safe to leave off both the revoke and grant lists further
-- down; explicitly revoking from PUBLIC here is just defense in depth.
-- ============================================================

-- Drains the pending-notification queue populated by promote_waitlist(),
-- returning everything needed to push-notify each promoted user directly
-- (no separate lookup call, so the secrets never round-trip through a
-- client-callable RPC). Called from /api/notify/waitlist-promoted.
create or replace function public.claim_waitlist_promotions()
returns table (
  user_id uuid,
  termin_id uuid,
  title text,
  date date,
  start_time time,
  location text,
  register_groups text[],
  endpoint text,
  p256dh text,
  auth text
)
language plpgsql security definer set search_path = public as $$
begin
  return query
  with claimed as (
    update public.waitlist_promotions wp
      set notified = true
      where wp.notified = false
      returning wp.user_id, wp.termin_id
  )
  select c.user_id, c.termin_id, t.title, t.date, t.start_time, t.location, t.register_groups,
         ps.endpoint, ps.p256dh, ps.auth
  from claimed c
  join public.termine t on t.id = c.termin_id
  left join public.push_subscriptions ps on ps.user_id = c.user_id;
end;
$$;

-- Atomically finds termine starting within the next 2h that haven't had
-- their reminder sent yet, and marks them sent — so the cron job (whatever
-- its interval) never double-sends. Called from /api/cron/training-reminder.
create or replace function public.claim_due_training_reminders()
returns table (termin_id uuid, title text, date date, start_time time, register_groups text[])
language plpgsql security definer set search_path = public as $$
begin
  return query
  update public.termine t
    set reminder_sent = true
    where t.reminder_enabled = true
      and t.reminder_sent = false
      and (t.date + t.start_time) <= (now() at time zone 'Europe/Berlin') + interval '2 hours'
      and (t.date + t.start_time) > (now() at time zone 'Europe/Berlin')
    returning t.id, t.title, t.date, t.start_time, t.register_groups;
end;
$$;

-- Push targets for everyone confirmed ('angemeldet') for a termin. Used by
-- the cron reminder, which has no single "recipient list" the way the
-- waitlist-promotion queue does.
create or replace function public.get_confirmed_push_subscriptions(p_termin_id uuid)
returns table (user_id uuid, endpoint text, p256dh text, auth text)
language plpgsql security definer set search_path = public as $$
begin
  return query
  select r.user_id, ps.endpoint, ps.p256dh, ps.auth
  from public.registrations r
  join public.push_subscriptions ps on ps.user_id = r.user_id
  where r.termin_id = p_termin_id and r.status = 'angemeldet';
end;
$$;

-- Atomically finds termine whose scheduled registration opening has arrived
-- and haven't been announced yet, marks them notified, and returns push
-- targets for every approved member eligible for that termin's
-- register_groups directly (same "no separate lookup call" shape as
-- claim_waitlist_promotions). Called from /api/cron/training-reminder.
create or replace function public.claim_opened_registrations()
returns table (
  termin_id uuid,
  title text,
  date date,
  start_time time,
  register_groups text[],
  user_id uuid,
  endpoint text,
  p256dh text,
  auth text
)
language plpgsql security definer set search_path = public as $$
begin
  return query
  with due as (
    update public.termine t
      set registration_opened_notified = true
      where t.registration_opens_date is not null
        and (t.registration_opens_date + coalesce(t.registration_opens_time, '00:00'::time)) <= (now() at time zone 'Europe/Berlin')
        and t.registration_opened_notified = false
      returning t.id, t.title, t.date, t.start_time, t.register_groups
  )
  select d.id, d.title, d.date, d.start_time, d.register_groups,
         p.id, ps.endpoint, ps.p256dh, ps.auth
  from due d
  join public.profiles p
    on p.status = 'approved'
    and ('all' = any (d.register_groups) or p.group_id::text = any (d.register_groups))
  left join public.push_subscriptions ps on ps.user_id = p.id;
end;
$$;

revoke execute on function
  public.claim_waitlist_promotions(),
  public.claim_due_training_reminders(),
  public.get_confirmed_push_subscriptions(uuid),
  public.claim_opened_registrations()
from public;

-- ============================================================
-- GRANTS
-- Table access is select-only for clients; every write goes through the
-- SECURITY DEFINER functions above (except creating/editing a termin and
-- posting a chat message, which are plain RLS-gated inserts/updates, and
-- renaming yourself, which is a column-scoped direct update).
-- ============================================================
revoke all on public.profiles, public.groups, public.termine, public.registrations, public.messages, public.announcements, public.push_subscriptions, public.waitlist_promotions from anon, authenticated;
-- profiles: explicit column list so ical_token never leaves the DB through a
-- plain select — it's a bearer secret, only handed out via get_my_ical_token().
grant select (id, name, email, role, group_id, status, created_at) on public.profiles to authenticated;
grant select on public.groups, public.termine, public.registrations, public.messages, public.announcements to authenticated;
grant insert on public.termine, public.messages, public.announcements to authenticated;
grant update on public.termine to authenticated;
grant delete on public.termine to authenticated;
grant update (name) on public.profiles to authenticated;
grant select, insert, delete on public.push_subscriptions to authenticated;

revoke execute on function
  public.submit_teamcode(text),
  public.retry_code(),
  public.approve_request(uuid),
  public.reject_request(uuid),
  public.register_for_termin(uuid),
  public.cancel_registration(uuid),
  public.admin_remove_participant(uuid, uuid),
  public.admin_add_participant(uuid, uuid),
  public.create_group(text, text),
  public.rename_group(uuid, text, text),
  public.remove_group_member(uuid),
  public.set_user_role(uuid, text),
  public.admin_update_profile(uuid, text, uuid),
  public.delete_message(uuid),
  public.delete_announcement(uuid),
  public.get_my_ical_token(),
  public.get_ical_events(uuid),
  public.get_termin_notification_recipients(uuid),
  public.get_termin_push_subscriptions(uuid),
  public.get_announcement_push_subscriptions(uuid),
  public.admin_delete_push_subscription(text)
from public;

grant execute on function
  public.submit_teamcode(text),
  public.retry_code(),
  public.approve_request(uuid),
  public.reject_request(uuid),
  public.register_for_termin(uuid),
  public.cancel_registration(uuid),
  public.admin_remove_participant(uuid, uuid),
  public.admin_add_participant(uuid, uuid),
  public.create_group(text, text),
  public.rename_group(uuid, text, text),
  public.remove_group_member(uuid),
  public.set_user_role(uuid, text),
  public.admin_update_profile(uuid, text, uuid),
  public.delete_message(uuid),
  public.delete_announcement(uuid),
  public.get_my_ical_token(),
  public.get_termin_notification_recipients(uuid),
  public.get_termin_push_subscriptions(uuid),
  public.get_announcement_push_subscriptions(uuid),
  public.admin_delete_push_subscription(text)
to authenticated;

-- get_ical_events is called by the unauthenticated /api/ical/<token> route.
grant execute on function public.get_ical_events(uuid) to anon, authenticated;

-- ============================================================
-- REALTIME
-- ============================================================
alter publication supabase_realtime add table public.termine;
alter publication supabase_realtime add table public.registrations;
alter publication supabase_realtime add table public.profiles;
alter publication supabase_realtime add table public.groups;
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.announcements;

-- ============================================================
-- SCHEDULED JOB (set up once, separately — see chat/README for the exact
-- one-time SQL with the real CRON_SECRET and deployment URL filled in)
-- ============================================================
-- create extension if not exists pg_cron;
-- create extension if not exists pg_net;
-- select cron.schedule(
--   'training-reminder-check',
--   '*/10 * * * *',
--   $$ select net.http_post(
--       url := '<https://your-app>/api/cron/training-reminder',
--       headers := jsonb_build_object('Authorization', 'Bearer <CRON_SECRET>', 'Content-Type', 'application/json'),
--       body := '{}'::jsonb
--     ); $$
-- );
