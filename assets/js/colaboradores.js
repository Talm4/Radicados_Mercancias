import { agregarPorPersona } from "./agregados.js";
import { escapeHtml } from "./ui.js";
import { formatFechaDisplay, formatHoraDisplay } from "./utils.js";

function renderHoy(s) {
  const records = s.filtered.filter(rec => rec.FECHA === s.estadoHoy)
    .sort((a, b) => String(a.HORA || "").localeCompare(String(b.HORA || "")) || String(a.NOMBRES || "").localeCompare(String(b.NOMBRES || ""), "es"));
  const people = new Set(records.map(rec => rec._personKey));
  document.getElementById("personTodayCount").textContent = `${people.size} ${people.size === 1 ? "persona" : "personas"}`;
  document.getElementById("personToday").innerHTML = records.length ? records.map(rec => `
    <button type="button" class="today-person-card" data-open-perfil="${escapeHtml(rec._personKey)}">
      <span class="today-person-time">${formatHoraDisplay(rec.HORA)}</span>
      <div><strong>${escapeHtml(rec.NOMBRES || "Sin nombre")}</strong><small>${escapeHtml(rec.CURSO || "Sin curso")} · ${escapeHtml(rec.GRUPO || "Sin grupo")}</small></div>
      <span class="today-person-base">${escapeHtml(rec.BASE || "Sin base")}</span>
      <span class="today-person-state ${rec._asistioSi ? "yes" : "no"}">${rec._asistioSi ? "Asistió" : "No asistió"}</span>
    </button>`).join("") : '<div class="today-empty"><i class="fa-regular fa-calendar-check"></i><span>No hay personas programadas para hoy con los filtros actuales.</span></div>';
  return { registros: records.length, personas: people.size };
}

const PAGE_SIZE = 50;
let page = 1;
let cacheKey = "";
let cachedPeople = [];

export function renderColaboradores(s) {
  const today = renderHoy(s);
  if (cacheKey !== s.currentFilterKey) { cacheKey = s.currentFilterKey; cachedPeople = agregarPorPersona(s.filtered); page = 1; }
  const start = (page - 1) * PAGE_SIZE;
  const visible = cachedPeople.slice(start, start + PAGE_SIZE);
  const withAbsence = cachedPeople.filter(x => x.inasistencias).length;
  document.getElementById("personKpis").innerHTML = `<div class="compact-kpi"><strong>${today.personas}</strong><span>Hoy</span></div><div class="compact-kpi"><strong>${cachedPeople.length}</strong><span>Personas</span></div><div class="compact-kpi"><strong>${withAbsence}</strong><span>Con ausencias</span></div>`;
  document.getElementById("personasTbody").innerHTML = visible.length ? visible.map(p => {
    const pct = p.asistencias + p.inasistencias ? Math.round(p.asistencias / (p.asistencias + p.inasistencias) * 100) : 0;
    return `<tr><td><span class="person-link" data-open-perfil="${escapeHtml(p.key)}">${escapeHtml(p.NOMBRES)}</span><br><small class="text-muted">${escapeHtml(p.CARGO || "Sin cargo")}</small></td><td class="mono">${escapeHtml(p.ID)}</td><td>${escapeHtml(p.BASE || "—")}</td><td>${p.totalCursos}</td><td><strong>${pct}%</strong> <small class="text-muted">${p.asistencias} sí · ${p.inasistencias} no</small></td><td class="mono">${formatFechaDisplay(p.ultimaFecha)}</td></tr>`;
  }).join("") : '<tr><td colspan="6" class="empty-cell">No hay personas para este filtro.</td></tr>';
  const pages = Math.max(1, Math.ceil(cachedPeople.length / PAGE_SIZE));
  document.getElementById("personPager").innerHTML = `<span class="text-muted small">Página ${page} de ${pages}</span> <button class="icon-button" data-person-page="prev" ${page <= 1 ? "disabled" : ""}><i class="fa-solid fa-chevron-left"></i></button><button class="icon-button" data-person-page="next" ${page >= pages ? "disabled" : ""}><i class="fa-solid fa-chevron-right"></i></button>`;
  document.querySelectorAll("[data-person-page]").forEach(btn => btn.addEventListener("click", () => { page += btn.dataset.personPage === "next" ? 1 : -1; renderColaboradores(s); }));
}
