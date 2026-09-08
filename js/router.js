// Routeur SPA minimaliste basé sur le hash (#/route) — 100% compatible GitHub Pages.
const routes = new Map();
let notFound = null;

export function route(path, handler) {
  routes.set(path, handler);
}
export function setNotFound(handler) {
  notFound = handler;
}

// Retourne { path, params } — ex. "#/editor/abc" => { path:"/editor/:id", params:{id:"abc"} }
function match(hash) {
  const clean = (hash || "#/").replace(/^#/, "") || "/";
  const [pathPart] = clean.split("?");
  const segments = pathPart.split("/").filter(Boolean);

  for (const [pattern, handler] of routes) {
    const pSegs = pattern.split("/").filter(Boolean);
    if (pSegs.length !== segments.length) continue;
    const params = {};
    let ok = true;
    for (let i = 0; i < pSegs.length; i++) {
      if (pSegs[i].startsWith(":")) params[pSegs[i].slice(1)] = decodeURIComponent(segments[i]);
      else if (pSegs[i] !== segments[i]) { ok = false; break; }
    }
    if (ok) return { handler, params };
  }
  return { handler: notFound, params: {} };
}

export function navigate(path) {
  if (location.hash === "#" + path) render();
  else location.hash = path;
}

export async function render() {
  const { handler, params } = match(location.hash);
  if (handler) await handler(params);
}

export function startRouter() {
  window.addEventListener("hashchange", render);
  render();
}

// Convertit une URL "jolie" (/invite/xyz) en hash au premier chargement.
// Fonctionne avec le fallback 404.html de GitHub Pages.
export function normalizeInitialUrl() {
  const url = new URL(location.href);

  // ?invite=xyz  -> #/invite/xyz
  const q = url.searchParams.get("invite");
  if (q) { location.replace(url.pathname + "#/invite/" + encodeURIComponent(q)); return; }

  // /invite/xyz (sans hash) -> #/invite/xyz
  const m = url.pathname.match(/\/invite\/([^/]+)\/?$/);
  if (m && !location.hash) {
    const base = url.pathname.replace(/\/invite\/[^/]+\/?$/, "/");
    location.replace(base + "#/invite/" + m[1]);
  }
}
