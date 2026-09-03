import { agregarPorPersona } from "./agregados.js";
import { escapeHtml } from "./ui.js";
import { formatFechaDisplay } from "./utils.js";

const PAGE_SIZE = 50;
let page = 1;
let cacheKey = "";
let cachedPeople = [];

export function renderColaboradores(s) {
  if (cacheKey !== s.currentFilterKey) { cacheKey = s.currentFilterKey; cachedPeople = agregarPorPersona(s.filtered); page = 1; }
  const start = (page - 1) * PAGE_SIZE;
  const visible = cachedPeople.slice(start, start + PAGE_SIZE);
  const withAbsence = cachedPeople.filter(x => x.inasistencias).length;
  document.getElementById("personKpis").innerHTML = `<div class="compact-kpi"><strong>${cachedPeople.length}</strong><span>Personas</span></div><div class="compact-kpi"><strong>${withAbsence}</strong><span>Con alertas</span></div>`;
  document.getElementById("personasTbody").innerHTML = visible.length ? visible.map(p => {
    const pct = p.asistencias + p.inasistencias ? Math.round(p.asistencias / (p.asistencias + p.inasistencias) * 100) : 0;
    return `<tr><td><span class="person-link" data-open-perfil="${escapeHtml(p.key)}">${escapeHtml(p.NOMBRES)}</span><br><small class="text-muted">${escapeHtml(p.CARGO || "Sin cargo")}</small></td><td class="mono">${escapeHtml(p.ID)}</td><td>${escapeHtml(p.BASE || "—")}</td><td>${p.totalCursos}</td><td><strong>${pct}%</strong> <small class="text-muted">${p.asistencias} sí · ${p.inasistencias} no</small></td><td class="mono">${formatFechaDisplay(p.ultimaFecha)}</td></tr>`;
  }).join("") : '<tr><td colspan="6" class="empty-cell">No hay personas para este filtro.</td></tr>';
  const pages = Math.max(1, Math.ceil(cachedPeople.length / PAGE_SIZE));
  document.getElementById("personPager").innerHTML = `<span class="text-muted small">Página ${page} de ${pages}</span> <button class="icon-button" data-person-page="prev" ${page <= 1 ? "disabled" : ""}><i class="fa-solid fa-chevron-left"></i></button><button class="icon-button" data-person-page="next" ${page >= pages ? "disabled" : ""}><i class="fa-solid fa-chevron-right"></i></button>`;
  document.querySelectorAll("[data-person-page]").forEach(btn => btn.addEventListener("click", () => { page += btn.dataset.personPage === "next" ? 1 : -1; renderColaboradores(s); }));
}
