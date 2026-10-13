-- claim_opened_registrations() marked every termin whose registration
-- opening time had passed as "notified" and returned it for a push, no
-- matter HOW long ago that was. That's harmless while the cron job runs
-- every 10 minutes — but if the job was ever paused or only gets enabled
-- later, the first run would blast "Anmeldung ist offen" for every old
-- termin to everyone at once (a stale one from August is sitting there
-- right now). Now everything due is still marked as handled, but only
-- openings from the last 24 hours are returned for notification.
-- Same signature as before, so a plain create-or-replace is enough.
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
      returning t.id, t.title, t.date, t.start_time, t.register_groups,
                (t.registration_opens_date + coalesce(t.registration_opens_time, '00:00'::time)) as opens_at
  )
  select d.id, d.title, d.date, d.start_time, d.register_groups,
         p.id, ps.endpoint, ps.p256dh, ps.auth
  from due d
  join public.profiles p
    on p.status = 'approved'
    and ('all' = any (d.register_groups) or p.group_id::text = any (d.register_groups))
  left join public.push_subscriptions ps on ps.user_id = p.id
  where d.opens_at > (now() at time zone 'Europe/Berlin') - interval '24 hours';
end;
$$;

revoke execute on function public.claim_opened_registrations() from public;
