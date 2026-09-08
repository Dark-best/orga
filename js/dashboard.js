import { supabase } from "./supabase.js";
import { app, esc, toast, icon, askText, confirmDialog, themeToggleButton, wireThemeToggle } from "./ui.js";
import { navigate } from "./router.js";
import { currentUser, logout } from "./auth.js";
import { amIAdmin } from "./admin.js";

// Palette d'accents déterministe par projet (pour la vignette).
const ACCENTS = [
  ["from-brand-500 to-brand-700", "text-brand-600"],
  ["from-sky-500 to-indigo-600", "text-sky-600"],
  ["from-emerald-500 to-teal-600", "text-emerald-600"],
  ["from-amber-500 to-orange-600", "text-amber-600"],
  ["from-pink-500 to-rose-600", "text-pink-600"],
  ["from-violet-500 to-fuchsia-600", "text-violet-600"],
];
function accentFor(id) {
  let h = 0;
  for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return ACCENTS[h % ACCENTS.length];
}

function topbar(email, isAdmin) {
  return `
  <header class="sticky top-0 z-20 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-b border-slate-200/70 dark:border-slate-800">
    <div class="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
      <a href="#/" class="flex items-center gap-2.5 font-bold text-slate-900 dark:text-white">
        <span class="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white flex items-center justify-center shadow-soft">${icon("brand", "w-5 h-5")}</span>
        <span class="text-lg tracking-tight">MindFlow</span>
      </a>
      <div class="flex items-center gap-2">
        ${isAdmin ? `<a href="#/admin" class="hidden sm:flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-xl bg-brand-50 dark:bg-brand-950/60 text-brand-700 dark:text-brand-300 font-semibold hover:bg-brand-100 dark:hover:bg-brand-900 transition">${icon("shield", "w-4 h-4")} Admin</a>` : ""}
        ${themeToggleButton()}
        <div class="hidden sm:flex items-center gap-2 pl-2 ml-1 border-l border-slate-200 dark:border-slate-700">
          <span class="w-8 h-8 rounded-full bg-gradient-to-br from-brand-400 to-brand-600 text-white text-xs font-bold flex items-center justify-center">${esc((email || "?")[0].toUpperCase())}</span>
          <span class="text-sm text-slate-500 dark:text-slate-400 max-w-[12rem] truncate">${esc(email)}</span>
        </div>
        <button id="logoutBtn" title="Déconnexion" class="p-2 rounded-xl text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition">${icon("logout")}</button>
      </div>
    </div>
  </header>`;
}

function skeletonGrid() {
  return Array.from({ length: 6 }).map(() => `
    <div class="bg-white dark:bg-slate-900 rounded-3xl ring-1 ring-slate-200/70 dark:ring-slate-800 p-5">
      <div class="mf-skeleton w-full h-28 rounded-2xl mb-4"></div>
      <div class="mf-skeleton h-4 w-2/3 rounded mb-2"></div>
      <div class="mf-skeleton h-3 w-1/3 rounded"></div>
    </div>`).join("");
}

export async function renderDashboard() {
  const user = await currentUser();
  if (!user) return navigate("/login");
  const isAdmin = await amIAdmin();

  app().innerHTML = `
    <div class="mf-aurora min-h-screen">
      ${topbar(user.email, isAdmin)}
      <main class="max-w-6xl mx-auto px-4 py-8">
        <div class="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-7">
          <div>
            <h1 class="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">Mes projets</h1>
            <p class="text-slate-500 dark:text-slate-400 mt-1">Créez, organisez et explorez vos cartes mentales.</p>
          </div>
          <div class="flex items-center gap-2">
            <div class="relative">
              <span class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">${icon("search", "w-4 h-4")}</span>
              <input id="search" placeholder="Rechercher…" class="w-44 sm:w-56 pl-9 pr-3 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400 transition"/>
            </div>
            <button id="newProject" class="shrink-0 px-4 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 active:scale-[.98] text-white font-semibold shadow-soft flex items-center gap-2 transition">
              ${icon("plus", "w-5 h-5")}<span class="hidden sm:inline">Nouveau projet</span>
            </button>
          </div>
        </div>
        <div id="grid" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          ${skeletonGrid()}
        </div>
      </main>
    </div>`;

  wireThemeToggle();
  document.getElementById("logoutBtn").onclick = logout;
  document.getElementById("newProject").onclick = () => createProject();
  document.getElementById("search").oninput = (e) => filterProjects(e.target.value);

  await loadProjects();
}

let ALL_PROJECTS = [];

async function loadProjects() {
  const grid = document.getElementById("grid");
  const { data: projects, error } = await supabase
    .from("projects")
    .select("id, name, updated_at")
    .order("updated_at", { ascending: false });

  if (error) { grid.innerHTML = `<p class="col-span-full text-rose-600">${esc(error.message)}</p>`; return; }
  ALL_PROJECTS = projects || [];
  renderGrid(ALL_PROJECTS);
}

function emptyState(searching) {
  return `
    <div class="col-span-full text-center py-20 rounded-3xl border-2 border-dashed border-slate-200 dark:border-slate-800">
      <div class="text-6xl mb-4">${searching ? "🔍" : "🧠"}</div>
      <p class="text-slate-700 dark:text-slate-200 font-semibold text-lg">${searching ? "Aucun résultat" : "Aucun projet pour l'instant"}</p>
      <p class="text-slate-400 dark:text-slate-500 text-sm mt-1">${searching ? "Essayez un autre terme de recherche." : "Cliquez sur « Nouveau projet » pour commencer votre première carte."}</p>
    </div>`;
}

function renderGrid(projects) {
  const grid = document.getElementById("grid");
  if (!projects.length) { grid.innerHTML = emptyState(ALL_PROJECTS.length > 0); return; }

  grid.innerHTML = projects.map((p, i) => {
    const [grad, txt] = accentFor(p.id);
    return `
    <div class="group bg-white dark:bg-slate-900 rounded-3xl ring-1 ring-slate-200/70 dark:ring-slate-800 hover:ring-brand-300 dark:hover:ring-brand-700 hover:shadow-lift transition-all duration-200 p-5 flex flex-col animate-slide-up" style="animation-delay:${Math.min(i, 8) * 30}ms">
      <div class="flex-1 cursor-pointer" data-open="${p.id}">
        <div class="relative w-full h-28 rounded-2xl bg-gradient-to-br ${grad} mb-4 overflow-hidden flex items-center justify-center">
          <div class="absolute inset-0 opacity-20" style="background-image:radial-gradient(#fff 1px,transparent 1px);background-size:14px 14px;"></div>
          <svg class="w-12 h-12 text-white/90 relative" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="6" cy="12" r="2.4"/><circle cx="18" cy="6" r="2.4"/><circle cx="18" cy="18" r="2.4"/><path d="M8.4 11 15.6 7M8.4 13 15.6 17"/>
          </svg>
        </div>
        <h3 class="font-bold text-slate-900 dark:text-white truncate">${esc(p.name)}</h3>
        <p class="text-xs text-slate-400 dark:text-slate-500 mt-1">Modifié ${relTime(p.updated_at)}</p>
      </div>
      <div class="flex gap-2 mt-4 pt-4 border-t border-slate-100 dark:border-slate-800">
        <button data-open="${p.id}" class="flex-1 text-xs font-semibold px-3 py-2 rounded-xl bg-brand-50 dark:bg-brand-950/60 ${txt} dark:text-brand-300 hover:bg-brand-100 dark:hover:bg-brand-900 transition">Ouvrir</button>
        <button data-rename="${p.id}" data-name="${esc(p.name)}" title="Renommer" class="px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition">${icon("edit", "w-4 h-4")}</button>
        <button data-delete="${p.id}" data-name="${esc(p.name)}" title="Supprimer" class="px-3 py-2 rounded-xl bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-900/50 transition">${icon("trash", "w-4 h-4")}</button>
      </div>
    </div>`;
  }).join("");

  grid.querySelectorAll("[data-open]").forEach((el) =>
    (el.onclick = () => navigate("/editor/" + el.dataset.open)));
  grid.querySelectorAll("[data-rename]").forEach((el) =>
    (el.onclick = (e) => { e.stopPropagation(); renameProject(el.dataset.rename, el.dataset.name); }));
  grid.querySelectorAll("[data-delete]").forEach((el) =>
    (el.onclick = (e) => { e.stopPropagation(); deleteProject(el.dataset.delete, el.dataset.name); }));
}

function filterProjects(q) {
  const term = q.trim().toLowerCase();
  renderGrid(term ? ALL_PROJECTS.filter((p) => (p.name || "").toLowerCase().includes(term)) : ALL_PROJECTS);
}

// Date relative en français (léger, sans dépendance).
function relTime(iso) {
  const d = new Date(iso), now = new Date();
  const s = Math.floor((now - d) / 1000);
  if (s < 60) return "à l'instant";
  if (s < 3600) return `il y a ${Math.floor(s / 60)} min`;
  if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`;
  if (s < 604800) return `il y a ${Math.floor(s / 86400)} j`;
  return "le " + d.toLocaleDateString("fr-FR");
}

async function createProject() {
  const name = await askText({
    title: "Nouveau projet", label: "Nom du projet",
    value: "Nouveau projet", placeholder: "Ex. Stratégie 2026", confirmLabel: "Créer", icon: "plus",
  });
  if (name === null) return;
  const user = await currentUser();
  const { data, error } = await supabase
    .from("projects")
    .insert({ name: name.trim() || "Nouveau projet", user_id: user.id })
    .select("id").single();
  if (error) return toast(error.message, "error");

  await supabase.from("nodes").insert({
    project_id: data.id, parent_id: null, text: "Idée centrale", x: 480, y: 260,
  });
  navigate("/editor/" + data.id);
}

async function renameProject(id, current) {
  const name = await askText({
    title: "Renommer le projet", label: "Nouveau nom", value: current, confirmLabel: "Renommer",
  });
  if (name === null || !name.trim()) return;
  const { error } = await supabase.from("projects").update({ name: name.trim() }).eq("id", id);
  if (error) return toast(error.message, "error");
  toast("Projet renommé", "success");
  loadProjects();
}

async function deleteProject(id, name) {
  const ok = await confirmDialog({
    title: "Supprimer le projet",
    message: `« ${name} » et toutes ses cartes seront définitivement supprimés. Cette action est irréversible.`,
    confirmLabel: "Supprimer", danger: true, icon: "trash",
  });
  if (!ok) return;
  const { error } = await supabase.from("projects").delete().eq("id", id);
  if (error) return toast(error.message, "error");
  toast("Projet supprimé", "info");
  loadProjects();
}
