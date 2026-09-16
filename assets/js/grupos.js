import { agregarPorGrupo } from "./agregados.js";
import { abrirEntityDrawer } from "./cursos.js";
import { escapeHtml } from "./ui.js";
import { formatFechaDisplay, formatHoraDisplay } from "./utils.js";
import { store } from "./store.js";

function grupoCard(g) {
  return `<article class="group-agenda-card" data-open-group-profile="${escapeHtml(g.grupo)}">
    <div class="group-date"><strong>${formatFechaDisplay(g.fecha)}</strong><span>${formatHoraDisplay(g.hora)}</span></div>
    <div class="group-main"><span class="section-kicker">${escapeHtml(g.base || "Sin base")} · ${escapeHtml(g.salon || "Sin salón")}</span><h3>${escapeHtml(g.grupo)}</h3><p>${escapeHtml(g.curso || "Curso sin asignar")}</p><small><i class="fa-solid fa-chalkboard-user"></i> ${escapeHtml(g.instructor || "Sin instructor")}</small></div>
    <div class="group-numbers"><span><strong>${g.resumen.personasUnicas}</strong> personas</span><span class="${g.resumen.noAsistieron ? "critical-value" : "positive-value"}"><strong>${g.resumen.noAsistieron}</strong> ausencias</span><span><strong>${g.resumen.pctAsistencia}%</strong> asistencia</span></div>
    <i class="fa-solid fa-chevron-right group-open"></i>
  </article>`;
}

function section(title, icon, groups, empty) {
  return `<section class="agenda-section"><div class="agenda-section-head"><h3><i class="fa-solid ${icon}"></i>${title}</h3><span>${groups.length} ${groups.length === 1 ? "grupo" : "grupos"}</span></div>${groups.length ? `<div class="agenda-list">${groups.map(grupoCard).join("")}</div>` : `<div class="agenda-empty">${empty}</div>`}</section>`;
}

export function renderGrupos(s) {
  const groups = agregarPorGrupo(s.filtered).map(g => ({ ...g, hora: g.registros.find(r => r.HORA)?.HORA || "" }));
  const today = groups.filter(g => g.fecha === s.estadoHoy);
  const upcoming = groups.filter(g => g.fecha > s.estadoHoy).sort((a, b) => a.fecha.localeCompare(b.fecha));
  const history = groups.filter(g => !g.fecha || g.fecha < s.estadoHoy).sort((a, b) => (b.fecha || "").localeCompare(a.fecha || ""));
  const alerts = groups.filter(g => g.resumen.noAsistieron).length;
  document.getElementById("groupKpis").innerHTML = `<div class="compact-kpi"><strong>${today.length}</strong><span>Hoy</span></div><div class="compact-kpi"><strong>${upcoming.length}</strong><span>Próximos</span></div><div class="compact-kpi"><strong>${alerts}</strong><span>Con ausencias</span></div>`;
  document.getElementById("groupCards").innerHTML = [
    section("Hoy", "fa-calendar-day", today, "No hay grupos programados para hoy."),
    section("Próximos", "fa-calendar-plus", upcoming, "No hay grupos próximos en los datos actuales."),
    section("Historial", "fa-clock-rotate-left", history.slice(0, 100), "Todavía no hay grupos históricos."),
  ].join("");
}

export function abrirGrupo(nombre) { abrirEntityDrawer("Grupo", nombre, store.getGroup(nombre), "grupo"); }
export function renderGrupoDetalle(_s, nombre) { abrirGrupo(nombre); }
