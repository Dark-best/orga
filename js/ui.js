// ============================================================================
//  Helpers d'interface partagés — MindFlow
// ============================================================================
export const app = () => document.getElementById("app");

export function html(strings, ...vals) {
  return strings.reduce((acc, s, i) => acc + s + (vals[i] ?? ""), "");
}

// Échappe le HTML pour éviter toute injection depuis le texte utilisateur
export function esc(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

// ------------------------------------------------------------------ ICÔNES
// Petite bibliothèque d'icônes SVG (stroke) réutilisables.
const ICONS = {
  brand: `<path d="M6 12a3 3 0 1 0 0-.01M18 6a3 3 0 1 0 0-.01M18 18a3 3 0 1 0 0-.01M8.7 10.7 15.3 7.3M8.7 13.3 15.3 16.7"/>`,
  plus: `<path d="M12 5v14M5 12h14"/>`,
  minus: `<path d="M5 12h14"/>`,
  back: `<path d="M19 12H5M12 19l-7-7 7-7"/>`,
  trash: `<path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>`,
  edit: `<path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>`,
  sun: `<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>`,
  moon: `<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/>`,
  logout: `<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>`,
  shield: `<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/>`,
  copy: `<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>`,
  target: `<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3"/>`,
  check: `<path d="M20 6 9 17l-5-5"/>`,
  x: `<path d="M18 6 6 18M6 6l12 12"/>`,
  search: `<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>`,
};

export function icon(name, cls = "w-5 h-5", stroke = 2) {
  return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ""}</svg>`;
}

// -------------------------------------------------------------------- THÈME
export function currentTheme() {
  try {
    const t = localStorage.getItem("mf-theme");
    if (t) return t;
  } catch (e) {}
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

export function toggleTheme() {
  const dark = !document.documentElement.classList.contains("dark");
  document.documentElement.classList.toggle("dark", dark);
  try { localStorage.setItem("mf-theme", dark ? "dark" : "light"); } catch (e) {}
  return dark ? "dark" : "light";
}

// Bouton de bascule de thème, prêt à insérer dans une barre.
export function themeToggleButton(id = "themeBtn") {
  return `<button id="${id}" title="Changer de thème"
    class="p-2 rounded-xl text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition">
    <span class="dark:hidden">${icon("moon")}</span>
    <span class="hidden dark:inline">${icon("sun")}</span>
  </button>`;
}

export function wireThemeToggle(id = "themeBtn") {
  const btn = document.getElementById(id);
  if (btn) btn.onclick = () => toggleTheme();
}

// -------------------------------------------------------------------- TOASTS
let toastWrap;
export function toast(message, type = "info") {
  if (!toastWrap) {
    toastWrap = document.createElement("div");
    toastWrap.id = "toastWrap";
    toastWrap.className = "fixed bottom-5 left-1/2 -translate-x-1/2 z-[100] flex flex-col items-center gap-2 pointer-events-none";
    document.body.appendChild(toastWrap);
  }
  const styles = {
    info: "bg-slate-900/95 text-white ring-slate-700",
    success: "bg-emerald-600/95 text-white ring-emerald-400/40",
    error: "bg-rose-600/95 text-white ring-rose-400/40",
  };
  const ico = { info: "target", success: "check", error: "x" }[type] || "target";
  const el = document.createElement("div");
  el.className =
    "pointer-events-auto flex items-center gap-2 px-4 py-2.5 rounded-2xl text-sm font-medium shadow-lift ring-1 backdrop-blur animate-pop-in " +
    (styles[type] || styles.info);
  el.innerHTML = `${icon(ico, "w-4 h-4")}<span>${esc(message)}</span>`;
  toastWrap.appendChild(el);
  setTimeout(() => {
    el.style.transition = "opacity .3s, transform .3s";
    el.style.opacity = "0";
    el.style.transform = "translateY(6px)";
    setTimeout(() => el.remove(), 320);
  }, 2800);
}

// -------------------------------------------------------------------- MODALES
// Modale générique. Retourne une promesse résolue par les boutons.
// buttons: [{ label, value, variant: 'primary'|'ghost'|'danger', autofocus }]
export function modal({ title, body = "", icon: ic, buttons = [], onMount } = {}) {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className =
      "fixed inset-0 z-[90] flex items-center justify-center p-4 bg-slate-900/50 dark:bg-black/60 backdrop-blur-sm animate-fade-in";

    const variants = {
      primary: "bg-brand-600 hover:bg-brand-700 text-white shadow-soft",
      ghost: "bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-200",
      danger: "bg-rose-600 hover:bg-rose-700 text-white shadow-soft",
    };

    const close = (val) => {
      overlay.style.transition = "opacity .15s";
      overlay.style.opacity = "0";
      setTimeout(() => { overlay.remove(); document.removeEventListener("keydown", onKey); resolve(val); }, 150);
    };
    const onKey = (e) => {
      if (e.key === "Escape") close(null);
      if (e.key === "Enter" && !e.shiftKey) {
        const primary = buttons.find((b) => b.variant === "primary" || b.variant === "danger");
        const target = e.target;
        if (target.tagName !== "TEXTAREA" && primary) { e.preventDefault(); close(primary.value); }
      }
    };

    overlay.innerHTML = `
      <div class="w-full max-w-md rounded-3xl bg-white dark:bg-slate-900 ring-1 ring-slate-200 dark:ring-slate-700 shadow-lift p-6 animate-pop-in">
        ${ic ? `<div class="w-12 h-12 rounded-2xl bg-brand-50 dark:bg-brand-950 text-brand-600 dark:text-brand-300 flex items-center justify-center mb-4">${icon(ic, "w-6 h-6")}</div>` : ""}
        ${title ? `<h2 class="text-lg font-bold text-slate-900 dark:text-white">${esc(title)}</h2>` : ""}
        <div class="mf-modal-body mt-2 text-sm text-slate-500 dark:text-slate-400">${body}</div>
        <div class="mf-modal-actions mt-6 flex justify-end gap-2"></div>
      </div>`;

    const actions = overlay.querySelector(".mf-modal-actions");
    buttons.forEach((b) => {
      const btn = document.createElement("button");
      btn.className = "px-4 py-2 rounded-xl text-sm font-semibold transition " + (variants[b.variant] || variants.ghost);
      btn.textContent = b.label;
      btn.onclick = () => close(b.value);
      if (b.autofocus) setTimeout(() => btn.focus(), 30);
      actions.appendChild(btn);
    });

    overlay.addEventListener("mousedown", (e) => { if (e.target === overlay) close(null); });
    document.addEventListener("keydown", onKey);
    document.body.appendChild(overlay);
    onMount?.(overlay);
  });
}

// Remplacement élégant de confirm()
export function confirmDialog({ title, message, confirmLabel = "Confirmer", danger = false, icon: ic = "target" } = {}) {
  return modal({
    title, icon: ic,
    body: `<p>${esc(message)}</p>`,
    buttons: [
      { label: "Annuler", value: false, variant: "ghost" },
      { label: confirmLabel, value: true, variant: danger ? "danger" : "primary", autofocus: true },
    ],
  });
}

// Demande de texte (remplace prompt()) — lit la valeur AVANT la fermeture.
export function askText({ title, label, value = "", placeholder = "", confirmLabel = "Valider", icon: ic = "edit" } = {}) {
  return new Promise((resolve) => {
    let inputRef = null;
    modal({
      title, icon: ic,
      body: `
        ${label ? `<label class="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">${esc(label)}</label>` : ""}
        <input id="mf-ask-input" value="${esc(value)}" placeholder="${esc(placeholder)}"
          class="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700
                 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400 transition"/>`,
      buttons: [
        { label: "Annuler", value: "__CANCEL__", variant: "ghost" },
        { label: confirmLabel, value: "__OK__", variant: "primary" },
      ],
      onMount: (overlay) => {
        inputRef = overlay.querySelector("#mf-ask-input");
        setTimeout(() => { inputRef.focus(); inputRef.select(); }, 30);
        inputRef.addEventListener("keydown", (e) => {
          if (e.key === "Enter") { e.preventDefault(); overlay.querySelector(".mf-modal-actions button:last-child").click(); }
        });
      },
    }).then((res) => {
      if (res === "__OK__" && inputRef) return resolve(inputRef.value);
      resolve(null);
    });
  });
}

// Debounce simple
export function debounce(fn, ms = 400) {
  let t;
  const d = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  d.flush = (...a) => { clearTimeout(t); fn(...a); };
  d.cancel = () => clearTimeout(t);
  return d;
}
