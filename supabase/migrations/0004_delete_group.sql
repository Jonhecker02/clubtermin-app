-- Lets the owner delete a group entirely.
--
-- Members lose their group/status (routed back to /teamcode, same outcome as
-- remove_group_member for a single person); the group's chat messages cascade
-- via the existing FK. Termine that referenced this group in visible_groups
-- or register_groups are deliberately left untouched — the id becomes a
-- dangling reference there (groupsLabel() already falls back to showing the
-- raw id for a group it can't find), since cascading into a delete of those
-- termine/registrations too would be a much bigger, separate decision than
-- "delete this group".
create or replace function public.delete_group(p_group_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_owner() then
    raise exception 'not_authorized';
  end if;

  update public.profiles set group_id = null, status = null where group_id = p_group_id;
  delete from public.groups where id = p_group_id;
end;
$$;

revoke execute on function public.delete_group(uuid) from public;
grant execute on function public.delete_group(uuid) to authenticated;
