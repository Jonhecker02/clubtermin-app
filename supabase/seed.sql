-- Optional starting point: the three demo groups from the design handoff.
-- Safe to skip, edit, or delete afterwards from Admin -> Gruppen.
insert into public.groups (name, code) values
  ('Trainingsgruppe A', 'TP-GRUPPEA-26'),
  ('Trainingsgruppe B', 'TP-GRUPPEB-26'),
  ('Anfänger', 'TP-ANFAENGER-26')
on conflict (code) do nothing;
