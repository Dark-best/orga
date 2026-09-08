// ============================================================================
//  Configuration — MindFlow
//  Remplacez ces valeurs par celles de votre projet Supabase :
//  Supabase Dashboard > Project Settings > API
//  (La clé anon est publique par conception : la sécurité repose sur la RLS.)
// ============================================================================
window.MINDFLOW_CONFIG = {
  SUPABASE_URL: "https://zitexjfauanppuwlmgdr.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InppdGV4amZhdWFucHB1d2xtZ2RyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg4NzQ3NjMsImV4cCI6MjEwNDQ1MDc2M30.LQRXJT3p21poyh79C7Xcv0MEmhvybaKg08x-6B8vcU0",

  // Nom du dépôt GitHub Pages (ex : "/mind"). Laissez "" si domaine racine.
  // Sert à construire les liens d'invitation partageables.
  BASE_PATH: "",

  // Quota base de données (Mo) pour la jauge d'usage du panneau admin.
  // Plan gratuit Supabase = 500 Mo. Ajustez selon votre offre.
  DB_QUOTA_MB: 500,
};
