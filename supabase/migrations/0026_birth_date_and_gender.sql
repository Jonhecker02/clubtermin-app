-- Geburtsdatum + Geschlecht, collected at registration. Needed for team
-- planning (Herren/Damen Offen, 35, 40, ... — which teams can we field?).
-- Personal data, so:
--   * both columns are NOT in the general column grant of public.profiles —
--     no ordinary query can read them (same trick as skill_level),
--   * admins (Clubmanager, Trainer, Kapitän) read them only through
--     get_personal_details(),
--   * everybody can set their OWN (set_my_personal_details), admins can set
--     anybody's (admin_set_personal_details). Plausible dates only.
alter table public.profiles
  add column if not exists birth_date date check (birth_date is null or birth_date >= date '1900-01-01'),
  add column if not exists gender text check (gender is null or gender in ('m', 'w'));

create or replace function public.get_personal_details()
returns table (user_id uuid, birth_date date, gender text)
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'not_authorized';
  end if;
  return query
    select p.id, p.birth_date, p.gender from public.profiles p
    where p.birth_date is not null or p.gender is not null;
end;
$$;

create or replace function public.set_my_personal_details(p_birth_date date, p_gender text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_birth_date is null or p_birth_date < date '1900-01-01' or p_birth_date > current_date then
    raise exception 'invalid_birth_date';
  end if;
  if p_gender is null or p_gender not in ('m', 'w') then
    raise exception 'invalid_gender';
  end if;
  update public.profiles set birth_date = p_birth_date, gender = p_gender where id = auth.uid();
end;
$$;

create or replace function public.admin_set_personal_details(p_user_id uuid, p_birth_date date, p_gender text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'not_authorized';
  end if;
  if p_birth_date is not null and (p_birth_date < date '1900-01-01' or p_birth_date > current_date) then
    raise exception 'invalid_birth_date';
  end if;
  if p_gender is not null and p_gender not in ('m', 'w') then
    raise exception 'invalid_gender';
  end if;
  update public.profiles set birth_date = p_birth_date, gender = p_gender where id = p_user_id;
end;
$$;

-- My own details, so the Profil screen can show/edit them and ask existing
-- members once (null fields = not entered yet).
create or replace function public.get_my_personal_details()
returns table (birth_date date, gender text)
language sql stable security definer set search_path = public as $$
  select p.birth_date, p.gender from public.profiles p where p.id = auth.uid();
$$;

revoke execute on function public.get_personal_details(), public.set_my_personal_details(date, text),
  public.admin_set_personal_details(uuid, date, text), public.get_my_personal_details() from public, anon;
grant execute on function public.get_personal_details(), public.set_my_personal_details(date, text),
  public.admin_set_personal_details(uuid, date, text), public.get_my_personal_details() to authenticated;
