import { supabase } from "./supabase.js";
import { app, esc, toast } from "./ui.js";
import { navigate } from "./router.js";
import { currentUser, logout } from "./auth.js";
import { amIAdmin } from "./admin.js";

function topbar(email, isAdmin) {
  return `
  <header class="sticky top-0 z-20 bg-white/90 backdrop-blur border-b border-slate-200">
    <div class="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
      <a href="#/" class="flex items-center gap-2 font-bold text-slate-800">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-indigo-600">
          <circle cx="6" cy="12" r="3"/><circle cx="18" cy="6" r="3"/><circle cx="18" cy="18" r="3"/>
          <path d="M8.7 10.7 15.3 7.3M8.7 13.3 15.3 16.7"/>
        </svg> MindFlow
      </a>
      <div class="flex items-center gap-3">
        ${isAdmin ? `<a href="#/admin" class="text-sm px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium">Admin</a>` : ""}
        <span class="text-sm text-slate-500 hidden sm:inline">${esc(email)}</span>
        <button id="logoutBtn" class="text-sm px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700">Déconnexion</button>
      </div>
    </div>
  </header>`;
}

export async function renderDashboard() {
  const user = await currentUser();
  if (!user) return navigate("/login");
  const isAdmin = await amIAdmin();

  app().innerHTML = `
    ${topbar(user.email, isAdmin)}
    <main class="max-w-6xl mx-auto px-4 py-8">
      <div class="flex items-center justify-between mb-6">
        <div>
          <h1 class="text-2xl font-bold text-slate-800">Mes projets</h1>
          <p class="text-slate-500 text-sm">Gérez vos cartes mentales</p>
        </div>
        <button id="newProject" class="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-semibold flex items-center gap-2">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
          Nouveau projet
        </button>
      </div>
      <div id="grid" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div class="col-span-full text-center text-slate-400 py-10">Chargement…</div>
      </div>
    </main>`;

  document.getElementById("logoutBtn").onclick = logout;
  document.getElementById("newProject").onclick = () => createProject();

  await loadProjects();
}

async function loadProjects() {
  const grid = document.getElementById("grid");
  const { data: projects, error } = await supabase
    .from("projects")
    .select("id, name, updated_at")
    .order("updated_at", { ascending: false });

  if (error) { grid.innerHTML = `<p class="col-span-full text-rose-600">${esc(error.message)}</p>`; return; }

  if (!projects.length) {
    grid.innerHTML = `
      <div class="col-span-full text-center py-16 border-2 border-dashed border-slate-200 rounded-2xl">
        <div class="text-5xl mb-3">🧠</div>
        <p class="text-slate-600 font-medium">Aucun projet pour l'instant</p>
        <p class="text-slate-400 text-sm">Cliquez sur « Nouveau projet » pour commencer.</p>
      </div>`;
    return;
  }

  grid.innerHTML = projects.map((p) => `
    <div class="group bg-white rounded-2xl border border-slate-200 hover:border-indigo-300 hover:shadow-lg transition p-5 flex flex-col">
      <div class="flex-1 cursor-pointer" data-open="${p.id}">
        <div class="w-full h-24 rounded-xl bg-gradient-to-br from-indigo-50 to-slate-100 mb-3 flex items-center justify-center">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="text-indigo-300">
            <circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/>
            <path d="M8.5 11 15.5 7M8.5 13 15.5 17"/>
          </svg>
        </div>
        <h3 class="font-semibold text-slate-800 truncate">${esc(p.name)}</h3>
        <p class="text-xs text-slate-400 mt-0.5">Modifié le ${new Date(p.updated_at).toLocaleDateString("fr-FR")}</p>
      </div>
      <div class="flex gap-2 mt-4 pt-3 border-t border-slate-100">
        <button data-rename="${p.id}" data-name="${esc(p.name)}" class="text-xs px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600">Renommer</button>
        <button data-delete="${p.id}" class="text-xs px-2.5 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600">Supprimer</button>
      </div>
    </div>`).join("");

  grid.querySelectorAll("[data-open]").forEach((el) =>
    (el.onclick = () => navigate("/editor/" + el.dataset.open)));
  grid.querySelectorAll("[data-rename]").forEach((el) =>
    (el.onclick = () => renameProject(el.dataset.rename, el.dataset.name)));
  grid.querySelectorAll("[data-delete]").forEach((el) =>
    (el.onclick = () => deleteProject(el.dataset.delete)));
}

async function createProject() {
  const name = prompt("Nom du projet :", "Nouveau projet");
  if (name === null) return;
  const user = await currentUser();
  const { data, error } = await supabase
    .from("projects")
    .insert({ name: name.trim() || "Nouveau projet", user_id: user.id })
    .select("id").single();
  if (error) return toast(error.message, "error");

  // Nœud racine par défaut, centré
  await supabase.from("nodes").insert({
    project_id: data.id, parent_id: null, text: "Idée centrale", x: 480, y: 260,
  });
  navigate("/editor/" + data.id);
}

async function renameProject(id, current) {
  const name = prompt("Nouveau nom :", current);
  if (name === null || !name.trim()) return;
  const { error } = await supabase.from("projects").update({ name: name.trim() }).eq("id", id);
  if (error) return toast(error.message, "error");
  toast("Renommé", "success");
  loadProjects();
}

async function deleteProject(id) {
  if (!confirm("Supprimer ce projet et tous ses nœuds ? Cette action est irréversible.")) return;
  const { error } = await supabase.from("projects").delete().eq("id", id);
  if (error) return toast(error.message, "error");
  toast("Projet supprimé", "info");
  loadProjects();
}
