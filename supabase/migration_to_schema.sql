-- Migration : déplacer les tables de l'appli Budget famille du schéma
-- "public" vers un schéma dédié "budget", pour cohabiter proprement avec
-- vos autres projets (ex: multisports) dans la même base Supabase.
--
-- À exécuter UNE SEULE FOIS, dans Supabase > SQL Editor, sur une base qui a
-- déjà les tables settings / categories / entries dans "public".
-- Si vous créez une base neuve, utilisez plutôt schema.sql (déjà à jour).

-- 1) Créer le schéma s'il n'existe pas encore
create schema if not exists budget;

-- 2) Déplacer les 3 tables : opération de métadonnées, quasi instantanée,
--    aucune donnée réécrite, contraintes / index / triggers / policies RLS conservés.
alter table if exists public.settings set schema budget;
alter table if exists public.categories set schema budget;
alter table if exists public.entries set schema budget;

-- 3) Réaffirmer explicitement l'appartenance à la publication temps réel
--    avec le nouveau schéma (elle suit normalement la table automatiquement,
--    mais on le fait explicitement par sécurité).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'budget' and tablename = 'settings'
  ) then
    alter publication supabase_realtime add table budget.settings;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'budget' and tablename = 'categories'
  ) then
    alter publication supabase_realtime add table budget.categories;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'budget' and tablename = 'entries'
  ) then
    alter publication supabase_realtime add table budget.entries;
  end if;
end $$;

-- 4) Autoriser les rôles de l'API (anon, authenticated) à voir/utiliser le
--    schéma. Sans ça, PostgREST renvoie une erreur même une fois le schéma
--    exposé côté Dashboard.
grant usage on schema budget to anon, authenticated;
grant all on all tables in schema budget to authenticated;
grant select on all tables in schema budget to anon;
alter default privileges in schema budget grant all on tables to authenticated;

-- 5) Dernière étape, à faire à la main dans le Dashboard (pas en SQL) :
--    Project Settings > API > "Exposed schemas" > ajouter "budget" à la liste
--    (garder "public" si d'autres projets l'utilisent encore).
--    Sans cette étape, le client supabase-js ne trouvera pas les tables.

-- Vérification :
-- select table_schema, table_name from information_schema.tables
-- where table_name in ('settings','categories','entries');
-- → doit afficher table_schema = 'budget' pour les 3.
