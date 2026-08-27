-- Schéma pour l'appli Budget famille
-- À exécuter dans Supabase > SQL Editor (un copier-coller, un clic sur "Run")

create extension if not exists "pgcrypto";

-- Réglages globaux (solde de départ, mois de début de la projection)
create table if not exists settings (
  id int primary key default 1,
  solde_initial numeric not null default 0,
  start_month text not null,
  constraint single_row check (id = 1)
);

-- Catégories de revenus / dépenses
create table if not exists categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null check (type in ('revenu', 'depense')),
  color text not null default 'stone',
  created_at timestamptz not null default now()
);

-- Entrées de budget (ponctuelles ou récurrentes)
create table if not exists entries (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references categories(id) on delete restrict,
  label text not null,
  amount numeric not null check (amount > 0),
  month text not null,
  recurring_end text,
  created_at timestamptz not null default now()
);

-- Sécurité : row level security activée sur les 3 tables.
-- Seuls les comptes authentifiés (créés manuellement, voir README) peuvent lire/écrire.
-- Personne d'autre (visiteur anonyme) ne peut accéder aux données, même avec la clé publique.
alter table settings enable row level security;
alter table categories enable row level security;
alter table entries enable row level security;

create policy "authenticated can read settings" on settings for select using (auth.role() = 'authenticated');
create policy "authenticated can write settings" on settings for insert with check (auth.role() = 'authenticated');
create policy "authenticated can update settings" on settings for update using (auth.role() = 'authenticated');

create policy "authenticated can read categories" on categories for select using (auth.role() = 'authenticated');
create policy "authenticated can write categories" on categories for insert with check (auth.role() = 'authenticated');
create policy "authenticated can delete categories" on categories for delete using (auth.role() = 'authenticated');

create policy "authenticated can read entries" on entries for select using (auth.role() = 'authenticated');
create policy "authenticated can write entries" on entries for insert with check (auth.role() = 'authenticated');
create policy "authenticated can delete entries" on entries for delete using (auth.role() = 'authenticated');

-- Active le temps réel (pour que les deux comptes voient les mises à jour instantanément)
alter publication supabase_realtime add table settings;
alter publication supabase_realtime add table categories;
alter publication supabase_realtime add table entries;
