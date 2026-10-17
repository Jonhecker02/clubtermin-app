-- Rate limiting for the public auth endpoints (login, self-registration).
-- Counts attempts per key (e.g. "login:<ip>") in a sliding window. Only the
-- server routes call these, with the service role.
create table public.auth_attempts (
  id bigint generated always as identity primary key,
  key text not null,
  created_at timestamptz not null default now()
);

create index auth_attempts_key_created_idx on public.auth_attempts (key, created_at desc);

alter table public.auth_attempts enable row level security;
revoke all on public.auth_attempts from anon, authenticated;

create or replace function public.rate_limit_blocked(p_key text, p_limit integer, p_window_seconds integer)
returns boolean
language sql stable security definer set search_path = public as $$
  select count(*) >= p_limit
  from public.auth_attempts
  where key = p_key and created_at > now() - make_interval(secs => p_window_seconds);
$$;

create or replace function public.rate_limit_record(p_key text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into public.auth_attempts (key) values (p_key);
  -- Housekeeping: nothing older than a day is ever looked at.
  delete from public.auth_attempts where created_at < now() - interval '1 day';
end;
$$;

revoke execute on function public.rate_limit_blocked(text, integer, integer), public.rate_limit_record(text)
  from public, anon, authenticated;
grant execute on function public.rate_limit_blocked(text, integer, integer), public.rate_limit_record(text)
  to service_role;

-- Leftover from the dropped email notifications: handed admins the email
-- addresses of everyone a termin targets. Nothing calls it any more.
drop function if exists public.get_termin_notification_recipients(uuid);
