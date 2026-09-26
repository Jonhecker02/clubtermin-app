-- The waitlist has always displayed in registration order (created_at),
-- but promote_waitlist() already promotes by fairness quote for
-- rotation-enabled termine — so the shown position could disagree with who
-- actually moves up next. This returns the real order (fairness quote for
-- rotation-enabled single-team termine, created_at otherwise) so every
-- display of the waitlist — both termin pages, the share-text export —
-- can sort by it. Not admin-gated: waitlist names/positions are already
-- visible to every viewer of a termin today, this only fixes their order,
-- and it needs to be callable from the service-role notify route too
-- (no auth.uid() there), so there's nothing to gate on internally anyway.
create or replace function public.get_waitlist_rank(p_termin_id uuid)
returns table (user_id uuid, rank_order int)
language plpgsql security definer set search_path = public as $$
declare
  v_register_groups text[];
  v_group_id uuid;
begin
  select t.register_groups into v_register_groups from public.termine t where t.id = p_termin_id;

  if v_register_groups is not null and array_length(v_register_groups, 1) = 1 and v_register_groups[1] <> 'all'
     and exists (
       select 1 from public.groups g
       where g.id = v_register_groups[1]::uuid and g.fair_rotation_enabled
     )
  then
    v_group_id := v_register_groups[1]::uuid;

    return query
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
        select avg(h.confirmed::numeric / nullif(h.registered, 0)) as avg_quote from history h
      ),
      ranked as (
        select r.user_id,
               coalesce(h.confirmed::numeric / nullif(h.registered, 0), ga.avg_quote, 0.5) as quote,
               r.created_at
        from public.registrations r
        left join history h on h.user_id = r.user_id
        cross join group_avg ga
        where r.termin_id = p_termin_id and r.status = 'warteliste'
      )
      select ranked.user_id, (row_number() over (order by ranked.quote asc, ranked.created_at asc))::int
      from ranked;
  else
    return query
      select r.user_id, (row_number() over (order by r.created_at asc))::int
      from public.registrations r
      where r.termin_id = p_termin_id and r.status = 'warteliste';
  end if;
end;
$$;

revoke execute on function public.get_waitlist_rank(uuid) from public;
grant execute on function public.get_waitlist_rank(uuid) to authenticated;

-- Clubmanager player overview ("wie ist die Bereitschaft der Leute") — per
-- player, how many of their team's training termine they registered for at
-- all (any status) vs. how many they were actually confirmed for, over all
-- completed trainings (not the 10-termin rotation window — this is a
-- long-run attendance picture, not a short-term fairness signal).
create or replace function public.get_player_attendance_stats()
returns table (
  user_id uuid,
  total_trainings int,
  registered_count int,
  confirmed_count int
)
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'not_authorized';
  end if;

  return query
    with team_trainings as (
      select p.id as user_id, t.id as termin_id
      from public.profiles p
      join public.termine t
        on t.type = 'training'
        and t.register_groups = array[p.group_id::text]
        and (t.date + t.start_time) < (now() at time zone 'Europe/Berlin')
      where p.group_id is not null and p.status = 'approved'
    )
    select
      tt.user_id,
      count(*)::int as total_trainings,
      count(r.id)::int as registered_count,
      count(*) filter (where r.status = 'angemeldet')::int as confirmed_count
    from team_trainings tt
    left join public.registrations r on r.termin_id = tt.termin_id and r.user_id = tt.user_id
    group by tt.user_id;
end;
$$;

revoke execute on function public.get_player_attendance_stats() from public;
grant execute on function public.get_player_attendance_stats() to authenticated;
