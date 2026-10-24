-- App Store readiness.
--
-- 1. Chat moderation (Apple guideline 1.2 for user-generated content): members
--    can report a message and block another user; the Clubmanager sees the
--    reports and removes the content.
-- 2. Account deletion by the user themselves (guideline 5.1.1 (v)): deleting an
--    auth user must not be blocked by rows that merely remember who created
--    something, so those references turn into "unknown" instead of blocking.
-- 3. Proof that someone agreed to the usage rules when registering.

-- ---------------------------------------------------------------------------
-- 2. created_by must not block deleting an account (was: plain reference).
-- ---------------------------------------------------------------------------
alter table public.termine drop constraint if exists termine_created_by_fkey;
alter table public.termine
  add constraint termine_created_by_fkey foreign key (created_by) references public.profiles (id) on delete set null;

alter table public.announcements drop constraint if exists announcements_created_by_fkey;
alter table public.announcements
  add constraint announcements_created_by_fkey foreign key (created_by) references public.profiles (id) on delete set null;

-- ---------------------------------------------------------------------------
-- 3. Consent timestamp (written by the register route; never readable by clients).
-- ---------------------------------------------------------------------------
alter table public.profiles add column if not exists terms_accepted_at timestamptz;

-- ---------------------------------------------------------------------------
-- 1a. Blocking: a blocked user's messages are hidden for the blocker.
-- ---------------------------------------------------------------------------
create table public.user_blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

alter table public.user_blocks enable row level security;

create policy user_blocks_select on public.user_blocks for select using (blocker_id = auth.uid());
create policy user_blocks_insert on public.user_blocks for insert with check (blocker_id = auth.uid() and public.is_approved());
create policy user_blocks_delete on public.user_blocks for delete using (blocker_id = auth.uid());

revoke all on public.user_blocks from anon, authenticated;
grant select, insert, delete on public.user_blocks to authenticated;

-- ---------------------------------------------------------------------------
-- 1b. Reporting: one report per reporter and message; admins read, the owner
--     resolves them. Reports vanish together with the message.
-- ---------------------------------------------------------------------------
create table public.message_reports (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages (id) on delete cascade,
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  reason text not null default '' check (length(reason) <= 500),
  created_at timestamptz not null default now(),
  unique (message_id, reporter_id)
);

create index message_reports_message_idx on public.message_reports (message_id);

alter table public.message_reports enable row level security;

create policy message_reports_select on public.message_reports for select using (public.is_admin());
create policy message_reports_delete on public.message_reports for delete using (public.is_owner());

revoke all on public.message_reports from anon, authenticated;
grant select, delete on public.message_reports to authenticated;

-- Reporting goes through a function so a client can only report a message it
-- is actually allowed to see, and only as itself.
create or replace function public.report_message(p_message_id uuid, p_reason text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_group_id uuid;
  v_author uuid;
begin
  if not public.is_approved() then
    raise exception 'not_authorized';
  end if;

  select group_id, user_id into v_group_id, v_author from public.messages where id = p_message_id;
  if v_group_id is null then
    raise exception 'message_not_found';
  end if;
  if v_author = auth.uid() then
    raise exception 'own_message';
  end if;
  if not public.is_admin()
     and v_group_id is distinct from (select group_id from public.profiles where id = auth.uid()) then
    raise exception 'not_authorized';
  end if;

  insert into public.message_reports (message_id, reporter_id, reason)
    values (p_message_id, auth.uid(), left(coalesce(p_reason, ''), 500))
    on conflict (message_id, reporter_id) do nothing;
end;
$$;

revoke execute on function public.report_message(uuid, text) from public, anon;
grant execute on function public.report_message(uuid, text) to authenticated;
