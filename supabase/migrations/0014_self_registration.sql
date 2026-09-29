-- Self-registration replaces the teamcode flow for players: /registrieren
-- creates an account with status 'pending' and no group at all (the
-- teamcode step that used to assign a group up front is gone). The owner
-- now picks a Mannschaft as part of approving in Admin → Anfragen, so
-- approve_request needs a group argument — signature change, same
-- drop+recreate need as every other RETURNS-shape/arg change this project
-- has done before.
drop function if exists public.approve_request(uuid);

create or replace function public.approve_request(p_user_id uuid, p_group_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'not_authorized';
  end if;
  if p_group_id is null then
    raise exception 'group_required';
  end if;
  update public.profiles set status = 'approved', group_id = p_group_id where id = p_user_id and status = 'pending';
end;
$$;

revoke execute on function public.approve_request(uuid, uuid) from public;
grant execute on function public.approve_request(uuid, uuid) to authenticated;

-- Self-service "try again" after a rejection — no admin needed, just resets
-- the caller's own row back into the Anfragen queue. Mirrors retry_code()'s
-- shape but doesn't touch group_id (self-registered players never had one).
create or replace function public.resubmit_request()
returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.profiles set status = 'pending' where id = auth.uid() and status = 'rejected';
end;
$$;

revoke execute on function public.resubmit_request() from public;
grant execute on function public.resubmit_request() to authenticated;
