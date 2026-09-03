const allowed = new Set(["resumen", "registros", "personas", "cursos", "grupos"]);
const aliases = { inicio: "resumen", asistencias: "registros", colaboradores: "personas" };
let current = "resumen";

export function navigate(view) { location.hash = `#${aliases[view] || view}`; }
export function route() { return current; }
export function initRouter(onChange) {
  const handle = () => {
    const raw = location.hash.replace(/^#\/?/, "").split("/")[0] || "resumen";
    const next = aliases[raw] || raw;
    current = allowed.has(next) ? next : "resumen";
    document.querySelectorAll(".tdc-view").forEach(v => v.classList.toggle("view-active", v.id === `view-${current}`));
    document.querySelectorAll("[data-nav]").forEach(a => a.classList.toggle("active", a.dataset.nav === current));
    onChange(current);
  };
  window.addEventListener("hashchange", handle);
  handle();
}
