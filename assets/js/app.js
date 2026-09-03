import { store } from "./store.js";
import { initRouter, navigate, route } from "./router.js";
import { initFiltros } from "./filtros.js";
import { initAsistencias, render as renderRegistros } from "./asistencias.js";
import { renderDashboard } from "./dashboard.js";
import { renderColaboradores } from "./colaboradores.js";
import { renderCursos, abrirCurso, cerrarEntityDrawer } from "./cursos.js";
import { renderGrupos, abrirGrupo } from "./grupos.js";
import { initPerfil, abrirPerfil, renderPerfil } from "./perfil.js";
import { initCertificados } from "./certificados.js";
import { renderEstado } from "./ui.js";
import { showToast } from "./utils.js";

const titles = { resumen: "Control de asistencia", registros: "Registro maestro", personas: "Personas", cursos: "Cursos", grupos: "Grupos" };
const renderers = { resumen: renderDashboard, registros: renderRegistros, personas: renderColaboradores, cursos: renderCursos, grupos: renderGrupos };

function renderCurrent() {
  const name = route();
  document.getElementById("pageTitle").textContent = titles[name];
  renderers[name]?.(store);
  renderPerfil(store);
}

function renderChrome() {
  renderEstado(store, "loadErrorPanel");
  const total = document.getElementById("totalRecords");
  if (total) total.textContent = store.sizeCrudo;
  document.getElementById("lastUpdated").textContent = store.ultimaActualizacion ? `Actualizado ${store.ultimaActualizacion}` : "Esperando datos";
}

window.actualizarDatos = async () => {
  const btn = document.getElementById("btnActualizarDatos");
  btn.disabled = true;
  const result = await store.actualizar();
  btn.disabled = false;
  showToast(result.ok ? "Datos sincronizados." : "No fue posible actualizar.", result.ok ? "success" : "danger");
};
window.reintentarCarga = () => store.connect();
window.navigate = navigate;

document.addEventListener("click", event => {
  const person = event.target.closest("[data-open-perfil]");
  if (person) { event.preventDefault(); abrirPerfil(person.dataset.openPerfil); return; }
  const course = event.target.closest("[data-open-course-profile]");
  if (course) { abrirCurso(course.dataset.openCourseProfile); return; }
  const group = event.target.closest("[data-open-group-profile]");
  if (group) { abrirGrupo(group.dataset.openGroupProfile); return; }
  if (event.target.closest("[data-close-entity]")) cerrarEntityDrawer();
});
document.getElementById("entityOverlay").addEventListener("click", e => { if (e.target.id === "entityOverlay") cerrarEntityDrawer(); });
document.getElementById("menuToggle").addEventListener("click", () => document.getElementById("sideRail").classList.toggle("open"));
document.querySelector(".primary-nav").addEventListener("click", () => document.getElementById("sideRail").classList.remove("open"));
document.getElementById("themeToggleBtn").addEventListener("click", () => setTimeout(renderCurrent, 0));

initFiltros();
initAsistencias();
initPerfil();
initCertificados();
initRouter(() => renderCurrent());
store.subscribe(() => { renderChrome(); renderCurrent(); });
store.iniciar();
