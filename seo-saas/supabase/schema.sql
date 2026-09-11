-- Esquema de base de datos para SEO Copy Optimizer.
-- Ejecutar en el SQL Editor de Supabase.

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  url text not null,
  overall_score integer not null check (overall_score between 0 and 100),
  seo_score integer not null check (seo_score between 0 and 100),
  copywriting_score integer not null check (copywriting_score between 0 and 100),
  report jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists reports_user_id_created_at_idx
  on public.reports (user_id, created_at desc);

alter table public.reports enable row level security;

create policy "Los usuarios ven solo sus propios reportes"
  on public.reports for select
  using (auth.uid() = user_id);

create policy "Los usuarios insertan solo sus propios reportes"
  on public.reports for insert
  with check (auth.uid() = user_id);

create policy "Los usuarios borran solo sus propios reportes"
  on public.reports for delete
  using (auth.uid() = user_id);
