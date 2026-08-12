-- Native Apple Push Notifications (APNs), alongside the existing Web Push
-- (VAPID) system in push_subscriptions. Mirrors that table's RLS/grant shape.
-- Deliberately does NOT touch claim_waitlist_promotions / claim_due_training_reminders /
-- claim_opened_registrations — those are stateful one-shot queue drains and
-- must stay single-caller; APNs resolution happens via separate read-only
-- lookups instead (either re-reading the same group-eligibility rules for
-- admin-triggered routes, or resolving already-claimed user_ids afterward
-- for the service-role routes).

create table public.apns_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  device_token text not null unique,
  created_at timestamptz not null default now()
);

create index apns_tokens_user_idx on public.apns_tokens (user_id);

alter table public.apns_tokens enable row level security;

create policy apns_tokens_select on public.apns_tokens
  for select using (user_id = auth.uid());

create policy apns_tokens_insert on public.apns_tokens
  for insert with check (user_id = auth.uid());

create policy apns_tokens_delete on public.apns_tokens
  for delete using (user_id = auth.uid());

-- Insert is deliberately RPC-only (register_apns_token below) so the
-- collision-safe delete+insert can't be bypassed by a direct table insert.
grant select, delete on public.apns_tokens to authenticated;

-- Self-service registration, called from usePush.ts's native subscribe flow.
-- A plain insert isn't safe the way it is for push_subscriptions: a device
-- token is tied to the physical device+app install, not the browser session,
-- so it collides if a second person logs into the app on the same phone
-- (shared/tester devices) — delete any existing row for this token first.
create or replace function public.register_apns_token(p_device_token text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if trim(p_device_token) = '' then
    raise exception 'device_token_required';
  end if;
  delete from public.apns_tokens where device_token = p_device_token;
  insert into public.apns_tokens (user_id, device_token) values (auth.uid(), p_device_token);
end;
$$;

-- Same shape/eligibility rules as get_termin_push_subscriptions, for APNs.
create or replace function public.get_termin_apns_tokens(p_termin_id uuid)
returns table (device_token text)
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
    select a.device_token
    from public.apns_tokens a
    join public.profiles p on p.id = a.user_id
    where p.status = 'approved'
      and ('all' = any (v_register_groups) or p.group_id::text = any (v_register_groups));
end;
$$;

-- Same shape as get_termin_apns_tokens, for the announcement's visible_groups.
create or replace function public.get_announcement_apns_tokens(p_announcement_id uuid)
returns table (device_token text)
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
    select a.device_token
    from public.apns_tokens a
    join public.profiles p on p.id = a.user_id
    where p.status = 'approved'
      and ('all' = any (v_visible_groups) or p.group_id::text = any (v_visible_groups));
end;
$$;

-- Lets the notify routes prune tokens APNs reports as gone (Unregistered/
-- BadDeviceToken/etc.), mirroring admin_delete_push_subscription.
create or replace function public.admin_delete_apns_token(p_device_token text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'not_authorized';
  end if;
  delete from public.apns_tokens where device_token = p_device_token;
end;
$$;

-- ============================================================
-- SERVICE-ROLE-ONLY FUNCTIONS
-- Same defense-in-depth rationale as 0001_init.sql's service-role-only
-- section: not granted to anon/authenticated, only reachable via the
-- server-side service-role client.
-- ============================================================

-- APNs equivalent of get_confirmed_push_subscriptions. Used by the cron
-- reminder alongside the existing web-push lookup.
create or replace function public.get_confirmed_apns_tokens(p_termin_id uuid)
returns table (user_id uuid, device_token text)
language plpgsql security definer set search_path = public as $$
begin
  return query
  select r.user_id, a.device_token
  from public.registrations r
  join public.apns_tokens a on a.user_id = r.user_id
  where r.termin_id = p_termin_id and r.status = 'angemeldet';
end;
$$;

-- Resolves APNs tokens for a batch of user_ids already produced by
-- claim_waitlist_promotions or claim_opened_registrations — those RPCs stay
-- untouched (stateful one-shot drains); this is a plain, repeatable read
-- called once per route invocation with the distinct user_ids from the
-- already-drained result.
create or replace function public.get_apns_tokens_for_users(p_user_ids uuid[])
returns table (user_id uuid, device_token text)
language sql stable security definer set search_path = public as $$
  select user_id, device_token from public.apns_tokens where user_id = any (p_user_ids);
$$;

revoke execute on function
  public.get_confirmed_apns_tokens(uuid),
  public.get_apns_tokens_for_users(uuid[])
from public;

revoke execute on function
  public.register_apns_token(text),
  public.get_termin_apns_tokens(uuid),
  public.get_announcement_apns_tokens(uuid),
  public.admin_delete_apns_token(text)
from public;

grant execute on function
  public.register_apns_token(text),
  public.get_termin_apns_tokens(uuid),
  public.get_announcement_apns_tokens(uuid),
  public.admin_delete_apns_token(text)
to authenticated;
