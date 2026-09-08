-- ============================================================================
--  MindFlow — Optimisation de la base de données (PostgreSQL / Supabase)
--  À exécuter APRÈS schema.sql, dans : Dashboard > SQL Editor > New query.
--  100 % idempotent : peut être relancé sans risque.
--
--  Objectifs :
--    1. Index adaptés aux requêtes réelles de l'application (dashboard, éditeur).
--    2. Politiques RLS plus rapides (auth.uid() évalué une seule fois).
--    3. Realtime fiable, y compris pour les suppressions.
--    4. Statistiques à jour pour le planificateur.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. INDEX
-- ----------------------------------------------------------------------------

-- Dashboard : select ... from projects where user_id = ? order by updated_at desc
-- Un index composite (user_id, updated_at desc) sert le filtre ET le tri.
create index if not exists projects_user_updated_idx
  on public.projects (user_id, updated_at desc);

-- L'ancien index simple sur user_id devient redondant (le composite le couvre).
drop index if exists public.projects_user_id_idx;

-- Éditeur : select ... from nodes where project_id = ?
-- Index couvrant : évite un accès table pour lire text/x/y/color/parent_id.
create index if not exists nodes_project_covering_idx
  on public.nodes (project_id)
  include (parent_id, text, x, y, color);

-- Sous-requêtes RLS des nodes : exists(select 1 from projects where id=? and user_id=?)
-- La clé primaire de projects (id) couvre déjà ce lookup ; on ajoute user_id
-- pour permettre un index-only scan et éviter la lecture de la ligne.
create index if not exists projects_id_user_idx
  on public.projects (id, user_id);

-- Invitations : is_invite_valid / consommation filtrent sur (token, used).
create index if not exists invitations_token_used_idx
  on public.invitations (token) where used = false;

-- ----------------------------------------------------------------------------
-- 2. POLITIQUES RLS OPTIMISÉES
--    Envelopper auth.uid() dans un sous-select force son évaluation UNE fois
--    (initPlan) au lieu d'un appel par ligne — gros gain sur les gros projets.
--    On fusionne aussi les 4 policies identiques de nodes en une seule (for all).
-- ----------------------------------------------------------------------------

-- PROJECTS
drop policy if exists "projects_all_own" on public.projects;
create policy "projects_all_own" on public.projects
  for all
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- NODES — une policy unique remplace les 4 précédentes (logique identique).
drop policy if exists "nodes_select_own" on public.nodes;
drop policy if exists "nodes_insert_own" on public.nodes;
drop policy if exists "nodes_update_own" on public.nodes;
drop policy if exists "nodes_delete_own" on public.nodes;
drop policy if exists "nodes_all_own"    on public.nodes;
create policy "nodes_all_own" on public.nodes
  for all
  using (
    exists (select 1 from public.projects p
            where p.id = nodes.project_id and p.user_id = (select auth.uid()))
  )
  with check (
    exists (select 1 from public.projects p
            where p.id = nodes.project_id and p.user_id = (select auth.uid()))
  );

-- PROFILES — même optimisation du sous-select.
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select using (id = (select auth.uid()));

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (id = (select auth.uid()));

-- ----------------------------------------------------------------------------
-- 3. REALTIME
--    L'éditeur écoute les changements filtrés par project_id. Pour que le
--    filtre s'applique aussi aux UPDATE/DELETE, la table doit émettre la ligne
--    complète (REPLICA IDENTITY FULL) et non seulement sa clé primaire.
-- ----------------------------------------------------------------------------
alter table public.nodes replica identity full;

do $$
begin
  -- Ajoute la table à la publication realtime si absente (évite l'erreur si déjà présente).
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'nodes'
  ) then
    execute 'alter publication supabase_realtime add table public.nodes';
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 4. STATISTIQUES
--    Met à jour les stats du planificateur pour qu'il choisisse les bons index.
-- ----------------------------------------------------------------------------
analyze public.projects;
analyze public.nodes;
analyze public.invitations;
analyze public.profiles;

-- ============================================================================
--  Vérification (facultatif) : lister les index créés
-- ============================================================================
-- select tablename, indexname from pg_indexes
-- where schemaname = 'public' order by tablename, indexname;
