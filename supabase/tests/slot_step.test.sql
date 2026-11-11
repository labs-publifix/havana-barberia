-- «Horarios cada» accepts the listed values only. Rolled back.
\set ON_ERROR_STOP 1
begin;
update public.settings set slot_step_min = 30 where id = 1;
do $$ begin
  if (select slot_step_min from public.settings where id = 1) <> 30 then raise exception 'FALLÓ: no guardó 30'; end if;
  raise notice 'ok · horarios cada 30 minutos';
  begin
    update public.settings set slot_step_min = 25 where id = 1;
    raise exception 'FALLÓ: aceptó 25';
  exception when check_violation then
    raise notice 'ok · rechaza valores fuera de la lista';
  end;
end $$;
rollback;
