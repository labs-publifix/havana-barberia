-- Datos iniciales: horario y políticas, catálogo público, equipo y bonos SIN montos.
-- Nada de clientes, comisiones, costos ni nómina: eso se captura en el panel.
-- Los horarios de los barberos parten del horario de la barbería; se ajustan en Equipo.

insert into public.settings (id, business_hours) values (1, '[[{"start": "10:00", "end": "15:00"}], [{"start": "10:00", "end": "20:30"}], [{"start": "10:00", "end": "20:30"}], [{"start": "10:00", "end": "20:30"}], [{"start": "10:00", "end": "20:30"}], [{"start": "10:00", "end": "20:30"}], [{"start": "10:00", "end": "18:00"}]]'::jsonb)
  on conflict (id) do nothing;

insert into public.categories (id, name, sort) values
  ('cortes', 'Cortes', 1),
  ('barba', 'Barba', 2),
  ('combos', 'Combos', 3),
  ('facial', 'Facial y cuidado', 4),
  ('color', 'Color', 5)
on conflict (id) do nothing;

insert into public.services (id, category_id, name, description, duration_min, price, loyalty_eligible, sort) values
  ('corte-adulto', 'cortes', 'Corte de cabello adulto', 'Corte a tu estilo, con acabado y peinado.', 45, 280, true, 1),
  ('corte-nino', 'cortes', 'Corte de niño', 'Para menores de 10 años.', 30, 220, true, 2),
  ('delineado-corte', 'cortes', 'Delineado de corte', 'Retoque de contornos entre cortes.', 30, 240, true, 3),
  ('afeitado-barba', 'barba', 'Afeitado y delineado de barba', 'Afeitado con navaja y contornos definidos.', 30, 280, false, 4),
  ('delineado-barba', 'barba', 'Delineado de barba', 'Perfilado limpio de la barba.', 30, 240, false, 5),
  ('barba-premium', 'barba', 'Barba premium', 'Toalla caliente, perfilado, aceites y masaje.', 60, 530, false, 6),
  ('bigote', 'barba', 'Arreglo de bigote', 'Recorte y forma del bigote.', 15, 150, false, 7),
  ('corte-barba', 'combos', 'Corte de cabello y arreglo de barba', 'Servicio de corte + barba clásico.', 60, 500, true, 8),
  ('corte-bigote', 'combos', 'Corte de cabello y arreglo de bigote', 'Corte completo y bigote en forma.', 45, 430, true, 9),
  ('corte-ritual', 'combos', 'Corte de cabello y ritual facial', 'Corte con limpieza y relajación facial.', 45, 450, true, 10),
  ('ritual-facial', 'facial', 'Ritual facial', 'Limpieza, exfoliación e hidratación.', 30, 320, false, 11),
  ('mascarilla-negra', 'facial', 'Aplicación de mascarilla negra', 'Limpieza profunda de poros.', 15, 200, false, 12),
  ('tinte-cabello', 'color', 'Tinte de cabello', 'Color uniforme o cubrimiento de canas.', 45, 275, false, 13),
  ('tinte-barba', 'color', 'Tinte de barba', 'Color natural para tu barba.', 30, 220, false, 14)
on conflict (id) do nothing;

insert into public.staff (id, name, sort, schedule) values
  ('leonardo', 'Leonardo Gómez', 1, '[[{"start": "10:00", "end": "15:00"}], [{"start": "10:00", "end": "20:30"}], [{"start": "10:00", "end": "20:30"}], [{"start": "10:00", "end": "20:30"}], [{"start": "10:00", "end": "20:30"}], [{"start": "10:00", "end": "20:30"}], [{"start": "10:00", "end": "18:00"}]]'::jsonb),
  ('isaac', 'Isaac Fuentes', 2, '[[{"start": "10:00", "end": "15:00"}], [{"start": "10:00", "end": "20:30"}], [{"start": "10:00", "end": "20:30"}], [{"start": "10:00", "end": "20:30"}], [{"start": "10:00", "end": "20:30"}], [{"start": "10:00", "end": "20:30"}], [{"start": "10:00", "end": "18:00"}]]'::jsonb)
on conflict (id) do nothing;

-- Commission rules start empty ("Sin capturar") from the beginning of time.
insert into public.commission_versions (staff_id, valid_from, mode, value) values
  ('leonardo', '0001-01-01', 'percent', null),
  ('isaac', '0001-01-01', 'percent', null)
on conflict do nothing;

insert into public.bonus_rules (id, name, kind, sort) values
  ('puntualidad', 'Puntualidad', 'manual', 1),
  ('asistencia', 'Asistencia completa', 'manual', 2),
  ('meta-servicios', 'Meta de servicios', 'services', 3),
  ('venta-productos', 'Venta de productos', 'products', 4)
on conflict (id) do nothing;
