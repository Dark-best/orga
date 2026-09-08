import { supabase } from "./supabase.js";
import { app, esc, toast, debounce } from "./ui.js";
import { navigate } from "./router.js";
import { currentUser } from "./auth.js";

const PALETTE = ["#6366f1", "#0ea5e9", "#10b981", "#f59e0b", "#ec4899", "#8b5cf6"];

export async function renderEditor({ id }) {
  const user = await currentUser();
  if (!user) return navigate("/login");

  const { data: project, error: pErr } = await supabase
    .from("projects").select("id, name").eq("id", id).single();
  if (pErr || !project) { toast("Projet introuvable", "error"); return navigate("/"); }

  app().innerHTML = `
  <div class="h-screen flex flex-col overflow-hidden bg-slate-100">
    <header class="shrink-0 bg-white border-b border-slate-200 h-14 flex items-center px-3 gap-3">
      <button id="backBtn" class="p-2 rounded-lg hover:bg-slate-100" title="Retour">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
      </button>
      <input id="projName" class="font-semibold text-slate-800 bg-transparent px-2 py-1 rounded hover:bg-slate-100 focus:bg-slate-100 outline-none focus:ring-2 focus:ring-indigo-200 min-w-0 flex-1 sm:flex-none sm:w-64"
             value="${esc(project.name)}"/>
      <div class="ml-auto flex items-center gap-1.5">
        <span id="saveState" class="text-xs text-slate-400 mr-2">Enregistré</span>
        <button id="addRoot" class="text-sm px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium hidden sm:inline">+ Nœud</button>
        <button id="zoomOut" class="p-2 rounded-lg hover:bg-slate-100" title="Zoom -"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14"/></svg></button>
        <button id="zoomReset" class="text-xs px-2 py-1.5 rounded-lg hover:bg-slate-100 tabular-nums" title="Réinitialiser">100%</button>
        <button id="zoomIn" class="p-2 rounded-lg hover:bg-slate-100" title="Zoom +"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg></button>
      </div>
    </header>

    <div id="canvas" class="relative flex-1 overflow-hidden cursor-grab select-none"
         style="background-image:radial-gradient(#cbd5e1 1px,transparent 1px);background-size:22px 22px;">
      <div id="viewport" style="position:absolute;top:0;left:0;transform-origin:0 0;will-change:transform;">
        <svg id="links" style="position:absolute;top:0;left:0;overflow:visible;pointer-events:none;" width="1" height="1"></svg>
        <div id="nodesLayer" style="position:absolute;top:0;left:0;"></div>
      </div>
      <div class="absolute bottom-3 left-3 text-xs text-slate-400 bg-white/70 backdrop-blur px-2 py-1 rounded pointer-events-none">
        Glisser le fond = déplacer • Molette = zoom • Double-clic sur un nœud = éditer
      </div>
    </div>
  </div>`;

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
    this.setSaved = debounce(() => (this.saveState.textContent = "Enregistré"), 600);

    this.bindToolbar();
    this.bindPanZoom();
    this.load().then(() => this.subscribeRealtime());
  }

  // -------------------------------------------------------------- Données
  async load() {
    const { data, error } = await supabase
      .from("nodes").select("*").eq("project_id", this.project.id);
    if (error) return toast(error.message, "error");

    this.layer.innerHTML = "";
    this.nodes.clear();
    (data || []).forEach((n) => this.mountNode(n));
    if (!data || !data.length) await this.addNode(null, 480, 260, "Idée centrale");
    this.drawLinks();
    this.fitView();
  }

  markSaving() { this.saveState.textContent = "Enregistrement…"; this.setSaved(); }

  // --------------------------------------------------------------- Nœuds
  mountNode(data) {
    const el = document.createElement("div");
    el.className =
      "mf-node absolute rounded-xl shadow-md bg-white border-2 px-3 py-2 text-sm cursor-grab";
    el.style.left = data.x + "px";
    el.style.top = data.y + "px";
    el.style.width = "180px";
    el.style.borderColor = data.color || PALETTE[0];
    el.dataset.id = data.id;

    el.innerHTML = `
      <div class="mf-text outline-none break-words min-h-[1.2em] text-slate-800" contenteditable="true"
           spellcheck="false">${esc(data.text)}</div>
      <div class="mf-tools opacity-0 transition absolute -top-3 -right-3 flex gap-1">
        <button class="mf-add w-6 h-6 rounded-full bg-indigo-600 text-white text-xs shadow flex items-center justify-center" title="Ajouter un enfant">+</button>
        <button class="mf-del w-6 h-6 rounded-full bg-rose-500 text-white text-xs shadow flex items-center justify-center" title="Supprimer">×</button>
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

    // Édition de texte en direct (autosave)
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
    // Double-clic => focus l'édition
    el.addEventListener("dblclick", (e) => { e.stopPropagation(); textEl.focus(); });

    // Boutons
    el.querySelector(".mf-add").addEventListener("click", (e) => {
      e.stopPropagation();
      const cx = data.x + 240, cy = data.y + (Math.random() * 120 - 60);
      const color = PALETTE[(this.nodes.size) % PALETTE.length];
      this.addNode(data.id, cx, cy, "Nouvelle idée", color);
    });
    el.querySelector(".mf-del").addEventListener("click", (e) => {
      e.stopPropagation();
      this.deleteNode(data.id);
    });

    // Drag & drop du nœud
    this.enableDrag(node, textEl);
  }

  enableDrag(node, textEl) {
    const { el, data } = node;
    let startX, startY, ox, oy, dragging = false;

    const onDown = (e) => {
      if (e.target === textEl || textEl.contains(e.target)) return; // laisser éditer
      if (e.target.closest(".mf-tools")) return;
      e.preventDefault();
      dragging = true;
      this.interacting = true;
      el.style.cursor = "grabbing";
      el.classList.add("shadow-xl", "z-10");
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
      el.classList.remove("shadow-xl", "z-10");
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
      .select("*").single();
    this.interacting = false;
    if (error) return toast(error.message, "error");
    const node = this.mountNode(data);
    this.drawLinks();
    node.el.querySelector(".mf-text").focus();
    // sélectionne tout le texte pour remplacer facilement
    const r = document.createRange(); r.selectNodeContents(node.el.querySelector(".mf-text"));
    const s = getSelection(); s.removeAllRanges(); s.addRange(r);
    return node;
  }

  async deleteNode(id) {
    const node = this.nodes.get(id);
    if (!node) return;
    if (!node.data.parent_id) {
      // racine : autoriser seulement s'il n'a pas d'enfant
      const hasChild = [...this.nodes.values()].some((n) => n.data.parent_id === id);
      if (hasChild && !confirm("Supprimer ce nœud racine et TOUS ses descendants ?")) return;
    } else if (!confirm("Supprimer ce nœud et ses descendants ?")) return;

    this.interacting = true;
    const { error } = await supabase.from("nodes").delete().eq("id", id); // cascade en DB
    this.interacting = false;
    if (error) return toast(error.message, "error");

    // Retire localement le nœud et ses descendants (cascade)
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

      // On relie le bord droit du parent au bord gauche de l'enfant si l'enfant est à droite
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
        `fill="none" stroke="${color}" stroke-width="2.5" stroke-opacity="0.55"/>` +
        `<circle cx="${x2}" cy="${y2}" r="3" fill="${color}"/>`
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
      // Zoom centré sur le curseur
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
    const pad = 80;
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
    document.getElementById("addRoot").onclick = () => {
      const rect = this.canvas.getBoundingClientRect();
      const x = (rect.width / 2 - this.tx) / this.scale;
      const y = (rect.height / 2 - this.ty) / this.scale;
      this.addNode(null, x, y, "Nouveau nœud", PALETTE[this.nodes.size % PALETTE.length]);
    };

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
        () => { if (!this.interacting) this.load(); })
      .subscribe();
  }
}
