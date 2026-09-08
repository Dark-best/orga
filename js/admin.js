import { supabase, config } from "./supabase.js";
import { app, esc, toast } from "./ui.js";
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
  <header class="sticky top-0 z-20 bg-slate-900 text-white border-b border-slate-700">
    <div class="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
      <div class="flex items-center gap-2 font-bold">
        <span class="px-2 py-0.5 rounded bg-indigo-600 text-xs">ADMIN</span> MindFlow
      </div>
      <div class="flex items-center gap-3 text-sm">
        <a href="#/" class="px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600">← Mes projets</a>
        <span class="text-slate-400 hidden sm:inline">${esc(email)}</span>
        <button id="logoutBtn" class="px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600">Déconnexion</button>
      </div>
    </div>
  </header>`;
}

export async function renderAdmin() {
  const user = await currentUser();
  if (!user) return navigate("/login");
  if (!(await amIAdmin())) {
    app().innerHTML = `<div class="min-h-screen flex items-center justify-center text-center p-6">
      <div><div class="text-5xl mb-3">⛔</div>
      <h1 class="text-xl font-bold text-slate-800">Accès refusé</h1>
      <p class="text-slate-500 text-sm mt-1">Cette zone est réservée à l'administrateur.</p>
      <a href="#/" class="inline-block mt-4 text-indigo-600 hover:underline">Retour</a></div></div>`;
    return;
  }

  app().innerHTML = `
    ${topbar(user.email)}
    <main class="max-w-6xl mx-auto px-4 py-6 space-y-8">
      <section id="statsSection"></section>
      <section id="invitesSection"></section>
      <section id="usersSection"></section>
      <section id="projectsSection"></section>
    </main>`;

  document.getElementById("logoutBtn").onclick = logout;

  await Promise.all([loadStats(), loadInvites(), loadUsers(), loadProjects()]);
}

// ---------------------------------------------------------------- STATS
async function loadStats() {
  const box = document.getElementById("statsSection");
  const { data: s, error } = await supabase.rpc("admin_stats");
  if (error) { box.innerHTML = err(error); return; }

  const quotaBytes = (config.DB_QUOTA_MB || 500) * 1024 * 1024;
  const used = Number(s.db_bytes) || 0;
  const pct = Math.min(100, (used / quotaBytes) * 100);
  const barColor = pct > 85 ? "bg-rose-500" : pct > 60 ? "bg-amber-500" : "bg-emerald-500";

  const card = (label, value, sub = "") => `
    <div class="bg-white rounded-xl border border-slate-200 p-4">
      <div class="text-2xl font-bold text-slate-800 tabular-nums">${value}</div>
      <div class="text-xs text-slate-500 mt-0.5">${label}</div>
      ${sub ? `<div class="text-[11px] text-slate-400 mt-0.5">${sub}</div>` : ""}
    </div>`;

  box.innerHTML = `
    <h2 class="text-lg font-bold text-slate-800 mb-3">Vue d'ensemble</h2>
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
      ${card("Utilisateurs", s.users)}
      ${card("Projets", s.projects)}
      ${card("Cartes (nœuds)", s.nodes)}
      ${card("Invitations", s.invites_total, `${s.invites_used} utilisées · ${s.invites_free} libres`)}
    </div>
    <div class="bg-white rounded-xl border border-slate-200 p-4">
      <div class="flex justify-between text-sm mb-1">
        <span class="font-medium text-slate-700">Usage base de données</span>
        <span class="text-slate-500 tabular-nums">${fmtBytes(used)} / ${config.DB_QUOTA_MB} Mo</span>
      </div>
      <div class="w-full h-3 rounded-full bg-slate-100 overflow-hidden">
        <div class="h-full ${barColor} transition-all" style="width:${pct.toFixed(1)}%"></div>
      </div>
      <div class="flex justify-between text-xs text-slate-400 mt-1">
        <span>Restant : ${fmtBytes(Math.max(0, quotaBytes - used))}</span>
        <span>nodes ${fmtBytes(s.nodes_bytes)} · projects ${fmtBytes(s.projects_bytes)}</span>
      </div>
    </div>`;
}

// -------------------------------------------------------------- INVITATIONS
function inviteLink(token) {
  const base = location.origin + (config.BASE_PATH || "") + "/invite/" + token;
  return base;
}

async function loadInvites() {
  const box = document.getElementById("invitesSection");
  const { data, error } = await supabase.rpc("admin_list_invitations");
  if (error) { box.innerHTML = err(error); return; }

  box.innerHTML = `
    <div class="flex items-center justify-between mb-3">
      <h2 class="text-lg font-bold text-slate-800">Invitations</h2>
      <div class="flex gap-2">
        <input id="inviteToken" placeholder="jeton (optionnel)" class="px-3 py-1.5 text-sm rounded-lg border border-slate-300 outline-none focus:ring-2 focus:ring-indigo-200"/>
        <button id="genInvite" class="px-3 py-1.5 text-sm rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium">Créer</button>
      </div>
    </div>
    <div class="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <table class="w-full text-sm">
        <thead class="bg-slate-50 text-slate-500 text-xs uppercase">
          <tr><th class="text-left px-4 py-2">Jeton</th><th class="text-left px-4 py-2">Statut</th>
          <th class="text-left px-4 py-2 hidden sm:table-cell">Utilisé par</th><th class="px-4 py-2"></th></tr>
        </thead>
        <tbody>
          ${data.length ? data.map(inviteRow).join("") :
            `<tr><td colspan="4" class="px-4 py-6 text-center text-slate-400">Aucune invitation</td></tr>`}
        </tbody>
      </table>
    </div>`;

  document.getElementById("genInvite").onclick = async () => {
    const t = document.getElementById("inviteToken").value.trim();
    const { data: token, error } = await supabase.rpc("admin_create_invite", { p_token: t || null });
    if (error) return toast(error.message, "error");
    toast("Invitation créée : " + token, "success");
    loadInvites(); loadStats();
  };

  box.querySelectorAll("[data-copy]").forEach((b) => (b.onclick = () => {
    navigator.clipboard?.writeText(inviteLink(b.dataset.copy));
    toast("Lien copié", "success");
  }));
  box.querySelectorAll("[data-delinv]").forEach((b) => (b.onclick = async () => {
    if (!confirm("Supprimer cette invitation ?")) return;
    const { error } = await supabase.rpc("admin_delete_invite", { p_id: b.dataset.delinv });
    if (error) return toast(error.message, "error");
    loadInvites(); loadStats();
  }));
}

function inviteRow(i) {
  return `<tr class="border-t border-slate-100">
    <td class="px-4 py-2 font-mono text-slate-700">${esc(i.token)}</td>
    <td class="px-4 py-2">${i.used
      ? `<span class="px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 text-xs">Utilisée</span>`
      : `<span class="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-xs">Libre</span>`}</td>
    <td class="px-4 py-2 text-slate-500 hidden sm:table-cell">${i.used_by_email ? esc(i.used_by_email) : "—"}</td>
    <td class="px-4 py-2 text-right whitespace-nowrap">
      ${i.used
        ? `<span class="text-xs text-slate-400" title="Une invitation utilisée est définitive et non réutilisable">🔒 définitive</span>`
        : `<button data-copy="${esc(i.token)}" class="text-xs px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-600 mr-1">Copier le lien</button>
           <button data-delinv="${i.id}" class="text-xs px-2 py-1 rounded bg-rose-50 hover:bg-rose-100 text-rose-600">Suppr.</button>`}
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
    <h2 class="text-lg font-bold text-slate-800 mb-3">Utilisateurs</h2>
    <div class="bg-white rounded-xl border border-slate-200 overflow-x-auto">
      <table class="w-full text-sm min-w-[560px]">
        <thead class="bg-slate-50 text-slate-500 text-xs uppercase">
          <tr><th class="text-left px-4 py-2">Email</th><th class="px-4 py-2">Projets</th>
          <th class="text-left px-4 py-2 hidden sm:table-cell">Inscrit</th>
          <th class="px-4 py-2">Admin</th><th class="px-4 py-2"></th></tr>
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
    if (!confirm(`Supprimer ${b.dataset.email} et TOUTES ses données ? Irréversible.`)) return;
    const { error } = await supabase.rpc("admin_delete_user", { p_id: b.dataset.deluser });
    if (error) return toast(error.message, "error");
    toast("Utilisateur supprimé", "info");
    loadUsers(); loadStats(); loadProjects();
  }));
}

function userRow(u, myId) {
  const isMe = u.id === myId;
  return `<tr class="border-t border-slate-100">
    <td class="px-4 py-2 text-slate-700">${esc(u.email)} ${isMe ? '<span class="text-xs text-indigo-500">(vous)</span>' : ""}</td>
    <td class="px-4 py-2 text-center tabular-nums">${u.project_count}</td>
    <td class="px-4 py-2 text-slate-500 hidden sm:table-cell">${fmtDate(u.created_at)}</td>
    <td class="px-4 py-2 text-center">
      ${u.is_admin ? '<span class="px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 text-xs">Admin</span>' : '<span class="text-slate-300">—</span>'}
    </td>
    <td class="px-4 py-2 text-right whitespace-nowrap">
      ${isMe ? "" : `
        <button data-admin="${u.id}" data-val="${(!u.is_admin)}" class="text-xs px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-600 mr-1">${u.is_admin ? "Retirer admin" : "Promouvoir"}</button>
        <button data-deluser="${u.id}" data-email="${esc(u.email)}" class="text-xs px-2 py-1 rounded bg-rose-50 hover:bg-rose-100 text-rose-600">Suppr.</button>`}
    </td></tr>`;
}

// --------------------------------------------------------------- PROJECTS
async function loadProjects() {
  const box = document.getElementById("projectsSection");
  const { data, error } = await supabase.rpc("admin_list_projects");
  if (error) { box.innerHTML = err(error); return; }

  box.innerHTML = `
    <h2 class="text-lg font-bold text-slate-800 mb-3">Tous les projets</h2>
    <div class="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
      ${data.length ? data.map(projectRow).join("") :
        `<div class="px-4 py-6 text-center text-slate-400">Aucun projet</div>`}
    </div>`;

  box.querySelectorAll("[data-open]").forEach((b) => (b.onclick = () => navigate("/editor/" + b.dataset.open)));
  box.querySelectorAll("[data-delproj]").forEach((b) => (b.onclick = async () => {
    if (!confirm("Supprimer ce projet et toutes ses cartes ?")) return;
    const { error } = await supabase.rpc("admin_delete_project", { p_id: b.dataset.delproj });
    if (error) return toast(error.message, "error");
    toast("Projet supprimé", "info");
    loadProjects(); loadStats();
  }));
  box.querySelectorAll("[data-cards]").forEach((b) => (b.onclick = () => toggleCards(b)));
}

function projectRow(p) {
  return `<div>
    <div class="px-4 py-3 flex items-center gap-3">
      <div class="flex-1 min-w-0">
        <div class="font-medium text-slate-800 truncate">${esc(p.name)}</div>
        <div class="text-xs text-slate-400">${esc(p.owner_email || "?")} · ${p.node_count} carte(s) · maj ${fmtDate(p.updated_at)}</div>
      </div>
      <button data-cards="${p.id}" class="text-xs px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-600">Cartes</button>
      <button data-open="${p.id}" class="text-xs px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-600">Ouvrir</button>
      <button data-delproj="${p.id}" class="text-xs px-2 py-1 rounded bg-rose-50 hover:bg-rose-100 text-rose-600">Suppr.</button>
    </div>
    <div id="cards-${p.id}" class="hidden px-4 pb-3"></div>
  </div>`;
}

async function toggleCards(btn) {
  const id = btn.dataset.cards;
  const panel = document.getElementById("cards-" + id);
  if (!panel.classList.contains("hidden")) { panel.classList.add("hidden"); return; }
  panel.classList.remove("hidden");
  panel.innerHTML = `<p class="text-xs text-slate-400 py-2">Chargement…</p>`;
  const { data, error } = await supabase.rpc("admin_list_nodes", { p_project: id });
  if (error) { panel.innerHTML = err(error); return; }
  if (!data.length) { panel.innerHTML = `<p class="text-xs text-slate-400 py-2">Aucune carte.</p>`; return; }

  panel.innerHTML = `<div class="rounded-lg border border-slate-100 divide-y divide-slate-100">
    ${data.map((n) => `
      <div class="flex items-center gap-2 px-3 py-1.5 text-sm">
        <span class="flex-1 truncate text-slate-600">${esc(n.text) || '<span class="text-slate-300">(vide)</span>'}
          ${n.parent_id ? "" : '<span class="text-[10px] text-indigo-500 ml-1">racine</span>'}</span>
        <button data-delnode="${n.id}" class="text-xs px-2 py-0.5 rounded bg-rose-50 hover:bg-rose-100 text-rose-600">Suppr.</button>
      </div>`).join("")}
  </div>`;

  panel.querySelectorAll("[data-delnode]").forEach((b) => (b.onclick = async () => {
    if (!confirm("Supprimer cette carte (et ses descendants) ?")) return;
    const { error } = await supabase.rpc("admin_delete_node", { p_id: b.dataset.delnode });
    if (error) return toast(error.message, "error");
    toast("Carte supprimée", "info");
    b.closest("div.flex")?.remove();   // retire la ligne
    loadStats();
  }));
}

const err = (e) => `<div class="bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-lg p-3">${esc(e.message || e)}</div>`;
