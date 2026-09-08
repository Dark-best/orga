// Client Supabase partagé (import ESM via CDN — pas d'étape de build requise)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cfg = window.MINDFLOW_CONFIG || {};

if (!cfg.SUPABASE_URL || cfg.SUPABASE_URL.includes("VOTRE-PROJET")) {
  console.warn(
    "[MindFlow] config.js n'est pas configuré. Renseignez SUPABASE_URL et SUPABASE_ANON_KEY."
  );
}

export const supabase = createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

export const config = cfg;
