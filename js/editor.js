import { supabase } from "./supabase.js";
import { app, esc, toast, debounce, icon, confirmDialog, themeToggleButton, wireThemeToggle } from "./ui.js";
import { navigate } from "./router.js";
import { currentUser } from "./auth.js";

const PALETTE = ["#7c3aed", "#0ea5e9", "#10b981", "#f59e0b", "#ec4899", "#8b5cf6", "#ef4444", "#14b8a6"];

// Colonnes réellement utilisées — évite de rapatrier created_at/updated_at inutiles (optimisation DB).
const NODE_COLS = "id, project_id, parent_id, text, x, y, color";

export async function renderEditor({ id }) {
  const user = await currentUser();
  if (!user) return navigate("/login");

  const { data: project, error: pErr } = await supabase
    .from("projects").select("id, name").eq("id", id).single();
  if (pErr || !project) { toast("Projet introuvable", "error"); return navigate("/"); }

  app().innerHTML = `
  <div class="h-screen flex flex-col overflow-hidden bg-slate-100 dark:bg-slate-950">
    <header class="shrink-0 bg-white/85 dark:bg-slate-900/85 backdrop-blur-xl border-b border-slate-200/70 dark:border-slate-800 h-14 flex items-center px-3 gap-2">
      <button id="backBtn" class="p-2 rounded-xl text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition" title="Retour">${icon("back")}</button>
      <div class="w-px h-6 bg-slate-200 dark:bg-slate-700 mx-1"></div>
      <input id="projName"
        class="font-semibold text-slate-900 dark:text-white bg-transparent px-2.5 py-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 focus:bg-slate-100 dark:focus:bg-slate-800 outline-none focus:ring-2 focus:ring-brand-400 min-w-0 flex-1 sm:flex-none sm:w-72"
        value="${esc(project.name)}"/>
      <span id="saveState" class="text-xs text-slate-400 dark:text-slate-500 ml-1 flex items-center gap-1.5 whitespace-nowrap">
        <span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> Enregistré
      </span>
      <div class="ml-auto flex items-center gap-1.5">
        <button id="addRoot" class="text-sm px-3 py-1.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-semibold shadow-soft hidden sm:flex items-center gap-1.5 transition">${icon("plus", "w-4 h-4")} Nœud</button>
        ${themeToggleButton()}
      </div>
    </header>

    <div id="canvas" class="relative flex-1 overflow-hidden cursor-grab select-none"
         style="background-image:radial-gradient(var(--dot,#cbd5e1) 1px,transparent 1px);background-size:26px 26px;">
      <div id="viewport" style="position:absolute;top:0;left:0;transform-origin:0 0;will-change:transform;">
        <svg id="links" style="position:absolute;top:0;left:0;overflow:visible;pointer-events:none;" width="1" height="1"></svg>
        <div id="nodesLayer" style="position:absolute;top:0;left:0;"></div>
      </div>

      <!-- Barre d'outils flottante -->
      <div class="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl ring-1 ring-slate-200/70 dark:ring-slate-800 shadow-lift rounded-2xl px-1.5 py-1.5">
        <button id="zoomOut" class="p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition" title="Dézoomer">${icon("minus", "w-4 h-4")}</button>
        <button id="zoomReset" class="text-xs font-semibold px-2.5 py-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 tabular-nums transition" title="Ajuster à l'écran">100%</button>
        <button id="zoomIn" class="p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition" title="Zoomer">${icon("plus", "w-4 h-4")}</button>
        <div class="w-px h-5 bg-slate-200 dark:bg-slate-700 mx-0.5"></div>
        <button id="fitBtn" class="p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition" title="Recadrer">${icon("target", "w-4 h-4")}</button>
        <button id="addRoot2" class="sm:hidden p-2 rounded-xl bg-brand-600 text-white transition" title="Ajouter un nœud">${icon("plus", "w-4 h-4")}</button>
      </div>

      <div class="absolute bottom-4 left-4 hidden md:block text-xs text-slate-400 dark:text-slate-500 bg-white/70 dark:bg-slate-900/70 backdrop-blur px-3 py-1.5 rounded-xl pointer-events-none">
        Glisser le fond = déplacer · Molette = zoom · Double-clic = éditer
      </div>
    </div>
  </div>`;

  // Ajuste la couleur des points de la grille en mode sombre.
  const applyDot = () => document.getElementById("canvas").style.setProperty("--dot",
    document.documentElement.classList.contains("dark") ? "#1e293b" : "#cbd5e1");
  applyDot();
  wireThemeToggle();
  const themeBtn = document.getElementById("themeBtn");
  if (themeBtn) { const prev = themeBtn.onclick; themeBtn.onclick = () => { prev?.(); applyDot(); }; }

  new MindEditor(project);
}

class MindEditor {
  constructor(project) {
    this.project = project;
    this.nodes = new Map();          // id -> { data, el }
    this.scale = 1;
    this.tx = 0; this.ty = 0;
    this.interacting = false;        // pause la synchro realtime pendant une action

    this.canvas = document.getElementById("canvas");
    this.viewport = document.getElementById("viewport");
    this.svg = document.getElementById("links");
    this.layer = document.getElementById("nodesLayer");

    this.saveState = document.getElementById("saveState");
    this.setSaved = debounce(() => (this.saveState.innerHTML =
      `<span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> Enregistré`), 600);
    // La synchro realtime est débouncée : on regroupe les rafales de changements (optimisation).
    this.reload = debounce(() => { if (!this.interacting) this.load(); }, 250);

    this.bindToolbar();
    this.bindPanZoom();
    this.load().then(() => this.subscribeRealtime());
  }

  // -------------------------------------------------------------- Données
  async load() {
    const { data, error } = await supabase
      .from("nodes").select(NODE_COLS).eq("project_id", this.project.id);
    if (error) return toast(error.message, "error");

    this.layer.innerHTML = "";
    this.nodes.clear();
    (data || []).forEach((n) => this.mountNode(n));
    if (!data || !data.length) await this.addNode(null, 480, 260, "Idée centrale");
    this.drawLinks();
    this.fitView();
  }

  markSaving() {
    this.saveState.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span> Enregistrement…`;
    this.setSaved();
  }

  // --------------------------------------------------------------- Nœuds
  mountNode(data) {
    const color = data.color || PALETTE[0];
    const el = document.createElement("div");
    el.className =
      "mf-node absolute rounded-2xl shadow-soft bg-white dark:bg-slate-800 ring-1 px-3.5 py-2.5 text-sm cursor-grab transition-shadow";
    el.style.left = data.x + "px";
    el.style.top = data.y + "px";
    el.style.width = "190px";
    el.style.setProperty("--c", color);
    el.style.boxShadow = "0 1px 2px rgba(15,23,42,.06)";
    el.style.setProperty("--tw-ring-color", color);
    el.style.borderLeft = `4px solid ${color}`;
    el.dataset.id = data.id;

    el.innerHTML = `
      <div class="mf-text outline-none break-words min-h-[1.2em] text-slate-800 dark:text-slate-100 font-medium" contenteditable="true" spellcheck="false">${esc(data.text)}</div>
      <div class="mf-tools opacity-0 transition-opacity absolute -top-3.5 -right-2 flex gap-1">
        <button class="mf-color w-7 h-7 rounded-full text-white shadow-lift flex items-center justify-center ring-2 ring-white dark:ring-slate-800" title="Couleur" style="background:${color}"></button>
        <button class="mf-add w-7 h-7 rounded-full bg-brand-600 hover:bg-brand-700 text-white shadow-lift flex items-center justify-center ring-2 ring-white dark:ring-slate-800" title="Ajouter un enfant">${icon("plus", "w-3.5 h-3.5")}</button>
        <button class="mf-del w-7 h-7 rounded-full bg-rose-500 hover:bg-rose-600 text-white shadow-lift flex items-center justify-center ring-2 ring-white dark:ring-slate-800" title="Supprimer">${icon("x", "w-3.5 h-3.5")}</button>
      </div>`;

    this.layer.appendChild(el);
    this.nodes.set(data.id, { data, el });
    this.wireNode(this.nodes.get(data.id));
    return this.nodes.get(data.id);
  }

  wireNode(node) {
    const { el, data } = node;
    const tools = el.querySelector(".mf-tools");
    const textEl = el.querySelector(".mf-text");

    el.addEventListener("mouseenter", () => (tools.style.opacity = "1"));
    el.addEventListener("mouseleave", () => (tools.style.opacity = "0"));

    const saveText = debounce(async (val) => {
      await supabase.from("nodes").update({ text: val }).eq("id", data.id);
      this.setSaved();
    }, 500);
    textEl.addEventListener("input", () => {
      data.text = textEl.textContent;
      this.markSaving();
      this.drawLinks();
      saveText(textEl.textContent);
    });
    textEl.addEventListener("focus", () => (this.interacting = true));
    textEl.addEventListener("blur", () => { this.interacting = false; saveText.flush(textEl.textContent); });
    el.addEventListener("dblclick", (e) => { e.stopPropagation(); textEl.focus(); });

    el.querySelector(".mf-add").addEventListener("click", (e) => {
      e.stopPropagation();
      const cx = data.x + 250, cy = data.y + (Math.random() * 120 - 60);
      const color = PALETTE[this.nodes.size % PALETTE.length];
      this.addNode(data.id, cx, cy, "Nouvelle idée", color);
    });
    el.querySelector(".mf-del").addEventListener("click", (e) => {
      e.stopPropagation();
      this.deleteNode(data.id);
    });
    el.querySelector(".mf-color").addEventListener("click", (e) => {
      e.stopPropagation();
      this.openColorPicker(node, e.currentTarget);
    });

    this.enableDrag(node, textEl);
  }

  // Sélecteur de couleur flottant (léger, natif).
  openColorPicker(node, anchor) {
    document.getElementById("mf-swatches")?.remove();
    const { el, data } = node;
    const pop = document.createElement("div");
    pop.id = "mf-swatches";
    pop.className = "fixed z-[80] p-2 rounded-2xl bg-white dark:bg-slate-800 ring-1 ring-slate-200 dark:ring-slate-700 shadow-lift grid grid-cols-4 gap-1.5 animate-pop-in";
    const r = anchor.getBoundingClientRect();
    pop.style.left = Math.min(r.left, window.innerWidth - 160) + "px";
    pop.style.top = r.bottom + 8 + "px";
    pop.innerHTML = PALETTE.map((c) =>
      `<button data-c="${c}" class="w-7 h-7 rounded-full ring-2 ${data.color === c ? "ring-slate-900 dark:ring-white" : "ring-transparent"} hover:scale-110 transition" style="background:${c}"></button>`
    ).join("");
    document.body.appendChild(pop);

    const closePop = (ev) => { if (!pop.contains(ev.target)) { pop.remove(); document.removeEventListener("mousedown", closePop); } };
    setTimeout(() => document.addEventListener("mousedown", closePop), 0);

    pop.querySelectorAll("[data-c]").forEach((b) => (b.onclick = async () => {
      const c = b.dataset.c;
      data.color = c;
      el.style.setProperty("--c", c);
      el.style.borderLeftColor = c;
      el.style.setProperty("--tw-ring-color", c);
      el.querySelector(".mf-color").style.background = c;
      pop.remove(); document.removeEventListener("mousedown", closePop);
      this.drawLinks();
      this.markSaving();
      await supabase.from("nodes").update({ color: c }).eq("id", data.id);
      this.setSaved();
    }));
  }

  enableDrag(node, textEl) {
    const { el, data } = node;
    let startX, startY, ox, oy, dragging = false;

    const onDown = (e) => {
      if (e.target === textEl || textEl.contains(e.target)) return;
      if (e.target.closest(".mf-tools")) return;
      e.preventDefault();
      dragging = true;
      this.interacting = true;
      el.style.cursor = "grabbing";
      el.style.boxShadow = "0 8px 30px rgba(15,23,42,.18)";
      el.classList.add("z-10");
      startX = e.clientX; startY = e.clientY; ox = data.x; oy = data.y;
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    };
    const onMove = (e) => {
      if (!dragging) return;
      data.x = ox + (e.clientX - startX) / this.scale;
      data.y = oy + (e.clientY - startY) / this.scale;
      el.style.left = data.x + "px";
      el.style.top = data.y + "px";
      this.drawLinks();
    };
    const onUp = async () => {
      if (!dragging) return;
      dragging = false;
      el.style.cursor = "grab";
      el.style.boxShadow = "0 1px 2px rgba(15,23,42,.06)";
      el.classList.remove("z-10");
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      this.markSaving();
      await supabase.from("nodes").update({ x: data.x, y: data.y }).eq("id", data.id);
      this.setSaved();
      this.interacting = false;
    };
    el.addEventListener("pointerdown", onDown);
  }

  async addNode(parentId, x, y, text, color) {
    this.interacting = true;
    color = color || PALETTE[0];
    const { data, error } = await supabase.from("nodes")
      .insert({ project_id: this.project.id, parent_id: parentId, x, y, text, color })
      .select(NODE_COLS).single();
    this.interacting = false;
    if (error) return toast(error.message, "error");
    const node = this.mountNode(data);
    this.drawLinks();
    node.el.querySelector(".mf-text").focus();
    const r = document.createRange(); r.selectNodeContents(node.el.querySelector(".mf-text"));
    const s = getSelection(); s.removeAllRanges(); s.addRange(r);
    return node;
  }

  async deleteNode(id) {
    const node = this.nodes.get(id);
    if (!node) return;
    const hasChild = [...this.nodes.values()].some((n) => n.data.parent_id === id);
    if (hasChild) {
      const ok = await confirmDialog({
        title: "Supprimer le nœud",
        message: "Ce nœud et TOUS ses descendants seront supprimés. Continuer ?",
        confirmLabel: "Supprimer", danger: true, icon: "trash",
      });
      if (!ok) return;
    }

    this.interacting = true;
    const { error } = await supabase.from("nodes").delete().eq("id", id); // cascade en DB
    this.interacting = false;
    if (error) return toast(error.message, "error");

    const toRemove = new Set();
    const collect = (nid) => {
      toRemove.add(nid);
      for (const n of this.nodes.values())
        if (n.data.parent_id === nid) collect(n.data.id);
    };
    collect(id);
    toRemove.forEach((nid) => {
      this.nodes.get(nid)?.el.remove();
      this.nodes.delete(nid);
    });
    this.drawLinks();
  }

  // --------------------------------------------------------- Liaisons SVG
  drawLinks() {
    const paths = [];
    for (const { data, el } of this.nodes.values()) {
      if (!data.parent_id) continue;
      const parent = this.nodes.get(data.parent_id);
      if (!parent) continue;

      const pw = parent.el.offsetWidth, ph = parent.el.offsetHeight;
      const cw = el.offsetWidth, ch = el.offsetHeight;

      const parentCx = parent.data.x + pw / 2, parentCy = parent.data.y + ph / 2;
      const childCx = data.x + cw / 2, childCy = data.y + ch / 2;

      let x1, y1, x2, y2;
      if (childCx >= parentCx) { x1 = parent.data.x + pw; y1 = parentCy; x2 = data.x; y2 = childCy; }
      else { x1 = parent.data.x; y1 = parentCy; x2 = data.x + cw; y2 = childCy; }

      const dx = Math.max(40, Math.abs(x2 - x1) * 0.5);
      const c1x = x1 + (x2 >= x1 ? dx : -dx);
      const c2x = x2 - (x2 >= x1 ? dx : -dx);
      const color = data.color || PALETTE[0];
      paths.push(
        `<path d="M ${x1} ${y1} C ${c1x} ${y1}, ${c2x} ${y2}, ${x2} ${y2}" ` +
        `fill="none" stroke="${color}" stroke-width="2.5" stroke-opacity="0.7" stroke-linecap="round"/>` +
        `<circle cx="${x2}" cy="${y2}" r="3.5" fill="${color}"/>`
      );
    }
    this.svg.innerHTML = paths.join("");
  }

  // ----------------------------------------------------------- Pan / Zoom
  applyTransform() {
    this.viewport.style.transform = `translate(${this.tx}px,${this.ty}px) scale(${this.scale})`;
    document.getElementById("zoomReset").textContent = Math.round(this.scale * 100) + "%";
  }

  bindPanZoom() {
    let panning = false, sx, sy, otx, oty;
    this.canvas.addEventListener("pointerdown", (e) => {
      if (e.target !== this.canvas && e.target !== this.viewport && e.target !== this.svg) return;
      panning = true; this.canvas.style.cursor = "grabbing";
      sx = e.clientX; sy = e.clientY; otx = this.tx; oty = this.ty;
    });
    window.addEventListener("pointermove", (e) => {
      if (!panning) return;
      this.tx = otx + (e.clientX - sx);
      this.ty = oty + (e.clientY - sy);
      this.applyTransform();
    });
    window.addEventListener("pointerup", () => { panning = false; this.canvas.style.cursor = "grab"; });

    this.canvas.addEventListener("wheel", (e) => {
      e.preventDefault();
      const rect = this.canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left, my = e.clientY - rect.top;
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      const newScale = Math.min(2.5, Math.max(0.25, this.scale * factor));
      this.tx = mx - ((mx - this.tx) * newScale) / this.scale;
      this.ty = my - ((my - this.ty) * newScale) / this.scale;
      this.scale = newScale;
      this.applyTransform();
    }, { passive: false });
  }

  zoomBy(f) {
    const rect = this.canvas.getBoundingClientRect();
    const mx = rect.width / 2, my = rect.height / 2;
    const newScale = Math.min(2.5, Math.max(0.25, this.scale * f));
    this.tx = mx - ((mx - this.tx) * newScale) / this.scale;
    this.ty = my - ((my - this.ty) * newScale) / this.scale;
    this.scale = newScale;
    this.applyTransform();
  }

  fitView() {
    if (!this.nodes.size) { this.applyTransform(); return; }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const { data, el } of this.nodes.values()) {
      minX = Math.min(minX, data.x); minY = Math.min(minY, data.y);
      maxX = Math.max(maxX, data.x + el.offsetWidth);
      maxY = Math.max(maxY, data.y + el.offsetHeight);
    }
    const rect = this.canvas.getBoundingClientRect();
    const pad = 90;
    const sw = (maxX - minX) + pad * 2, sh = (maxY - minY) + pad * 2;
    const scale = Math.min(1.2, Math.min(rect.width / sw, rect.height / sh));
    this.scale = Math.max(0.25, scale);
    this.tx = -minX * this.scale + (rect.width - (maxX - minX) * this.scale) / 2;
    this.ty = -minY * this.scale + (rect.height - (maxY - minY) * this.scale) / 2;
    this.applyTransform();
  }

  // ---------------------------------------------------------- Toolbar
  bindToolbar() {
    document.getElementById("backBtn").onclick = () => navigate("/");
    document.getElementById("zoomIn").onclick = () => this.zoomBy(1.15);
    document.getElementById("zoomOut").onclick = () => this.zoomBy(1 / 1.15);
    document.getElementById("zoomReset").onclick = () => this.fitView();
    document.getElementById("fitBtn").onclick = () => this.fitView();

    const addRoot = () => {
      const rect = this.canvas.getBoundingClientRect();
      const x = (rect.width / 2 - this.tx) / this.scale;
      const y = (rect.height / 2 - this.ty) / this.scale;
      this.addNode(null, x, y, "Nouveau nœud", PALETTE[this.nodes.size % PALETTE.length]);
    };
    document.getElementById("addRoot").onclick = addRoot;
    document.getElementById("addRoot2").onclick = addRoot;

    const nameInput = document.getElementById("projName");
    const saveName = debounce(async (v) => {
      await supabase.from("projects").update({ name: v }).eq("id", this.project.id);
      this.setSaved();
    }, 500);
    nameInput.addEventListener("input", () => { this.markSaving(); saveName(nameInput.value.trim() || "Sans titre"); });
  }

  // ------------------------------------------------------- Realtime (multi-onglets)
  subscribeRealtime() {
    supabase
      .channel("nodes-" + this.project.id)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "nodes", filter: "project_id=eq." + this.project.id },
        () => this.reload())
      .subscribe();
  }
}
