import { supabase } from "./supabase.js";
import { app, esc, toast } from "./ui.js";
import { navigate } from "./router.js";

export async function currentUser() {
  const { data } = await supabase.auth.getUser();
  return data?.user ?? null;
}

function shell(inner) {
  return `
  <div class="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950">
    <div class="w-full max-w-md">
      <div class="text-center mb-6">
        <div class="inline-flex items-center gap-2 text-white">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-indigo-400">
            <circle cx="6" cy="12" r="3"/><circle cx="18" cy="6" r="3"/><circle cx="18" cy="18" r="3"/>
            <path d="M8.7 10.7 15.3 7.3M8.7 13.3 15.3 16.7"/>
          </svg>
          <span class="text-2xl font-bold tracking-tight">MindFlow</span>
        </div>
        <p class="text-slate-400 text-sm mt-1">Cartes mentales interactives</p>
      </div>
      <div class="bg-white rounded-2xl shadow-2xl p-6">${inner}</div>
    </div>
  </div>`;
}

const inputCls =
  "w-full px-3 py-2 rounded-lg border border-slate-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none transition";
const btnCls =
  "w-full py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-semibold transition disabled:opacity-50";

// ---------------------------------------------------------------- CONNEXION
export function renderLogin() {
  app().innerHTML = shell(`
    <h1 class="text-xl font-bold text-slate-800 mb-4">Connexion</h1>
    <form id="loginForm" class="space-y-3">
      <input class="${inputCls}" type="email" name="email" placeholder="Email" required autocomplete="email"/>
      <input class="${inputCls}" type="password" name="password" placeholder="Mot de passe" required autocomplete="current-password"/>
      <button class="${btnCls}" type="submit">Se connecter</button>
    </form>
    <p class="text-sm text-slate-500 mt-4 text-center">
      Vous avez un lien d'invitation ? Ouvrez-le pour créer un compte.
    </p>`);

  document.getElementById("loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector("button");
    btn.disabled = true;
    const f = new FormData(e.target);
    const { error } = await supabase.auth.signInWithPassword({
      email: f.get("email"), password: f.get("password"),
    });
    btn.disabled = false;
    if (error) return toast(error.message, "error");
    toast("Connecté", "success");
    navigate("/");
  });
}

// -------------------------------------------------------------- INSCRIPTION
export async function renderInvite({ token }) {
  app().innerHTML = shell(`<p class="text-center text-slate-500 py-6">Vérification de l'invitation…</p>`);

  const { data: valid, error } = await supabase.rpc("is_invite_valid", { p_token: token });

  if (error || !valid) {
    app().innerHTML = shell(`
      <div class="text-center py-4">
        <div class="text-4xl mb-2">🔒</div>
        <h1 class="text-xl font-bold text-slate-800">Invitation invalide</h1>
        <p class="text-slate-500 text-sm mt-2">
          Ce lien d'invitation est invalide ou a déjà été utilisé.
        </p>
        <a href="#/login" class="inline-block mt-4 text-indigo-600 font-medium hover:underline">Aller à la connexion</a>
      </div>`);
    return;
  }

  app().innerHTML = shell(`
    <h1 class="text-xl font-bold text-slate-800 mb-1">Créer votre compte</h1>
    <p class="text-emerald-600 text-sm mb-4">✓ Invitation valide</p>
    <form id="signupForm" class="space-y-3">
      <input class="${inputCls}" type="email" name="email" placeholder="Email" required autocomplete="email"/>
      <input class="${inputCls}" type="password" name="password" placeholder="Mot de passe (min. 6 caractères)" required minlength="6" autocomplete="new-password"/>
      <button class="${btnCls}" type="submit">Créer le compte</button>
    </form>
    <p class="text-sm text-slate-500 mt-4 text-center">
      Déjà inscrit ? <a href="#/login" class="text-indigo-600 hover:underline">Se connecter</a>
    </p>`);

  document.getElementById("signupForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector("button");
    btn.disabled = true;
    const f = new FormData(e.target);
    // Le jeton est passé en métadonnées : le trigger SQL le valide et le consomme.
    const { data, error } = await supabase.auth.signUp({
      email: f.get("email"),
      password: f.get("password"),
      options: { data: { invite_token: token } },
    });
    btn.disabled = false;

    if (error) {
      const msg = /INVITE_INVALID|INVITE_REQUIRED/.test(error.message)
        ? "Invitation invalide ou déjà utilisée."
        : error.message;
      return toast(msg, "error");
    }
    // Si la confirmation email est désactivée, une session existe déjà.
    if (data.session) { toast("Compte créé", "success"); navigate("/"); }
    else {
      app().innerHTML = shell(`
        <div class="text-center py-4">
          <div class="text-4xl mb-2">📧</div>
          <h1 class="text-xl font-bold text-slate-800">Vérifiez vos emails</h1>
          <p class="text-slate-500 text-sm mt-2">
            Un email de confirmation a été envoyé à <b>${esc(f.get("email"))}</b>.
          </p>
          <a href="#/login" class="inline-block mt-4 text-indigo-600 font-medium hover:underline">Aller à la connexion</a>
        </div>`);
    }
  });
}

export async function logout() {
  await supabase.auth.signOut();
  toast("Déconnecté", "info");
  navigate("/login");
}
