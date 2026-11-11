-- Shop expenses for Finanzas › Utilidades (rent, utilities, supplies…). Cash-drawer
-- withdrawals are not counted on their own (many pay barbers or move cash);
-- "Contar como gasto" turns one into an expense, once (cash_move_id is unique).
create table public.expenses (
  id text primary key default app.new_id(),
  date date not null,
  category text not null check (category in ('renta', 'servicios', 'insumos', 'sueldos', 'mantenimiento', 'publicidad', 'otros')),
  concept text not null check (length(trim(concept)) between 1 and 120),
  amount int not null check (amount > 0 and amount <= 1000000),
  method text not null default 'cash' check (method in ('cash', 'card', 'transfer')),
  cash_move_id text unique references public.cash_moves (id) on delete set null,
  by_name text not null default '',
  created_at timestamptz not null default now()
);
create index expenses_date on public.expenses (date);

alter table public.expenses enable row level security;
create policy expenses_all on public.expenses for all to authenticated
  using (app.is_finance()) with check (app.is_finance());
revoke all on public.expenses from anon;
grant select, insert, update, delete on public.expenses to authenticated;

create trigger expenses_audit after insert or update or delete on public.expenses
  for each row execute function app.audit();
