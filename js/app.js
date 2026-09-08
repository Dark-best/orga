import { supabase } from "./supabase.js";
import { route, setNotFound, startRouter, navigate, normalizeInitialUrl, render } from "./router.js";
import { renderLogin, renderInvite, currentUser } from "./auth.js";
import { renderDashboard } from "./dashboard.js";
import { renderEditor } from "./editor.js";
import { renderAdmin } from "./admin.js";

// Garde : redirige vers /login si non authentifié
async function guard(handler) {
  const user = await currentUser();
  if (!user) return navigate("/login");
  return handler;
}

// Routes
route("/",              async () => (await guard(renderDashboard))?.());
route("/login",         () => renderLogin());
route("/invite/:token", (p) => renderInvite(p));
route("/editor/:id",    async (p) => { if (await currentUser()) renderEditor(p); else navigate("/login"); });
route("/admin",         async () => { if (await currentUser()) renderAdmin(); else navigate("/login"); });
setNotFound(() => navigate("/"));

// Si l'utilisateur se connecte/déconnecte dans un autre onglet, on rerend.
supabase.auth.onAuthStateChange((event) => {
  if (event === "SIGNED_OUT") navigate("/login");
});

normalizeInitialUrl();
startRouter();
