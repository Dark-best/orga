import { supabase, config } from "./supabase.js";
import { app, esc, toast, icon, confirmDialog, askText, themeToggleButton, wireThemeToggle } from "./ui.js";
import { navigate } from "./router.js";
import { currentUser, logout } from "./auth.js";

// Vérifie via RPC si l'utilisateur courant est admin
export async function amIAdmin() {
  const { data, error } = await supabase.rpc("is_admin");
  if (error) return false;
  return data === true;
}

const fmtBytes = (b) => {
  if (b == null) return "—";
  const u = ["o", "Ko", "Mo", "Go"];
  let i = 0, n = Number(b);
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return n.toFixed(n < 10 && i > 0 ? 1 : 0) + " " + u[i];
};
const fmtDate = (d) => (d ? new Date(d).toLocaleString("fr-FR") : "—");

function topbar(email) {
  return `
  <header class="sticky top-0 z-20 bg-slate-900/90 dark:bg-black/80 backdrop-blur-xl text-white border-b border-slate-700/60">
    <div class="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
      <div class="flex items-center gap-2.5 font-bold">
        <span class="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center shadow-soft">${icon("shield", "w-5 h-5")}</span>
        <span>MindFlow <span class="px-2 py-0.5 rounded-md bg-brand-600 text-[11px] align-middle ml-1">ADMIN</span></span>
      </div>
      <div class="flex items-center gap-2 text-sm">
        <a href="#/" class="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 flex items-center gap-1.5 transition">${icon("back", "w-4 h-4")} Projets</a>
        ${themeToggleButton()}
        <span class="text-slate-400 hidden sm:inline max-w-[12rem] truncate">${esc(email)}</span>
        <button id="logoutBtn" title="Déconnexion" class="p-2 rounded-xl bg-white/10 hover:bg-white/20 transition">${icon("logout")}</button>
      </div>
    </div>
  </header>`;
}

export async function renderAdmin() {
  const user = await currentUser();
  if (!user) return navigate("/login");
  if (!(await amIAdmin())) {
    app().innerHTML = `<div class="mf-aurora min-h-screen flex items-center justify-center text-center p-6">
      <div><div class="text-6xl mb-3">⛔</div>
      <h1 class="text-xl font-bold text-slate-900 dark:text-white">Accès refusé</h1>
      <p class="text-slate-500 dark:text-slate-400 text-sm mt-1">Cette zone est réservée à l'administrateur.</p>
      <a href="#/" class="inline-block mt-4 text-brand-600 dark:text-brand-400 font-semibold hover:underline">Retour</a></div></div>`;
    return;
  }

  app().innerHTML = `
    <div class="mf-aurora min-h-screen">
      ${topbar(user.email)}
      <main class="max-w-6xl mx-auto px-4 py-7 space-y-9">
        <section id="statsSection"></section>
        <section id="invitesSection"></section>
        <section id="usersSection"></section>
        <section id="projectsSection"></section>
      </main>
    </div>`;

  wireThemeToggle();
  document.getElementById("logoutBtn").onclick = logout;

  await Promise.all([loadStats(), loadInvites(), loadUsers(), loadProjects()]);
}

const sectionTitle = (t, ic) =>
  `<h2 class="flex items-center gap-2 text-lg font-bold text-slate-900 dark:text-white mb-3">${icon(ic, "w-5 h-5 text-brand-500")} ${t}</h2>`;
const panel = "bg-white dark:bg-slate-900 rounded-2xl ring-1 ring-slate-200/70 dark:ring-slate-800 shadow-soft";

// ---------------------------------------------------------------- STATS
async function loadStats() {
  const box = document.getElementById("statsSection");
  const { data: s, error } = await supabase.rpc("admin_stats");
  if (error) { box.innerHTML = err(error); return; }

  const quotaBytes = (config.DB_QUOTA_MB || 500) * 1024 * 1024;
  const used = Number(s.db_bytes) || 0;
  const pct = Math.min(100, (used / quotaBytes) * 100);
  const barColor = pct > 85 ? "bg-rose-500" : pct > 60 ? "bg-amber-500" : "bg-emerald-500";

  const card = (label, value, sub = "", emoji = "") => `
    <div class="${panel} p-4">
      <div class="flex items-center justify-between">
        <div class="text-3xl font-extrabold text-slate-900 dark:text-white tabular-nums">${value}</div>
        <div class="text-2xl opacity-70">${emoji}</div>
      </div>
      <div class="text-xs font-medium text-slate-500 dark:text-slate-400 mt-1">${label}</div>
      ${sub ? `<div class="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">${sub}</div>` : ""}
    </div>`;

  box.innerHTML = `
    ${sectionTitle("Vue d'ensemble", "target")}
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
      ${card("Utilisateurs", s.users, "", "👥")}
      ${card("Projets", s.projects, "", "🗂️")}
      ${card("Cartes (nœuds)", s.nodes, "", "🧩")}
      ${card("Invitations", s.invites_total, `${s.invites_used} utilisées · ${s.invites_free} libres`, "✉️")}
    </div>
    <div class="${panel} p-4">
      <div class="flex justify-between text-sm mb-1.5">
        <span class="font-semibold text-slate-700 dark:text-slate-200">Usage base de données</span>
        <span class="text-slate-500 dark:text-slate-400 tabular-nums">${fmtBytes(used)} / ${config.DB_QUOTA_MB} Mo</span>
      </div>
      <div class="w-full h-3 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
        <div class="h-full ${barColor} rounded-full transition-all duration-500" style="width:${pct.toFixed(1)}%"></div>
      </div>
      <div class="flex justify-between text-xs text-slate-400 dark:text-slate-500 mt-1.5">
        <span>Restant : ${fmtBytes(Math.max(0, quotaBytes - used))}</span>
        <span>nodes ${fmtBytes(s.nodes_bytes)} · projects ${fmtBytes(s.projects_bytes)}</span>
      </div>
    </div>`;
}

// -------------------------------------------------------------- INVITATIONS
function inviteLink(token) {
  return location.origin + (config.BASE_PATH || "") + "/invite/" + token;
}

async function loadInvites() {
  const box = document.getElementById("invitesSection");
  const { data, error } = await supabase.rpc("admin_list_invitations");
  if (error) { box.innerHTML = err(error); return; }

  box.innerHTML = `
    <div class="flex items-center justify-between mb-3">
      ${sectionTitle("Invitations", "copy").replace("mb-3", "mb-0")}
      <button id="genInvite" class="px-3.5 py-2 text-sm rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-semibold shadow-soft flex items-center gap-1.5 transition">${icon("plus", "w-4 h-4")} Créer</button>
    </div>
    <div class="${panel} overflow-hidden">
      <table class="w-full text-sm">
        <thead class="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wide">
          <tr><th class="text-left px-4 py-2.5">Jeton</th><th class="text-left px-4 py-2.5">Statut</th>
          <th class="text-left px-4 py-2.5 hidden sm:table-cell">Utilisé par</th><th class="px-4 py-2.5"></th></tr>
        </thead>
        <tbody>
          ${data.length ? data.map(inviteRow).join("") :
            `<tr><td colspan="4" class="px-4 py-8 text-center text-slate-400">Aucune invitation</td></tr>`}
        </tbody>
      </table>
    </div>`;

  document.getElementById("genInvite").onclick = async () => {
    const t = await askText({
      title: "Créer une invitation", label: "Jeton (laisser vide = aléatoire)",
      value: "", placeholder: "optionnel", confirmLabel: "Créer", icon: "copy",
    });
    if (t === null) return;
    const { data: token, error } = await supabase.rpc("admin_create_invite", { p_token: t.trim() || null });
    if (error) return toast(error.message, "error");
    toast("Invitation créée : " + token, "success");
    loadInvites(); loadStats();
  };

  box.querySelectorAll("[data-copy]").forEach((b) => (b.onclick = () => {
    navigator.clipboard?.writeText(inviteLink(b.dataset.copy));
    toast("Lien copié", "success");
  }));
  box.querySelectorAll("[data-delinv]").forEach((b) => (b.onclick = async () => {
    if (!(await confirmDialog({ title: "Supprimer l'invitation", message: "Cette invitation non utilisée sera supprimée.", confirmLabel: "Supprimer", danger: true, icon: "trash" }))) return;
    const { error } = await supabase.rpc("admin_delete_invite", { p_id: b.dataset.delinv });
    if (error) return toast(error.message, "error");
    loadInvites(); loadStats();
  }));
}

function inviteRow(i) {
  return `<tr class="border-t border-slate-100 dark:border-slate-800">
    <td class="px-4 py-2.5 font-mono text-slate-700 dark:text-slate-200">${esc(i.token)}</td>
    <td class="px-4 py-2.5">${i.used
      ? `<span class="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 text-xs font-medium">Utilisée</span>`
      : `<span class="px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 text-xs font-medium">Libre</span>`}</td>
    <td class="px-4 py-2.5 text-slate-500 dark:text-slate-400 hidden sm:table-cell">${i.used_by_email ? esc(i.used_by_email) : "—"}</td>
    <td class="px-4 py-2.5 text-right whitespace-nowrap">
      ${i.used
        ? `<span class="text-xs text-slate-400" title="Une invitation utilisée est définitive et non réutilisable">🔒 définitive</span>`
        : `<button data-copy="${esc(i.token)}" class="text-xs px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 mr-1 transition">Copier le lien</button>
           <button data-delinv="${i.id}" class="text-xs px-2.5 py-1.5 rounded-lg bg-rose-50 dark:bg-rose-950/50 hover:bg-rose-100 text-rose-600 dark:text-rose-400 transition">Suppr.</button>`}
    </td></tr>`;
}

// ------------------------------------------------------------------ USERS
async function loadUsers() {
  const box = document.getElementById("usersSection");
  const [{ data, error }, me] = await Promise.all([
    supabase.rpc("admin_list_users"), currentUser(),
  ]);
  if (error) { box.innerHTML = err(error); return; }

  box.innerHTML = `
    ${sectionTitle("Utilisateurs", "target")}
    <div class="${panel} overflow-x-auto">
      <table class="w-full text-sm min-w-[560px]">
        <thead class="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wide">
          <tr><th class="text-left px-4 py-2.5">Email</th><th class="px-4 py-2.5">Projets</th>
          <th class="text-left px-4 py-2.5 hidden sm:table-cell">Inscrit</th>
          <th class="px-4 py-2.5">Rôle</th><th class="px-4 py-2.5"></th></tr>
        </thead>
        <tbody>${data.map((u) => userRow(u, me.id)).join("")}</tbody>
      </table>
    </div>`;

  box.querySelectorAll("[data-admin]").forEach((b) => (b.onclick = async () => {
    const value = b.dataset.val === "true";
    const { error } = await supabase.rpc("admin_set_admin", { p_id: b.dataset.admin, p_value: value });
    if (error) return toast(error.message, "error");
    toast(value ? "Promu admin" : "Admin retiré", "success");
    loadUsers();
  }));
  box.querySelectorAll("[data-deluser]").forEach((b) => (b.onclick = async () => {
    if (!(await confirmDialog({ title: "Supprimer l'utilisateur", message: `${b.dataset.email} et TOUTES ses données seront supprimés. Irréversible.`, confirmLabel: "Supprimer", danger: true, icon: "trash" }))) return;
    const { error } = await supabase.rpc("admin_delete_user", { p_id: b.dataset.deluser });
    if (error) return toast(error.message, "error");
    toast("Utilisateur supprimé", "info");
    loadUsers(); loadStats(); loadProjects();
  }));
}

function userRow(u, myId) {
  const isMe = u.id === myId;
  return `<tr class="border-t border-slate-100 dark:border-slate-800">
    <td class="px-4 py-2.5 text-slate-700 dark:text-slate-200">${esc(u.email)} ${isMe ? '<span class="text-xs text-brand-500">(vous)</span>' : ""}</td>
    <td class="px-4 py-2.5 text-center tabular-nums text-slate-600 dark:text-slate-300">${u.project_count}</td>
    <td class="px-4 py-2.5 text-slate-500 dark:text-slate-400 hidden sm:table-cell">${fmtDate(u.created_at)}</td>
    <td class="px-4 py-2.5 text-center">
      ${u.is_admin ? '<span class="px-2 py-0.5 rounded-full bg-brand-100 dark:bg-brand-950/60 text-brand-700 dark:text-brand-300 text-xs font-medium">Admin</span>' : '<span class="text-slate-400 dark:text-slate-600 text-xs">Membre</span>'}
    </td>
    <td class="px-4 py-2.5 text-right whitespace-nowrap">
      ${isMe ? "" : `
        <button data-admin="${u.id}" data-val="${(!u.is_admin)}" class="text-xs px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 mr-1 transition">${u.is_admin ? "Retirer admin" : "Promouvoir"}</button>
        <button data-deluser="${u.id}" data-email="${esc(u.email)}" class="text-xs px-2.5 py-1.5 rounded-lg bg-rose-50 dark:bg-rose-950/50 hover:bg-rose-100 text-rose-600 dark:text-rose-400 transition">Suppr.</button>`}
    </td></tr>`;
}

// --------------------------------------------------------------- PROJECTS
async function loadProjects() {
  const box = document.getElementById("projectsSection");
  const { data, error } = await supabase.rpc("admin_list_projects");
  if (error) { box.innerHTML = err(error); return; }

  box.innerHTML = `
    ${sectionTitle("Tous les projets", "target")}
    <div class="${panel} divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden">
      ${data.length ? data.map(projectRow).join("") :
        `<div class="px-4 py-8 text-center text-slate-400">Aucun projet</div>`}
    </div>`;

  box.querySelectorAll("[data-open]").forEach((b) => (b.onclick = () => navigate("/editor/" + b.dataset.open)));
  box.querySelectorAll("[data-delproj]").forEach((b) => (b.onclick = async () => {
    if (!(await confirmDialog({ title: "Supprimer le projet", message: "Ce projet et toutes ses cartes seront supprimés.", confirmLabel: "Supprimer", danger: true, icon: "trash" }))) return;
    const { error } = await supabase.rpc("admin_delete_project", { p_id: b.dataset.delproj });
    if (error) return toast(error.message, "error");
    toast("Projet supprimé", "info");
    loadProjects(); loadStats();
  }));
  box.querySelectorAll("[data-cards]").forEach((b) => (b.onclick = () => toggleCards(b)));
}

function projectRow(p) {
  return `<div>
    <div class="px-4 py-3 flex items-center gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition">
      <div class="flex-1 min-w-0">
        <div class="font-semibold text-slate-800 dark:text-slate-100 truncate">${esc(p.name)}</div>
        <div class="text-xs text-slate-400 dark:text-slate-500">${esc(p.owner_email || "?")} · ${p.node_count} carte(s) · maj ${fmtDate(p.updated_at)}</div>
      </div>
      <button data-cards="${p.id}" class="text-xs px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition">Cartes</button>
      <button data-open="${p.id}" class="text-xs px-2.5 py-1.5 rounded-lg bg-brand-50 dark:bg-brand-950/60 hover:bg-brand-100 text-brand-700 dark:text-brand-300 transition">Ouvrir</button>
      <button data-delproj="${p.id}" class="text-xs px-2.5 py-1.5 rounded-lg bg-rose-50 dark:bg-rose-950/50 hover:bg-rose-100 text-rose-600 dark:text-rose-400 transition">Suppr.</button>
    </div>
    <div id="cards-${p.id}" class="hidden px-4 pb-3"></div>
  </div>`;
}

async function toggleCards(btn) {
  const id = btn.dataset.cards;
  const panelEl = document.getElementById("cards-" + id);
  if (!panelEl.classList.contains("hidden")) { panelEl.classList.add("hidden"); return; }
  panelEl.classList.remove("hidden");
  panelEl.innerHTML = `<p class="text-xs text-slate-400 py-2">Chargement…</p>`;
  const { data, error } = await supabase.rpc("admin_list_nodes", { p_project: id });
  if (error) { panelEl.innerHTML = err(error); return; }
  if (!data.length) { panelEl.innerHTML = `<p class="text-xs text-slate-400 py-2">Aucune carte.</p>`; return; }

  panelEl.innerHTML = `<div class="rounded-xl border border-slate-100 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden">
    ${data.map((n) => `
      <div class="flex items-center gap-2 px-3 py-1.5 text-sm bg-slate-50/60 dark:bg-slate-800/30">
        <span class="flex-1 truncate text-slate-600 dark:text-slate-300">${esc(n.text) || '<span class="text-slate-300">(vide)</span>'}
          ${n.parent_id ? "" : '<span class="text-[10px] text-brand-500 ml-1 font-semibold">racine</span>'}</span>
        <button data-delnode="${n.id}" class="text-xs px-2 py-0.5 rounded-lg bg-rose-50 dark:bg-rose-950/50 hover:bg-rose-100 text-rose-600 dark:text-rose-400 transition">Suppr.</button>
      </div>`).join("")}
  </div>`;

  panelEl.querySelectorAll("[data-delnode]").forEach((b) => (b.onclick = async () => {
    if (!(await confirmDialog({ title: "Supprimer la carte", message: "Cette carte et ses descendants seront supprimés.", confirmLabel: "Supprimer", danger: true, icon: "trash" }))) return;
    const { error } = await supabase.rpc("admin_delete_node", { p_id: b.dataset.delnode });
    if (error) return toast(error.message, "error");
    toast("Carte supprimée", "info");
    b.closest("div.flex")?.remove();
    loadStats();
  }));
}

const err = (e) => `<div class="bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-400 text-sm rounded-xl p-3">${esc(e.message || e)}</div>`;
