-- Spielstärke as a decimal between 0 and 5 (e.g. 2.5), two decimals at most.
-- Was smallint (whole numbers only). The existing 0-5 check constraint keeps
-- working on numeric; existing whole-number ratings convert as they are.
-- Both RPCs change their value type, so they are dropped and recreated (a
-- plain create-or-replace can't change a signature or return type).
alter table public.profiles
  alter column skill_level type numeric(3, 2) using skill_level::numeric;

drop function if exists public.get_skill_levels();
drop function if exists public.set_skill_level(uuid, smallint);

create or replace function public.get_skill_levels()
returns table (user_id uuid, skill_level numeric)
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_trainer_or_owner() then
    raise exception 'not_authorized';
  end if;
  return query select p.id, p.skill_level from public.profiles p;
end;
$$;

create or replace function public.set_skill_level(p_user_id uuid, p_skill_level numeric)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_trainer_or_owner() then
    raise exception 'not_authorized';
  end if;
  if p_skill_level is not null and (p_skill_level < 0 or p_skill_level > 5) then
    raise exception 'invalid_skill_level';
  end if;
  update public.profiles set skill_level = round(p_skill_level, 2) where id = p_user_id;
end;
$$;

revoke execute on function public.get_skill_levels(), public.set_skill_level(uuid, numeric) from public;
grant execute on function public.get_skill_levels(), public.set_skill_level(uuid, numeric) to authenticated;
