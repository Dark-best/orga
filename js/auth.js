import { supabase } from "./supabase.js";
import { app, esc, toast, icon, themeToggleButton, wireThemeToggle } from "./ui.js";
import { navigate } from "./router.js";

export async function currentUser() {
  const { data } = await supabase.auth.getUser();
  return data?.user ?? null;
}

// Enveloppe visuelle des écrans d'authentification (split moderne).
function shell(inner) {
  return `
  <div class="mf-aurora min-h-screen grid lg:grid-cols-2">
    <!-- Panneau gauche : présentation -->
    <div class="relative hidden lg:flex flex-col justify-between p-12 overflow-hidden
                bg-gradient-to-br from-brand-700 via-brand-800 to-slate-950 text-white">
      <div class="absolute -top-24 -right-24 w-96 h-96 rounded-full bg-brand-500/30 blur-3xl"></div>
      <div class="absolute -bottom-32 -left-16 w-96 h-96 rounded-full bg-sky-500/20 blur-3xl"></div>
      <div class="relative flex items-center gap-2.5 font-bold text-xl">
        <span class="w-10 h-10 rounded-2xl bg-white/10 ring-1 ring-white/20 flex items-center justify-center">${icon("brand", "w-6 h-6")}</span>
        MindFlow
      </div>
      <div class="relative">
        <h2 class="text-4xl font-extrabold leading-tight tracking-tight">Donnez vie<br/>à vos idées.</h2>
        <p class="mt-4 text-brand-100/80 max-w-sm">Des cartes mentales fluides, collaboratives et synchronisées en temps réel. Structurez votre pensée, sans friction.</p>
        <div class="mt-8 flex flex-wrap gap-2 text-sm">
          <span class="px-3 py-1.5 rounded-full bg-white/10 ring-1 ring-white/15">🧠 Multi-projets</span>
          <span class="px-3 py-1.5 rounded-full bg-white/10 ring-1 ring-white/15">⚡ Temps réel</span>
          <span class="px-3 py-1.5 rounded-full bg-white/10 ring-1 ring-white/15">🔒 Sur invitation</span>
        </div>
      </div>
      <p class="relative text-xs text-brand-200/60">Propulsé par Supabase · © MindFlow</p>
    </div>

    <!-- Panneau droit : formulaire -->
    <div class="mf-aurora flex flex-col items-center justify-center p-6 relative">
      <div class="absolute top-4 right-4">${themeToggleButton()}</div>
      <div class="w-full max-w-sm animate-slide-up">
        <div class="lg:hidden flex items-center justify-center gap-2 text-brand-600 dark:text-brand-300 font-bold text-xl mb-8">
          ${icon("brand", "w-7 h-7")} MindFlow
        </div>
        ${inner}
      </div>
    </div>
  </div>`;
}

const inputCls =
  "w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 " +
  "text-slate-900 dark:text-white placeholder:text-slate-400 outline-none transition " +
  "focus:ring-2 focus:ring-brand-400 focus:border-brand-400";
const btnCls =
  "w-full py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 active:scale-[.99] text-white font-semibold " +
  "shadow-soft transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2";
const cardCls =
  "bg-white dark:bg-slate-900 rounded-3xl shadow-lift ring-1 ring-slate-200/70 dark:ring-slate-800 p-7";

function field(name, type, placeholder, extra = "") {
  return `<input class="${inputCls}" type="${type}" name="${name}" placeholder="${placeholder}" ${extra}/>`;
}

// ---------------------------------------------------------------- CONNEXION
export function renderLogin() {
  app().innerHTML = shell(`
    <div class="${cardCls}">
      <h1 class="text-2xl font-bold text-slate-900 dark:text-white">Bon retour 👋</h1>
      <p class="text-sm text-slate-500 dark:text-slate-400 mt-1 mb-6">Connectez-vous pour accéder à vos cartes.</p>
      <form id="loginForm" class="space-y-3">
        ${field("email", "email", "Email", 'required autocomplete="email"')}
        ${field("password", "password", "Mot de passe", 'required autocomplete="current-password"')}
        <button class="${btnCls}" type="submit"><span>Se connecter</span></button>
      </form>
      <div class="mt-6 pt-5 border-t border-slate-100 dark:border-slate-800 text-sm text-slate-500 dark:text-slate-400 text-center">
        Vous avez un lien d'invitation ?<br/>Ouvrez-le pour créer votre compte.
      </div>
    </div>`);

  wireThemeToggle();
  document.getElementById("loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector("button");
    btn.disabled = true;
    btn.querySelector("span").textContent = "Connexion…";
    const f = new FormData(e.target);
    const { error } = await supabase.auth.signInWithPassword({
      email: f.get("email"), password: f.get("password"),
    });
    btn.disabled = false;
    btn.querySelector("span").textContent = "Se connecter";
    if (error) return toast(error.message, "error");
    toast("Connecté", "success");
    navigate("/");
  });
}

// -------------------------------------------------------------- INSCRIPTION
export async function renderInvite({ token }) {
  app().innerHTML = shell(`
    <div class="${cardCls} text-center">
      <div class="w-10 h-10 mx-auto mb-3 rounded-full border-2 border-brand-200 border-t-brand-600 animate-spin"></div>
      <p class="text-slate-500 dark:text-slate-400 text-sm">Vérification de l'invitation…</p>
    </div>`);
  wireThemeToggle();

  const { data: valid, error } = await supabase.rpc("is_invite_valid", { p_token: token });

  if (error || !valid) {
    app().innerHTML = shell(`
      <div class="${cardCls} text-center">
        <div class="w-14 h-14 mx-auto rounded-2xl bg-rose-50 dark:bg-rose-950/50 text-rose-500 flex items-center justify-center text-2xl mb-3">🔒</div>
        <h1 class="text-xl font-bold text-slate-900 dark:text-white">Invitation invalide</h1>
        <p class="text-slate-500 dark:text-slate-400 text-sm mt-2">Ce lien d'invitation est invalide ou a déjà été utilisé.</p>
        <a href="#/login" class="inline-block mt-5 text-brand-600 dark:text-brand-400 font-semibold hover:underline">Aller à la connexion →</a>
      </div>`);
    wireThemeToggle();
    return;
  }

  app().innerHTML = shell(`
    <div class="${cardCls}">
      <span class="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 px-2.5 py-1 rounded-full mb-4">
        ${icon("check", "w-3.5 h-3.5")} Invitation valide
      </span>
      <h1 class="text-2xl font-bold text-slate-900 dark:text-white">Créer votre compte</h1>
      <p class="text-sm text-slate-500 dark:text-slate-400 mt-1 mb-6">Choisissez vos identifiants pour commencer.</p>
      <form id="signupForm" class="space-y-3">
        ${field("email", "email", "Email", 'required autocomplete="email"')}
        ${field("password", "password", "Mot de passe (min. 6 caractères)", 'required minlength="6" autocomplete="new-password"')}
        <button class="${btnCls}" type="submit"><span>Créer le compte</span></button>
      </form>
      <p class="text-sm text-slate-500 dark:text-slate-400 mt-6 text-center">
        Déjà inscrit ? <a href="#/login" class="text-brand-600 dark:text-brand-400 font-semibold hover:underline">Se connecter</a>
      </p>
    </div>`);
  wireThemeToggle();

  document.getElementById("signupForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector("button");
    btn.disabled = true;
    btn.querySelector("span").textContent = "Création…";
    const f = new FormData(e.target);
    const { data, error } = await supabase.auth.signUp({
      email: f.get("email"),
      password: f.get("password"),
      options: { data: { invite_token: token } },
    });
    btn.disabled = false;
    btn.querySelector("span").textContent = "Créer le compte";

    if (error) {
      const msg = /INVITE_INVALID|INVITE_REQUIRED/.test(error.message)
        ? "Invitation invalide ou déjà utilisée."
        : error.message;
      return toast(msg, "error");
    }
    if (data.session) { toast("Compte créé", "success"); navigate("/"); }
    else {
      app().innerHTML = shell(`
        <div class="${cardCls} text-center">
          <div class="w-14 h-14 mx-auto rounded-2xl bg-brand-50 dark:bg-brand-950/50 text-brand-500 flex items-center justify-center text-2xl mb-3">📧</div>
          <h1 class="text-xl font-bold text-slate-900 dark:text-white">Vérifiez vos emails</h1>
          <p class="text-slate-500 dark:text-slate-400 text-sm mt-2">Un email de confirmation a été envoyé à <b class="text-slate-700 dark:text-slate-200">${esc(f.get("email"))}</b>.</p>
          <a href="#/login" class="inline-block mt-5 text-brand-600 dark:text-brand-400 font-semibold hover:underline">Aller à la connexion →</a>
        </div>`);
      wireThemeToggle();
    }
  });
}

export async function logout() {
  await supabase.auth.signOut();
  toast("Déconnecté", "info");
  navigate("/login");
}
