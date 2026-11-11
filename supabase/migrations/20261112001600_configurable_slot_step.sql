-- «Horarios cada» is editable in Ajustes › Reservas: how often the online
-- booking offers times (from opening). The panel keeps a 15-minute grid.
alter table public.settings drop constraint if exists settings_slot_step_min_check;
alter table public.settings add constraint settings_slot_step_min_check check (slot_step_min in (15, 20, 30, 45, 60));
