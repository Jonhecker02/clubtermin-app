-- How a training session is run, so a "just play, no coaching" evening doesn't
-- carry the training -> play changeover with it:
--   training_spiel  coached half + play half with a changeover (the default,
--                   and what every existing training is)
--   nur_spiel       everyone just plays: no trainer, no changeover
--   nur_training    everyone trains the whole slot: no changeover
alter table public.termine
  add column session_format text not null default 'training_spiel'
  check (session_format in ('training_spiel', 'nur_spiel', 'nur_training'));
