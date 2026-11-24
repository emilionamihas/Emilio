-- ManageCourt · esquema PostgreSQL / Supabase
-- Espejo 1:1 de lib/types.ts (camelCase en TS → snake_case aquí).

create type sport as enum ('futbol', 'basquet', 'tenis', 'padel');
create type surface as enum ('cesped-sintetico', 'parquet', 'polvo-ladrillo', 'cemento', 'cesped-padel');
create type booking_status as enum ('pending', 'confirmed', 'rejected', 'cancelled');
create type payment_status as enum ('paid', 'deposit', 'unpaid');
create type payment_method as enum ('efectivo', 'transferencia', 'mercadopago', 'tarjeta');
create type booking_source as enum ('online', 'manual');
create type block_reason as enum ('maintenance', 'tournament');

create table courts (
  id          text primary key,
  name        text not null,
  sport       sport not null,
  surface     surface not null,
  covered     boolean not null default false,
  format      text not null,
  capacity    int not null,
  day_rate    int not null,           -- ARS por hora
  night_rate  int not null,           -- ARS por hora con iluminación
  map         jsonb not null          -- { x, y, w, h } del croquis
);

create table bookings (
  id              text primary key default ('bkg_' || substr(md5(random()::text), 1, 10)),
  court_id        text not null references courts(id),
  date            date not null,
  start_hour      smallint not null check (start_hour between 0 and 23),
  end_hour        smallint not null check (end_hour between 1 and 24 and end_hour > start_hour),
  customer_name   text not null,
  phone           text not null,
  payment_method  payment_method not null,
  payment_status  payment_status not null default 'unpaid',
  amount          int not null,
  deposit_amount  int not null default 0,
  status          booking_status not null default 'pending',
  source          booking_source not null default 'online',
  pass_code       text not null unique,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table blocks (
  id          text primary key default ('blk_' || substr(md5(random()::text), 1, 10)),
  court_id    text not null references courts(id),
  date        date not null,
  start_hour  smallint not null,
  end_hour    smallint not null check (end_hour > start_hour),
  reason      block_reason not null,
  note        text not null default '',
  created_at  timestamptz not null default now()
);

-- La regla de negocio clave: dos reservas activas no pueden solaparse en la misma cancha.
-- En el cliente lo valida lib/slots.ts (findConflict); aquí lo garantiza la base,
-- que es lo único que evita la doble reserva cuando dos personas piden a la vez.
create extension if not exists btree_gist;
alter table bookings add constraint bookings_no_overlap
  exclude using gist (
    court_id with =,
    date with =,
    int4range(start_hour, end_hour) with &&
  ) where (status in ('pending', 'confirmed'));

create index bookings_by_day on bookings (date, court_id);
create index blocks_by_day on blocks (date, court_id);

-- Tiempo real: la bandeja del gestor se suscribe a esta tabla.
alter publication supabase_realtime add table bookings, blocks;

-- Seguridad (a completar con Supabase Auth):
--   · anon: puede INSERTAR bookings con status = 'pending' y leer disponibilidad (sin datos personales).
--   · staff: lectura/escritura total.
alter table bookings enable row level security;
alter table blocks enable row level security;
alter table courts enable row level security;
