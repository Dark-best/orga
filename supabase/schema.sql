-- ============================================================================
--  MindFlow — Schéma Supabase (PostgreSQL)
--  À exécuter dans : Supabase Dashboard > SQL Editor > New query
--  Ordre : tables -> fonctions/triggers -> RLS -> policies
-- ============================================================================

-- Extensions utiles (uuid, etc.) — présentes par défaut sur Supabase
create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- 1. PROFILS  (miroir applicatif de auth.users)
-- ----------------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text,
  created_at  timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 2. INVITATIONS  (jetons d'inscription à usage unique)
-- ----------------------------------------------------------------------------
create table if not exists public.invitations (
  id          uuid primary key default gen_random_uuid(),
  token       text not null unique,
  used        boolean not null default false,
  used_by     uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  used_at     timestamptz
);

-- ----------------------------------------------------------------------------
-- 3. PROJETS  (cartes mentales)
-- ----------------------------------------------------------------------------
create table if not exists public.projects (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null default 'Nouveau projet',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists projects_user_id_idx on public.projects(user_id);

-- ----------------------------------------------------------------------------
-- 4. NŒUDS  (cartes / rectangles du canevas)
-- ----------------------------------------------------------------------------
create table if not exists public.nodes (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects(id) on delete cascade,
  parent_id   uuid references public.nodes(id) on delete cascade,
  text        text not null default 'Nouvelle idée',
  x           double precision not null default 0,
  y           double precision not null default 0,
  color       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists nodes_project_id_idx on public.nodes(project_id);
create index if not exists nodes_parent_id_idx  on public.nodes(parent_id);

-- ============================================================================
--  FONCTIONS & TRIGGERS
-- ============================================================================

-- Met à jour updated_at automatiquement
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end; $$;

drop trigger if exists trg_projects_touch on public.projects;
create trigger trg_projects_touch before update on public.projects
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_nodes_touch on public.nodes;
create trigger trg_nodes_touch before update on public.nodes
  for each row execute function public.touch_updated_at();

-- ----------------------------------------------------------------------------
--  INSCRIPTION PAR INVITATION — appliquée AU NIVEAU BASE DE DONNÉES
--  Empêche toute inscription sans jeton valide, même via appel API direct.
--  Le token est transmis dans les métadonnées d'inscription (raw_user_meta_data).
-- ----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text;
  v_invite public.invitations%rowtype;
begin
  v_token := new.raw_user_meta_data ->> 'invite_token';

  if v_token is null or length(trim(v_token)) = 0 then
    raise exception 'INVITE_REQUIRED: un jeton d''invitation est requis pour s''inscrire.';
  end if;

  -- Verrouille la ligne pour éviter une double utilisation concurrente
  select * into v_invite
  from public.invitations
  where token = v_token and used = false
  for update;

  if not found then
    raise exception 'INVITE_INVALID: jeton d''invitation invalide ou déjà utilisé.';
  end if;

  -- Marque l'invitation comme consommée
  update public.invitations
  set used = true, used_by = new.id, used_at = now()
  where id = v_invite.id;

  -- Crée le profil applicatif
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;

  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ----------------------------------------------------------------------------
--  VERROU ABSOLU : une invitation est à usage unique et NON réutilisable,
--  en toute circonstance (y compris via admin ou service_role).
--    * impossible de repasser used = true -> false
--    * impossible de supprimer une invitation déjà utilisée (historique conservé)
--      => la contrainte UNIQUE(token) empêche alors de recréer le même jeton.
--  (Un trigger de table s'applique à TOUTES les écritures, même SECURITY DEFINER.)
-- ----------------------------------------------------------------------------
create or replace function public.protect_invitation()
returns trigger language plpgsql as $$
begin
  if (tg_op = 'UPDATE') then
    if old.used = true and new.used = false then
      raise exception 'INVITE_LOCKED: une invitation utilisée ne peut jamais être réactivée.';
    end if;
    -- le jeton d'une invitation consommée est figé
    if old.used = true and new.token <> old.token then
      raise exception 'INVITE_LOCKED: le jeton d''une invitation utilisée est immuable.';
    end if;
    return new;
  elsif (tg_op = 'DELETE') then
    if old.used = true then
      raise exception 'INVITE_LOCKED: une invitation utilisée ne peut pas être supprimée.';
    end if;
    return old;
  end if;
  return new;
end; $$;

drop trigger if exists trg_protect_invitation on public.invitations;
create trigger trg_protect_invitation
  before update or delete on public.invitations
  for each row execute function public.protect_invitation();

-- ----------------------------------------------------------------------------
--  Vérification publique d'un jeton (lecture seule, avant inscription)
--  Renvoie true si le token existe et n'est pas encore utilisé.
--  SECURITY DEFINER pour contourner la RLS sans exposer la table entière.
-- ----------------------------------------------------------------------------
create or replace function public.is_invite_valid(p_token text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.invitations
    where token = p_token and used = false
  );
$$;

grant execute on function public.is_invite_valid(text) to anon, authenticated;

-- ============================================================================
--  ROW LEVEL SECURITY
-- ============================================================================
alter table public.profiles    enable row level security;
alter table public.invitations enable row level security;
alter table public.projects    enable row level security;
alter table public.nodes       enable row level security;

-- PROFILES : chacun lit/écrit uniquement son profil
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id);

-- INVITATIONS : aucune lecture/écriture directe côté client.
-- (La validation passe par la fonction is_invite_valid ; la consommation par le trigger.)
-- => Pas de policy = tout est refusé pour anon/authenticated. Volontaire.

-- PROJECTS : CRUD limité au propriétaire
drop policy if exists "projects_all_own" on public.projects;
create policy "projects_all_own" on public.projects
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- NODES : accès si le nœud appartient à un projet de l'utilisateur
drop policy if exists "nodes_select_own" on public.nodes;
create policy "nodes_select_own" on public.nodes
  for select using (
    exists (select 1 from public.projects p
            where p.id = nodes.project_id and p.user_id = auth.uid())
  );

drop policy if exists "nodes_insert_own" on public.nodes;
create policy "nodes_insert_own" on public.nodes
  for insert with check (
    exists (select 1 from public.projects p
            where p.id = nodes.project_id and p.user_id = auth.uid())
  );

drop policy if exists "nodes_update_own" on public.nodes;
create policy "nodes_update_own" on public.nodes
  for update using (
    exists (select 1 from public.projects p
            where p.id = nodes.project_id and p.user_id = auth.uid())
  );

drop policy if exists "nodes_delete_own" on public.nodes;
create policy "nodes_delete_own" on public.nodes
  for delete using (
    exists (select 1 from public.projects p
            where p.id = nodes.project_id and p.user_id = auth.uid())
  );

-- ============================================================================
--  (OPTIONNEL) Realtime : diffuser les changements de nœuds
--  Dashboard > Database > Replication, ou :
-- ============================================================================
-- alter publication supabase_realtime add table public.nodes;
-- alter publication supabase_realtime add table public.projects;

-- ============================================================================
--  GÉNÉRER DES INVITATIONS (exécuter au besoin, en tant qu'admin)
-- ============================================================================
-- insert into public.invitations (token) values ('x2jRRl9');
-- Générer 5 jetons aléatoires :
-- insert into public.invitations (token)
-- select substr(replace(gen_random_uuid()::text,'-',''),1,7) from generate_series(1,5)
-- returning token;
