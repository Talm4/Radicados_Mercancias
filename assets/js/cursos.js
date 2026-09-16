import { agregarPorCurso } from "./agregados.js";
import { aggregateRecords } from "./data-engine.js";
import { escapeHtml, asistenciaPill } from "./ui.js";
import { formatFechaDisplay } from "./utils.js";
import { store } from "./store.js";

export function renderCursos(s) {
  const cursos = agregarPorCurso(s.filtered).sort((a, b) => b.resumen.registros - a.resumen.registros);
  const totalPersonas = new Set(s.filtered.map(rec => rec._personKey)).size;
  document.getElementById("courseKpis").innerHTML = `<div class="compact-kpi"><strong>${cursos.length}</strong><span>Tipos</span></div><div class="compact-kpi"><strong>${totalPersonas}</strong><span>Personas</span></div><div class="compact-kpi"><strong>${s.metrics.summary.pctAsistencia}%</strong><span>Asistencia</span></div>`;
  const host = document.getElementById("courseCards");
  host.innerHTML = cursos.length ? cursos.map(c => {
    const bases = new Set(c.registros.map(r => r.BASE).filter(Boolean)).size;
    const ultima = c.registros.reduce((max, r) => r.FECHA > max ? r.FECHA : max, "");
    return `<article class="course-row">
      <div class="course-row-title"><span class="course-icon"><i class="fa-solid fa-book-open"></i></span><div><span class="section-kicker">Curso estandarizado</span><h3>${escapeHtml(c.curso)}</h3><small>Última actividad ${formatFechaDisplay(ultima)}</small></div></div>
      <div class="course-row-stats"><span><strong>${c.resumen.personasUnicas}</strong> personas</span><span><strong>${c.resumen.grupos}</strong> grupos</span><span><strong>${bases}</strong> bases</span><span class="${c.resumen.noAsistieron ? "critical-value" : "positive-value"}"><strong>${c.resumen.noAsistieron}</strong> ausencias</span></div>
      <div class="course-rate"><div><strong>${c.resumen.pctAsistencia}%</strong><span>asistencia</span></div><div class="base-attendance-track"><span style="width:${c.resumen.pctAsistencia}%"></span></div></div>
      <div class="course-row-actions"><button class="command-button secondary" type="button" data-course-records="${escapeHtml(c.curso)}">Ver registros</button><button class="command-button primary" type="button" data-open-course-profile="${escapeHtml(c.curso)}">Abrir detalle</button></div>
    </article>`;
  }).join("") : '<div class="surface empty-cell">No hay cursos para este filtro.</div>';
  host.onclick = event => {
    const button = event.target.closest("[data-course-records]");
    if (!button) return;
    event.stopPropagation();
    store.setFiltro("curso", button.dataset.courseRecords);
    window.location.hash = "#registros";
  };
}

export function abrirCurso(nombre) { abrirEntityDrawer("Curso", nombre, store.getCourse(nombre), "curso"); }

export function abrirEntityDrawer(kind, name, records, type) {
  const overlay = document.getElementById("entityOverlay");
  const content = document.getElementById("entityContent");
  const m = aggregateRecords(records);
  const sorted = records.slice().sort((a, b) => (b.FECHA || "").localeCompare(a.FECHA || "")).slice(0, 100);
  content.innerHTML = `<header class="drawer-header"><button class="drawer-close" data-close-entity aria-label="Cerrar"><i class="fa-solid fa-xmark"></i></button><span class="hero-kicker">${escapeHtml(kind)}</span><div class="drawer-title">${escapeHtml(name)}</div><div class="drawer-subtitle">${records.length} registros de asistencia</div></header><div class="drawer-body"><div class="drawer-stat-grid"><div class="kpi-card"><div class="kpi-value">${m.summary.registros}</div><div class="kpi-label">Registros</div></div><div class="kpi-card"><div class="kpi-value positive-value">${m.summary.asistieron}</div><div class="kpi-label">Asistieron</div></div><div class="kpi-card"><div class="kpi-value critical-value">${m.summary.noAsistieron}</div><div class="kpi-label">No asistieron</div></div><div class="kpi-card"><div class="kpi-value">${m.summary.pctAsistencia}%</div><div class="kpi-label">Asistencia</div></div></div><div class="section-title">Historial reciente</div><div class="drawer-table"><table class="enterprise-table"><thead><tr><th>Persona</th><th>Fecha</th><th>${type === "curso" ? "Grupo" : "Curso"}</th><th>Base</th><th>Instructor</th><th>Asistencia</th></tr></thead><tbody>${sorted.map(r => `<tr><td><span class="person-link" data-open-perfil="${escapeHtml(r._personKey)}">${escapeHtml(r.NOMBRES || "—")}</span></td><td>${formatFechaDisplay(r.FECHA)}</td><td>${escapeHtml(type === "curso" ? r.GRUPO || "—" : r.CURSO || "—")}</td><td>${escapeHtml(r.BASE || "—")}</td><td>${escapeHtml(r.INSTRUCTOR || "—")}</td><td>${asistenciaPill(r)}</td></tr>`).join("")}</tbody></table></div></div>`;
  overlay.classList.add("open");
}

export function cerrarEntityDrawer() { document.getElementById("entityOverlay")?.classList.remove("open"); }
export function renderCursoDetalle(_s, nombre) { abrirCurso(nombre); }
