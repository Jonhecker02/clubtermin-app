-- Lets the admin publish a termin's court groups to its confirmed
-- participants (they were admin-only until now). Publishing is a deliberate
-- separate step from saving — the admin can build/rebuild groups privately
-- and only reveal them once settled.
alter table public.termine
  add column if not exists court_groups_published_at timestamptz;

drop policy if exists termin_court_groups_select on public.termin_court_groups;
create policy termin_court_groups_select on public.termin_court_groups
  for select using (
    public.is_admin()
    or (
      exists (
        select 1 from public.termine t
        where t.id = termin_court_groups.termin_id and t.court_groups_published_at is not null
      )
      and exists (
        select 1 from public.registrations r
        where r.termin_id = termin_court_groups.termin_id and r.user_id = auth.uid() and r.status = 'angemeldet'
      )
    )
  );

drop policy if exists termin_court_group_members_select on public.termin_court_group_members;
create policy termin_court_group_members_select on public.termin_court_group_members
  for select using (
    public.is_admin()
    or exists (
      select 1 from public.termin_court_groups cg
      join public.termine t on t.id = cg.termin_id
      where cg.id = termin_court_group_members.group_id
        and t.court_groups_published_at is not null
        and exists (
          select 1 from public.registrations r
          where r.termin_id = cg.termin_id and r.user_id = auth.uid() and r.status = 'angemeldet'
        )
    )
  );

create or replace function public.set_court_groups_published(p_termin_id uuid, p_published boolean)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'not_authorized';
  end if;
  update public.termine
    set court_groups_published_at = case when p_published then now() else null end
    where id = p_termin_id;
end;
$$;

revoke execute on function public.set_court_groups_published(uuid, boolean) from public;
grant execute on function public.set_court_groups_published(uuid, boolean) to authenticated;

-- Pairwise "how often has X recently trained in the same court group as Y"
-- within one club team's last 10 training termine with court groups (same
-- window as get_round1_quotes) — lets the admin deliberately mix up who
-- trains together instead of defaulting to the same pairings each time.
-- Returns one row per ordered pair that actually shared a group at least
-- once; pairs with zero shared history simply don't appear.
create or replace function public.get_recent_partners(p_club_group_id uuid, p_user_ids uuid[])
returns table (user_id uuid, partner_id uuid, times_together integer)
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'not_authorized';
  end if;

  return query
  with recent_termine as (
    select t.id from public.termine t
    where t.type = 'training' and t.register_groups = array[p_club_group_id::text]
      and (t.date + t.start_time) < (now() at time zone 'Europe/Berlin')
      and exists (select 1 from public.termin_court_groups cg where cg.termin_id = t.id)
    order by t.date desc, t.start_time desc
    limit 10
  ),
  memberships as (
    select m.user_id, m.group_id
    from public.termin_court_group_members m
    join public.termin_court_groups cg on cg.id = m.group_id
    where cg.termin_id in (select id from recent_termine)
      and m.user_id = any (p_user_ids)
  )
  select a.user_id, b.user_id as partner_id, count(*)::int as times_together
  from memberships a
  join memberships b on a.group_id = b.group_id and a.user_id <> b.user_id
  group by a.user_id, b.user_id;
end;
$$;

revoke execute on function public.get_recent_partners(uuid, uuid[]) from public;
grant execute on function public.get_recent_partners(uuid, uuid[]) to authenticated;
