// Helpers d'interface partagés
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

let toastTimer;
export function toast(message, type = "info") {
  let box = document.getElementById("toast");
  if (!box) {
    box = document.createElement("div");
    box.id = "toast";
    box.className =
      "fixed bottom-5 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-lg text-sm font-medium shadow-lg transition-all";
    document.body.appendChild(box);
  }
  const colors = {
    info: "bg-slate-800 text-white",
    success: "bg-emerald-600 text-white",
    error: "bg-rose-600 text-white",
  };
  box.className =
    "fixed bottom-5 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-lg text-sm font-medium shadow-lg transition-all " +
    (colors[type] || colors.info);
  box.textContent = message;
  box.style.opacity = "1";
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (box.style.opacity = "0"), 3000);
}

// Debounce simple
export function debounce(fn, ms = 400) {
  let t;
  const d = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  d.flush = (...a) => { clearTimeout(t); fn(...a); };
  d.cancel = () => clearTimeout(t);
  return d;
}
