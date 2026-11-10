-- Sample barbers for the database tests only (production has none seeded).
insert into public.staff (id, name, sort, schedule) values
  ('leonardo', 'Leonardo Gómez', 1, '[[{"start": "10:00", "end": "15:00"}], [{"start": "10:00", "end": "20:30"}], [{"start": "10:00", "end": "20:30"}], [{"start": "10:00", "end": "20:30"}], [{"start": "10:00", "end": "20:30"}], [{"start": "10:00", "end": "20:30"}], [{"start": "10:00", "end": "18:00"}]]'::jsonb),
  ('isaac', 'Isaac Fuentes', 2, '[[{"start": "10:00", "end": "15:00"}], [{"start": "10:00", "end": "20:30"}], [{"start": "10:00", "end": "20:30"}], [{"start": "10:00", "end": "20:30"}], [{"start": "10:00", "end": "20:30"}], [{"start": "10:00", "end": "20:30"}], [{"start": "10:00", "end": "18:00"}]]'::jsonb)
on conflict (id) do nothing;

insert into public.commission_versions (staff_id, valid_from, mode, value) values
  ('leonardo', '0001-01-01', 'percent', null),
  ('isaac', '0001-01-01', 'percent', null)
on conflict do nothing;

