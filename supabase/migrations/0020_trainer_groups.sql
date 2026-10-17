-- Trainers can be assigned to several groups ("Trainer von"). Until now a
-- profile had exactly one group_id, which describes the group someone PLAYS
-- in; a trainer who coaches Gruppe A, B and C had no way to say so.
--
-- trainer_groups is that assignment. It does not replace profiles.group_id
-- (a trainer can still also be a player in one group) and it does not change
-- what a trainer is ALLOWED to do (admins keep full access, see is_admin()).
-- What it drives:
--   * the app scopes a trainer's Termine lists / chat tabs to their groups
--     (with a switch to look at everything), and
--   * new-termin and announcement pushes also reach the trainers of the
--     targeted groups, not just the people whose own group_id matches.
-- A trainer with NO assigned group behaves exactly as before.

create table public.trainer_groups (
  user_id uuid not null references public.profiles (id) on delete cascade,
  group_id uuid not null references public.groups (id) on delete cascade,
  primary key (user_id, group_id)
);

create index trainer_groups_group_id_idx on public.trainer_groups (group_id);

alter table public.trainer_groups enable row level security;

-- Readable by approved members (the group roster shows who trains it);
-- writes only through set_trainer_groups() below.
create policy trainer_groups_select on public.trainer_groups
  for select using (public.is_approved());

revoke all on public.trainer_groups from anon, authenticated;
grant select on public.trainer_groups to authenticated;

-- Owner replaces a trainer's whole set of groups in one call.
create or replace function public.set_trainer_groups(p_user_id uuid, p_group_ids uuid[])
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_owner() then
    raise exception 'not_authorized';
  end if;
  if not exists (select 1 from public.profiles where id = p_user_id and role = 'trainer') then
    raise exception 'not_a_trainer';
  end if;

  delete from public.trainer_groups where user_id = p_user_id;
  insert into public.trainer_groups (user_id, group_id)
    select p_user_id, g.id
    from public.groups g
    where g.id = any (coalesce(p_group_ids, '{}'::uuid[]));
end;
$$;

revoke execute on function public.set_trainer_groups(uuid, uuid[]) from public;
grant execute on function public.set_trainer_groups(uuid, uuid[]) to authenticated;

-- Someone who stops being a trainer no longer "trains" any group.
create or replace function public.clear_trainer_groups_on_role_change()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.role = 'trainer' and new.role <> 'trainer' then
    delete from public.trainer_groups where user_id = new.id;
  end if;
  return new;
end;
$$;

create trigger profiles_clear_trainer_groups
  after update of role on public.profiles
  for each row execute function public.clear_trainer_groups_on_role_change();

-- Push targets: a termin / announcement aimed at a group now also reaches
-- that group's trainers (previously only people whose own group_id matched).
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
      and (
        'all' = any (v_register_groups)
        or p.group_id::text = any (v_register_groups)
        or exists (
          select 1 from public.trainer_groups tg
          where tg.user_id = p.id and tg.group_id::text = any (v_register_groups)
        )
      );
end;
$$;

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
      and (
        'all' = any (v_visible_groups)
        or p.group_id::text = any (v_visible_groups)
        or exists (
          select 1 from public.trainer_groups tg
          where tg.user_id = p.id and tg.group_id::text = any (v_visible_groups)
        )
      );
end;
$$;

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
      and (
        'all' = any (v_register_groups)
        or p.group_id::text = any (v_register_groups)
        or exists (
          select 1 from public.trainer_groups tg
          where tg.user_id = p.id and tg.group_id::text = any (v_register_groups)
        )
      );
end;
$$;

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
      and (
        'all' = any (v_visible_groups)
        or p.group_id::text = any (v_visible_groups)
        or exists (
          select 1 from public.trainer_groups tg
          where tg.user_id = p.id and tg.group_id::text = any (v_visible_groups)
        )
      );
end;
$$;

-- create-or-replace keeps the existing grants/revokes on these four.
