-- Schéma pour l'appli Budget famille
-- À exécuter dans Supabase > SQL Editor (un copier-coller, un clic sur "Run")
--
-- Si vous avez DÉJÀ des tables settings/categories/entries dans "public"
-- (installation précédente), utilisez plutôt migration_to_schema.sql pour
-- les déplacer sans perdre vos données. Ce fichier-ci est pour une base neuve.

create extension if not exists "pgcrypto";

-- Schéma dédié (utile si votre base Supabase héberge aussi d'autres projets)
create schema if not exists budget;
set search_path to budget, public;

-- Réglages globaux (solde de départ, mois de début de la projection)
create table if not exists budget.settings (
  id int primary key default 1,
  solde_initial numeric not null default 0,
  start_month text not null,
  constraint single_row check (id = 1)
);

-- Catégories de revenus / dépenses
create table if not exists budget.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null check (type in ('revenu', 'depense')),
  color text not null default 'stone',
  created_at timestamptz not null default now()
);

-- Entrées de budget (ponctuelles ou récurrentes)
create table if not exists budget.entries (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references budget.categories(id) on delete restrict,
  label text not null,
  amount numeric not null check (amount > 0),
  month text not null,
  recurring_end text,
  created_at timestamptz not null default now()
);

-- Sécurité : row level security activée sur les 3 tables.
-- Seuls les comptes authentifiés (créés manuellement, voir README) peuvent lire/écrire.
-- Personne d'autre (visiteur anonyme) ne peut accéder aux données, même avec la clé publique.
alter table budget.settings enable row level security;
alter table budget.categories enable row level security;
alter table budget.entries enable row level security;

create policy "authenticated can read settings" on budget.settings for select using (auth.role() = 'authenticated');
create policy "authenticated can write settings" on budget.settings for insert with check (auth.role() = 'authenticated');
create policy "authenticated can update settings" on budget.settings for update using (auth.role() = 'authenticated');

create policy "authenticated can read categories" on budget.categories for select using (auth.role() = 'authenticated');
create policy "authenticated can write categories" on budget.categories for insert with check (auth.role() = 'authenticated');
create policy "authenticated can delete categories" on budget.categories for delete using (auth.role() = 'authenticated');

create policy "authenticated can read entries" on budget.entries for select using (auth.role() = 'authenticated');
create policy "authenticated can write entries" on budget.entries for insert with check (auth.role() = 'authenticated');
create policy "authenticated can delete entries" on budget.entries for delete using (auth.role() = 'authenticated');

-- Active le temps réel (pour que les deux comptes voient les mises à jour instantanément)
alter publication supabase_realtime add table budget.settings;
alter publication supabase_realtime add table budget.categories;
alter publication supabase_realtime add table budget.entries;

-- Autorise les rôles de l'API à utiliser ce schéma (sans ça PostgREST refuse,
-- même une fois "budget" ajouté aux "Exposed schemas" du Dashboard).
grant usage on schema budget to anon, authenticated;
grant all on all tables in schema budget to authenticated;
grant select on all tables in schema budget to anon;
alter default privileges in schema budget grant all on tables to authenticated;

-- Dernière étape, à faire à la main dans le Dashboard (pas en SQL) :
-- Project Settings > API > "Exposed schemas" > ajouter "budget" à la liste.
