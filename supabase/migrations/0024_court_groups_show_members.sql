-- Players can see who they train with. Switchable per termin by the admin
-- (default: on), and now actually enforced in the database:
--   * a confirmed player of a published termin always sees their OWN
--     membership row (so the app can tell which court they are on),
--   * the other members of their own court only while the switch is on,
--   * members of other courts: never (before, every court's members of a
--     published termin were readable by every confirmed participant).
alter table public.termine
  add column if not exists court_groups_show_members boolean not null default true;

create or replace function public.is_in_court_group(p_group_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.termin_court_group_members m
    where m.group_id = p_group_id and m.user_id = auth.uid()
  );
$$;

revoke execute on function public.is_in_court_group(uuid) from public, anon;
grant execute on function public.is_in_court_group(uuid) to authenticated;

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
        and (
          termin_court_group_members.user_id = auth.uid()
          or (t.court_groups_show_members and public.is_in_court_group(termin_court_group_members.group_id))
        )
    )
  );
