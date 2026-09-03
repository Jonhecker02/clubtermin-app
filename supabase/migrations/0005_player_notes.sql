-- Admin-only notes per player, so whoever trains someone next can see what
-- a previous session already worked on. Shared across all admins (owner,
-- trainer, captain) — a running log, not a single overwritten field, since
-- "building on what happened last time" wants dated entries, not just a
-- current-state note.
create table public.player_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  author_id uuid references public.profiles (id) on delete set null,
  note text not null,
  created_at timestamptz not null default now()
);

create index player_notes_user_idx on public.player_notes (user_id, created_at desc);

alter table public.player_notes enable row level security;

create policy player_notes_select on public.player_notes
  for select using (public.is_admin());

-- Collaborative log: any admin may remove any note (e.g. a duplicate, or one
-- that's no longer relevant), not just the one who wrote it — same spirit as
-- delete_message being open to moderation rather than author-locked.
create policy player_notes_delete on public.player_notes
  for delete using (public.is_admin());

grant select, delete on public.player_notes to authenticated;

-- Inserts go through this instead of a raw table grant so author_id is
-- always the caller's own id — a client can't write a note under someone
-- else's name.
create or replace function public.add_player_note(p_user_id uuid, p_note text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'not_authorized';
  end if;
  if trim(p_note) = '' then
    raise exception 'note_required';
  end if;
  insert into public.player_notes (user_id, author_id, note)
    values (p_user_id, auth.uid(), trim(p_note));
end;
$$;

revoke execute on function public.add_player_note(uuid, text) from public;
grant execute on function public.add_player_note(uuid, text) to authenticated;
