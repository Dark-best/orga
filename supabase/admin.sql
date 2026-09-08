-- ============================================================================
--  MindFlow — Extension ADMIN
--  À exécuter APRÈS schema.sql (Supabase > SQL Editor).
--
--  Sécurité : aucune clé service_role côté client. L'accès admin repose sur
--  un flag en base (profiles.is_admin) + des fonctions SECURITY DEFINER qui
--  vérifient is_admin() à chaque appel. La clé anon reste publique et inoffensive.
-- ============================================================================

-- 1) Flag admin sur les profils
alter table public.profiles add column if not exists is_admin boolean not null default false;

-- 2) Désigner VOTRE utilisateur comme admin (⚠️ REMPLACER l'email)
--    L'utilisateur doit s'être inscrit au préalable.
update public.profiles
set is_admin = true
where id = (select id from auth.users where email = 'fuchsromain10@gmail.com');

-- 3) Helper : l'appelant courant est-il admin ?
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select coalesce(
    (select is_admin from public.profiles where id = auth.uid()),
    false
  );
$$;
grant execute on function public.is_admin() to authenticated;

-- Petit garde réutilisable
create or replace function public.assert_admin()
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN: accès réservé à l''administrateur.';
  end if;
end; $$;

-- ============================================================================
--  POLICIES ADMIN (permissives : combinées en OR avec les policies existantes)
--  => l'admin peut lire/gérer TOUTES les données ; les autres restent limités.
-- ============================================================================
drop policy if exists "profiles_admin_select" on public.profiles;
create policy "profiles_admin_select" on public.profiles
  for select using (public.is_admin());

drop policy if exists "projects_admin_all" on public.projects;
create policy "projects_admin_all" on public.projects
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "nodes_admin_all" on public.nodes;
create policy "nodes_admin_all" on public.nodes
  for all using (public.is_admin()) with check (public.is_admin());

-- Invitations : l'admin peut lire/créer/supprimer (sinon table verrouillée)
drop policy if exists "invitations_admin_all" on public.invitations;
create policy "invitations_admin_all" on public.invitations
  for all using (public.is_admin()) with check (public.is_admin());

-- ============================================================================
--  FONCTIONS RPC ADMIN (toutes gardées par assert_admin)
-- ============================================================================

-- ---- Statistiques globales + usage base de données --------------------------
create or replace function public.admin_stats()
returns json language plpgsql security definer set search_path = public as $$
declare r json;
begin
  perform public.assert_admin();
  select json_build_object(
    'users',        (select count(*) from auth.users),
    'projects',     (select count(*) from public.projects),
    'nodes',        (select count(*) from public.nodes),
    'invites_total',(select count(*) from public.invitations),
    'invites_used', (select count(*) from public.invitations where used),
    'invites_free', (select count(*) from public.invitations where not used),
    'db_bytes',     pg_database_size(current_database()),
    'nodes_bytes',  pg_total_relation_size('public.nodes'),
    'projects_bytes', pg_total_relation_size('public.projects')
  ) into r;
  return r;
end; $$;

-- ---- Liste des utilisateurs -------------------------------------------------
create or replace function public.admin_list_users()
returns json language plpgsql security definer set search_path = public as $$
declare r json;
begin
  perform public.assert_admin();
  select coalesce(json_agg(row_to_json(t) order by t.created_at), '[]'::json) into r
  from (
    select u.id, u.email, u.created_at, u.last_sign_in_at,
           coalesce(p.is_admin, false) as is_admin,
           (select count(*) from public.projects pr where pr.user_id = u.id) as project_count
    from auth.users u
    left join public.profiles p on p.id = u.id
  ) t;
  return r;
end; $$;

-- ---- Liste de TOUS les projets (avec propriétaire + nb de cartes) -----------
create or replace function public.admin_list_projects()
returns json language plpgsql security definer set search_path = public as $$
declare r json;
begin
  perform public.assert_admin();
  select coalesce(json_agg(row_to_json(t) order by t.updated_at desc), '[]'::json) into r
  from (
    select pr.id, pr.name, pr.updated_at, pr.user_id,
           u.email as owner_email,
           (select count(*) from public.nodes n where n.project_id = pr.id) as node_count
    from public.projects pr
    left join auth.users u on u.id = pr.user_id
  ) t;
  return r;
end; $$;

-- ---- Cartes (nœuds) d'un projet --------------------------------------------
create or replace function public.admin_list_nodes(p_project uuid)
returns json language plpgsql security definer set search_path = public as $$
declare r json;
begin
  perform public.assert_admin();
  select coalesce(json_agg(row_to_json(t) order by t.created_at), '[]'::json) into r
  from (
    select id, text, parent_id, created_at
    from public.nodes where project_id = p_project
  ) t;
  return r;
end; $$;

-- ---- Invitations ------------------------------------------------------------
create or replace function public.admin_list_invitations()
returns json language plpgsql security definer set search_path = public as $$
declare r json;
begin
  perform public.assert_admin();
  select coalesce(json_agg(row_to_json(t) order by t.created_at desc), '[]'::json) into r
  from (
    select i.id, i.token, i.used, i.created_at, i.used_at,
           u.email as used_by_email
    from public.invitations i
    left join auth.users u on u.id = i.used_by
  ) t;
  return r;
end; $$;

-- Créer une invitation (jeton fourni, sinon aléatoire ~7 caractères)
create or replace function public.admin_create_invite(p_token text default null)
returns text language plpgsql security definer set search_path = public as $$
declare v_token text;
begin
  perform public.assert_admin();
  v_token := nullif(trim(coalesce(p_token, '')), '');
  if v_token is null then
    v_token := substr(replace(gen_random_uuid()::text, '-', ''), 1, 7);
  end if;
  insert into public.invitations (token) values (v_token);
  return v_token;
end; $$;

-- Supprimer une invitation
-- Supprimer une invitation NON utilisée uniquement.
-- (Une invitation consommée est définitive : voir le trigger protect_invitation.)
create or replace function public.admin_delete_invite(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_admin();
  if exists (select 1 from public.invitations where id = p_id and used = true) then
    raise exception 'INVITE_LOCKED: une invitation utilisée ne peut pas être supprimée.';
  end if;
  delete from public.invitations where id = p_id and used = false;
end; $$;

-- ---- Actions destructrices --------------------------------------------------
create or replace function public.admin_delete_project(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_admin();
  delete from public.projects where id = p_id;   -- cascade -> nodes
end; $$;

create or replace function public.admin_delete_node(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_admin();
  delete from public.nodes where id = p_id;       -- cascade -> descendants
end; $$;

-- Supprimer un utilisateur (et par cascade ses projets/nœuds/profil)
create or replace function public.admin_delete_user(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_admin();
  if p_id = auth.uid() then
    raise exception 'REFUS: vous ne pouvez pas supprimer votre propre compte admin.';
  end if;
  delete from auth.users where id = p_id;         -- cascade -> profiles/projects/nodes
end; $$;

-- Basculer le statut admin d'un utilisateur
create or replace function public.admin_set_admin(p_id uuid, p_value boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_admin();
  insert into public.profiles (id, is_admin)
  values (p_id, p_value)
  on conflict (id) do update set is_admin = excluded.is_admin;
end; $$;

-- Droits d'exécution (seuls les appels authentifiés ; le garde interne fait le reste)
grant execute on function
  public.admin_stats(),
  public.admin_list_users(),
  public.admin_list_projects(),
  public.admin_list_nodes(uuid),
  public.admin_list_invitations(),
  public.admin_create_invite(text),
  public.admin_delete_invite(uuid),
  public.admin_delete_project(uuid),
  public.admin_delete_node(uuid),
  public.admin_delete_user(uuid),
  public.admin_set_admin(uuid, boolean)
to authenticated;
