-- Havana Barbería · esquema base (hito 1C)
-- Mirrors src/domain/types.ts and src/admin/domain.ts. Amounts are whole MXN
-- pesos (integer). Times are timestamptz; local dates use America/Mexico_City.
-- IDs are text so catalog ids stay readable ('corte-adulto'); new rows get a uuid.
-- Commissions, costs, bonuses and payroll live in finance tables protected by
-- RLS (see 20261107000200_security.sql); this repository never holds real figures.

create extension if not exists btree_gist;
create extension if not exists pgcrypto;

create schema if not exists app;

create or replace function app.new_id() returns text
language sql volatile as $$ select gen_random_uuid()::text $$;

-- ── Settings (single row) ───────────────────────────────────────────────────
-- Allowed values match src/lib/policy.ts (policyOptions) and src/admin/finance.ts.
create table public.settings (
  id int primary key default 1 check (id = 1),
  slot_step_min int not null default 15 check (slot_step_min = 15),
  min_notice_min int not null default 60 check (min_notice_min in (30, 60, 120, 180, 240, 360, 720, 1440)),
  max_advance_days int not null default 30 check (max_advance_days in (7, 14, 21, 30, 45, 60, 90)),
  max_active_per_customer int not null default 2 check (max_active_per_customer between 1 and 5),
  buffer_min int not null default 0 check (buffer_min in (0, 5, 10, 15)),
  change_cutoff_min int not null default 240 check (change_cutoff_min in (120, 180, 240, 360, 720, 1440, 2880)),
  tolerance_min int not null default 10 check (tolerance_min in (5, 10, 15, 20)),
  loyalty_goal int not null default 10 check (loyalty_goal in (5, 6, 7, 8, 9, 10, 12, 15)),
  reward_validity_days int not null default 90 check (reward_validity_days in (30, 60, 90, 120, 180, 365)),
  -- Finance (owner and manager edit; everyone signed in reads).
  week_start_day int not null default 1 check (week_start_day between 0 and 6),
  card_fee_percent numeric(4, 2) check (card_fee_percent between 0 and 10),
  discount_commission text not null default 'list' check (discount_commission in ('list', 'net')),
  -- Shop hours per weekday (0 = Sunday): [[{"start":"10:00","end":"20:30"}], ...]
  business_hours jsonb not null,
  time_zone text not null default 'America/Mexico_City',
  updated_at timestamptz not null default now()
);

-- ── Catalog and team ───────────────────────────────────────────────────────
create table public.categories (
  id text primary key default app.new_id(),
  name text not null check (length(trim(name)) > 0),
  sort int not null default 0
);
create unique index categories_name_key on public.categories (lower(name));

create table public.services (
  id text primary key default app.new_id(),
  category_id text not null references public.categories (id),
  name text not null check (length(trim(name)) > 0),
  description text not null default '',
  duration_min int not null check (duration_min between 15 and 240 and duration_min % 15 = 0),
  price int not null check (price between 0 and 100000),
  active boolean not null default true,
  loyalty_eligible boolean not null default false,
  image_url text,
  sort int not null default 0,
  created_at timestamptz not null default now()
);
create unique index services_name_key on public.services (lower(name));

create table public.staff (
  id text primary key default app.new_id(),
  name text not null check (length(trim(name)) > 0),
  title text not null default '',
  photo_url text,
  active boolean not null default true,
  sort int not null default 0,
  -- Weekly shifts per weekday (0 = Sunday), lunch goes between shifts.
  schedule jsonb not null default '[[],[],[],[],[],[],[]]' check (jsonb_typeof(schedule) = 'array' and jsonb_array_length(schedule) = 7),
  -- true: performs every service (new ones included); false: see staff_services.
  all_services boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index staff_name_key on public.staff (lower(name));

create table public.staff_services (
  staff_id text not null references public.staff (id) on delete cascade,
  service_id text not null references public.services (id) on delete cascade,
  primary key (staff_id, service_id)
);

-- Commission rules over time: a change applies from valid_from; past weeks keep theirs.
create table public.commission_versions (
  staff_id text not null references public.staff (id) on delete cascade,
  valid_from date not null,
  mode text not null check (mode in ('percent', 'fixed')),
  value int check (value >= 0 and (mode = 'fixed' or value <= 100) and value <= 100000),
  -- {"service-id": amount-or-percent}
  overrides jsonb not null default '{}' check (jsonb_typeof(overrides) = 'object'),
  created_at timestamptz not null default now(),
  primary key (staff_id, valid_from)
);

create table public.products (
  id text primary key default app.new_id(),
  name text not null check (length(trim(name)) > 0),
  brand text not null default '',
  price int not null check (price between 0 and 100000),
  image_url text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index products_name_key on public.products (lower(name));

-- Cost and commission are finance data (owner and manager only).
create table public.product_costs (
  product_id text primary key references public.products (id) on delete cascade,
  cost int check (cost between 0 and 100000),
  commission int check (commission between 0 and 100000)
);

-- ── Customers and loyalty ──────────────────────────────────────────────────
create table public.customers (
  id text primary key default app.new_id(),
  name text not null check (length(trim(name)) > 0),
  -- 10 digits (normalized Mexican mobile).
  phone text not null check (phone ~ '^[0-9]{10}$'),
  email text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now()
);
create unique index customers_phone_key on public.customers (phone);
create unique index customers_email_key on public.customers (lower(email)) where email <> '';

create table public.loyalty_cards (
  token text primary key default encode(gen_random_bytes(12), 'hex'),
  customer_id text not null unique references public.customers (id) on delete cascade,
  stamps int not null default 0 check (stamps >= 0),
  goal int not null default 10 check (goal > 0),
  reward_expires_at timestamptz,
  check (stamps <= goal)
);

-- ── Agenda ─────────────────────────────────────────────────────────────────
create table public.appointments (
  id text primary key default app.new_id(),
  token text not null unique default encode(gen_random_bytes(12), 'hex'),
  customer_id text not null references public.customers (id),
  staff_id text not null references public.staff (id),
  service_ids text[] not null check (cardinality(service_ids) > 0),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  duration_min int not null check (duration_min > 0),
  total_price int not null check (total_price >= 0),
  status text not null default 'confirmed' check (status in ('booked', 'confirmed', 'completed', 'no_show', 'cancelled')),
  source text not null default 'online' check (source in ('online', 'panel', 'walk_in')),
  notes text not null default '',
  loyalty_token text references public.loyalty_cards (token),
  created_at timestamptz not null default now(),
  check (ends_at > starts_at),
  -- A barber can never be double-booked (cancelled and no-shows free the time).
  constraint appointments_no_overlap exclude using gist (
    staff_id with =,
    tstzrange(starts_at, ends_at) with &&
  ) where (status in ('booked', 'confirmed', 'completed'))
);
create index appointments_starts_at_idx on public.appointments (starts_at);
create index appointments_customer_idx on public.appointments (customer_id);

-- What was charged when completing (one row per appointment).
create table public.payments (
  appointment_id text primary key references public.appointments (id) on delete cascade,
  method text not null check (method in ('cash', 'card', 'transfer')),
  -- Services charged (after free cut and discount).
  amount int not null check (amount >= 0),
  tip int not null default 0 check (tip between 0 and 100000),
  tip_method text not null check (tip_method in ('cash', 'card', 'transfer')),
  paid_at timestamptz not null default now(),
  reward_service_id text references public.services (id),
  reward_amount int check (reward_amount >= 0),
  -- [{"method":"cash","amount":200}, ...] (sums to amount + products)
  splits jsonb check (splits is null or jsonb_typeof(splits) = 'array'),
  -- [{"productId","name","qty","price","commission"}]
  products jsonb check (products is null or jsonb_typeof(products) = 'array'),
  -- {"amount","reason","authorizedBy","authorizedByName"}
  discount jsonb check (discount is null or jsonb_typeof(discount) = 'object'),
  charged_by uuid
);

create table public.time_blocks (
  id text primary key default app.new_id(),
  -- null: the whole shop (holidays).
  staff_id text references public.staff (id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text not null default '',
  created_by uuid,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index time_blocks_range_idx on public.time_blocks using gist (tstzrange(starts_at, ends_at));

-- ── Sales and cash ─────────────────────────────────────────────────────────
create table public.product_sales (
  id text primary key default app.new_id(),
  at timestamptz not null default now(),
  items jsonb not null check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) > 0),
  staff_id text references public.staff (id),
  method text not null check (method in ('cash', 'card', 'transfer')),
  total int not null check (total >= 0),
  created_by uuid
);

create table public.cash_moves (
  id text primary key default app.new_id(),
  date date not null,
  at timestamptz not null default now(),
  kind text not null check (kind in ('in', 'out')),
  amount int not null check (amount between 1 and 1000000),
  concept text not null check (length(trim(concept)) > 0),
  by_name text not null,
  created_by uuid
);

create table public.daily_closes (
  date date primary key,
  opening_fund int not null check (opening_fund between 0 and 1000000),
  expected int not null,
  counted int not null check (counted between 0 and 1000000),
  difference int generated always as (counted - expected) stored,
  note text not null default '',
  closed_by_name text not null,
  closed_by uuid,
  closed_at timestamptz not null default now()
);

-- ── Payroll ────────────────────────────────────────────────────────────────
create table public.advances (
  id text primary key default app.new_id(),
  staff_id text not null references public.staff (id),
  date date not null,
  amount int not null check (amount between 1 and 100000),
  note text not null default '',
  created_at timestamptz not null default now()
);

create table public.bonus_rules (
  id text primary key default app.new_id(),
  name text not null check (length(trim(name)) > 0),
  kind text not null check (kind in ('manual', 'services', 'products')),
  threshold int check (threshold between 1 and 999),
  amount int check (amount between 0 and 100000),
  active boolean not null default true,
  sort int not null default 0,
  check (kind <> 'manual' or threshold is null)
);
create unique index bonus_rules_name_key on public.bonus_rules (lower(name));

create table public.bonus_awards (
  week_start date not null,
  staff_id text not null references public.staff (id) on delete cascade,
  bonus_id text not null references public.bonus_rules (id) on delete cascade,
  primary key (week_start, staff_id, bonus_id)
);

-- A closed week: receipts frozen as computed when closing.
create table public.payroll_closes (
  week_start date primary key,
  week_end date not null check (week_end = week_start + 6),
  rows jsonb not null check (jsonb_typeof(rows) = 'array'),
  closed_by_name text not null,
  closed_by uuid,
  closed_at timestamptz not null default now()
);

create table public.payroll_payments (
  week_start date not null references public.payroll_closes (week_start) on delete cascade,
  staff_id text not null references public.staff (id),
  paid_at timestamptz not null default now(),
  paid_by_name text not null,
  primary key (week_start, staff_id)
);

-- ── Panel users ────────────────────────────────────────────────────────────
-- One row per auth user. No public sign-up: the owner invites.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null,
  email text not null,
  role text not null check (role in ('owner', 'manager', 'reception', 'barber')),
  staff_id text references public.staff (id),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  check ((role = 'barber') = (staff_id is not null))
);
create unique index profiles_email_key on public.profiles (lower(email));
create unique index profiles_staff_key on public.profiles (staff_id) where staff_id is not null;

-- ── Audit log ──────────────────────────────────────────────────────────────
create table public.audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor uuid,
  action text not null,
  entity text not null,
  entity_id text,
  data jsonb
);
create index audit_log_at_idx on public.audit_log (at desc);
