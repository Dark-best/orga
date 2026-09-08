// ============================================================================
//  Configuration — MindFlow
//  Remplacez ces valeurs par celles de votre projet Supabase :
//  Supabase Dashboard > Project Settings > API
//  (La clé anon est publique par conception : la sécurité repose sur la RLS.)
// ============================================================================
window.MINDFLOW_CONFIG = {
  SUPABASE_URL: "https://VOTRE-PROJET.supabase.co",
  SUPABASE_ANON_KEY: "VOTRE_CLE_ANON_PUBLIQUE",

  // Nom du dépôt GitHub Pages (ex : "/mind"). Laissez "" si domaine racine.
  // Sert à construire les liens d'invitation partageables.
  BASE_PATH: "",

  // Quota base de données (Mo) pour la jauge d'usage du panneau admin.
  // Plan gratuit Supabase = 500 Mo. Ajustez selon votre offre.
  DB_QUOTA_MB: 500,
};
