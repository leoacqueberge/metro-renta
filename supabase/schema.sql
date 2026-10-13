-- Métro renta — schéma minimal (aggregate state par appareil)
-- Exécuter dans Supabase SQL Editor, ou via migration MCP.

create table if not exists public.metro_renta_state (
  device_id text primary key,
  rides integer not null default 0 check (rides >= 0),
  fines integer not null default 0 check (fines >= 0),
  price numeric(10, 2) not null default 2.55 check (price > 0),
  milestone_interval numeric(10, 2) not null default 70 check (milestone_interval > 0),
  updated_at timestamptz not null default now()
);

-- Migration douce si la table existait déjà sans fines
alter table public.metro_renta_state
  add column if not exists fines integer not null default 0 check (fines >= 0);

alter table public.metro_renta_state enable row level security;

drop policy if exists "metro_renta_anon_all" on public.metro_renta_state;
create policy "metro_renta_anon_all"
  on public.metro_renta_state
  for all
  to anon, authenticated
  using (true)
  with check (true);

comment on table public.metro_renta_state is
  'Compteur Métro renta: trajets + amendes + prix + seuil, clé = device_id client.';
