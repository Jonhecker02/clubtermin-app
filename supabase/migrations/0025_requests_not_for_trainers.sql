-- Registration requests (Anfragen) are handled by the Clubmanager (and
-- Kapitän), no longer by trainers: the UI hides the tab and the two actions
-- now refuse trainers as well.
create or replace function public.approve_request(p_user_id uuid, p_group_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and role in ('owner', 'captain')) then
    raise exception 'not_authorized';
  end if;
  if p_group_id is null then
    raise exception 'group_required';
  end if;
  update public.profiles set status = 'approved', group_id = p_group_id where id = p_user_id and status = 'pending';
end;
$$;

create or replace function public.reject_request(p_user_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and role in ('owner', 'captain')) then
    raise exception 'not_authorized';
  end if;
  update public.profiles set status = 'rejected' where id = p_user_id and status = 'pending';
end;
$$;
