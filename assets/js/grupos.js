import { agregarPorGrupo } from "./agregados.js";
import { abrirEntityDrawer } from "./cursos.js";
import { escapeHtml } from "./ui.js";
import { formatFechaDisplay } from "./utils.js";
import { store } from "./store.js";

export function renderGrupos(s) {
  const groups = agregarPorGrupo(s.filtered);
  document.getElementById("groupCards").innerHTML = groups.length ? groups.map(g => `<article class="entity-card" data-open-group-profile="${escapeHtml(g.grupo)}"><div><span class="section-kicker">Grupo · ${escapeHtml(g.base || "Sin base")}</span><h3>${escapeHtml(g.grupo)}</h3><p>${escapeHtml(g.curso || "Curso sin asignar")}</p></div><div class="entity-metrics"><div><strong>${g.resumen.personasUnicas}</strong><span>Personas</span></div><div><strong>${g.resumen.noAsistieron}</strong><span>Ausencias</span></div><div><strong>${g.resumen.pctAsistencia}%</strong><span>Asistencia</span></div></div><div class="entity-progress"><div style="width:${g.resumen.pctAsistencia}%"></div></div><div class="entity-foot"><span>${formatFechaDisplay(g.fecha)} · ${escapeHtml(g.instructor || "Sin instructor")}</span><span>Ver perfil <i class="fa-solid fa-arrow-right"></i></span></div></article>`).join("") : '<div class="surface empty-cell">No hay grupos para este filtro.</div>';
}

export function abrirGrupo(nombre) { abrirEntityDrawer("Grupo", nombre, store.getGroup(nombre), "grupo"); }
export function renderGrupoDetalle(_s, nombre) { abrirGrupo(nombre); }

