-- Supabase grants new functions in `public` to anon by default, so
-- `revoke ... from public` is not enough: charging, closing and sales are for
-- signed-in staff only.
revoke execute on function public.complete_appointment(text, jsonb) from anon;
revoke execute on function public.close_day(date, int, int, text) from anon;
revoke execute on function public.record_sale(jsonb, text, text) from anon;
