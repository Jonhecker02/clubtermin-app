-- Bug found during pre-launch QA: confirming a fair-rotation allocation
-- always failed with "column status is of type registration_status but
-- expression is of type text". Root cause: `case when ... then 'angemeldet'
-- else 'warteliste' end` has two untyped string-literal branches — Postgres
-- resolves a CASE's overall type from its branches to plain `text` in that
-- situation (unlike a single bare literal assigned straight to an enum
-- column, which gets an implicit assignment-cast). `text` has no implicit
-- assignment-cast to an enum, so the UPDATE always errored. Present since
-- confirm_termin_allocation() was introduced in
-- 0010_allocation_confirm_step.sql and carried forward unchanged into
-- 0013's rewrite — never actually hit until this session's first real
-- end-to-end propose → confirm test. Same signature as what's already
-- live, so a plain create-or-replace is enough (no drop needed).
create or replace function public.confirm_termin_allocation(p_termin_id uuid)
returns table (
  user_id uuid,
  termin_id uuid,
  title text,
  date date,
  start_time time,
  location text,
  register_groups text[],
  final_status text,
  quote numeric,
  endpoint text,
  p256dh text,
  auth text
)
language plpgsql security definer set search_path = public as $$
declare
  v_alloc record;
begin
  if not exists (select 1 from public.termine t where t.id = p_termin_id and t.allocation_proposed_at is not null) then
    raise exception 'no_proposal';
  end if;

  for v_alloc in
    select ra.user_id, ra.included from public.registration_allocations ra where ra.termin_id = p_termin_id
  loop
    update public.registrations r
      set status = (case when v_alloc.included then 'angemeldet' else 'warteliste' end)::public.registration_status
      where r.termin_id = p_termin_id and r.user_id = v_alloc.user_id and r.status = 'ausstehend';
  end loop;

  update public.termine set allocation_run_at = now() where id = p_termin_id;

  return query
    select ra.user_id, ra.termin_id, t.title, t.date, t.start_time, t.location, t.register_groups,
           case when ra.included then 'angemeldet' else 'warteliste' end as final_status,
           ra.quote,
           ps.endpoint, ps.p256dh, ps.auth
    from public.registration_allocations ra
    join public.termine t on t.id = ra.termin_id
    left join public.push_subscriptions ps on ps.user_id = ra.user_id
    where ra.termin_id = p_termin_id;
end;
$$;

revoke execute on function public.confirm_termin_allocation(uuid) from public;
