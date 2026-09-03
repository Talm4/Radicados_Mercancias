import { store } from "./store.js";
import { debounce } from "./utils.js";
import { escapeHtml } from "./ui.js";

const selectMap = { filtroBase: "base", filtroGrupo: "grupo", filtroCurso: "curso", filtroInstructor: "instructor", filtroSalon: "salon" };
let optionsVersion = -1;

export function initFiltros() {
  const host = document.getElementById("filtroBarContainer");
  host.innerHTML = `<div class="filter-shell">
    <div class="filter-row">
      <div class="search-control"><i class="fa-solid fa-magnifying-glass"></i><input id="searchInput" class="form-control" placeholder="Buscar persona, cédula, curso, grupo o instructor" autocomplete="off"></div>
      <select id="filtroBase" class="form-select filter-select" aria-label="Filtrar por base"><option value="">Todas las bases</option></select>
      <select id="filtroCurso" class="form-select filter-select" aria-label="Filtrar por curso"><option value="">Todos los cursos</option></select>
      <select id="filtroAsistio" class="form-select filter-select" aria-label="Filtrar asistencia"><option value="">Toda asistencia</option><option value="SÍ">Asistió</option><option value="NO">No asistió</option></select>
      <button class="icon-button" id="toggleMasFiltros" title="Más filtros" aria-label="Más filtros"><i class="fa-solid fa-sliders"></i></button>
      <button class="icon-button" id="btnLimpiarFiltros" title="Limpiar filtros" aria-label="Limpiar filtros"><i class="fa-solid fa-filter-circle-xmark"></i></button>
    </div>
    <div class="filter-more" id="masFiltrosBar">
      <input type="date" id="filtroFechaDesde" class="form-control filter-select" title="Desde">
      <input type="date" id="filtroFechaHasta" class="form-control filter-select" title="Hasta">
      <select id="filtroGrupo" class="form-select filter-select"><option value="">Todos los grupos</option></select>
      <select id="filtroInstructor" class="form-select filter-select"><option value="">Todos los instructores</option></select>
      <select id="filtroSalon" class="form-select filter-select"><option value="">Todos los salones</option></select>
      <select id="filtroSemestre" class="form-select filter-select"><option value="todos">Todo el año</option><option value="1">Semestre 1</option><option value="2">Semestre 2</option></select>
      <select id="filtroIntegridad" class="form-select filter-select"><option value="">Toda calidad</option><option value="duplicados">Posibles duplicados</option><option value="revision">Requiere revisión</option></select>
    </div>
    <div class="filter-meta"><div id="filterChips"></div><div id="filterSummary" class="filter-summary"></div></div>
  </div>`;

  const debouncedSearch = debounce(value => store.setFiltro("busqueda", value), 220);
  document.getElementById("searchInput").addEventListener("input", e => debouncedSearch(e.target.value));
  Object.entries(selectMap).forEach(([id, key]) => document.getElementById(id).addEventListener("change", e => store.setFiltro(key, e.target.value)));
  document.getElementById("filtroAsistio").addEventListener("change", e => store.setFiltro("asistio", e.target.value));
  document.getElementById("filtroFechaDesde").addEventListener("change", e => store.setFiltro("desde", e.target.value));
  document.getElementById("filtroFechaHasta").addEventListener("change", e => store.setFiltro("hasta", e.target.value));
  document.getElementById("filtroSemestre").addEventListener("change", e => store.setFiltro("semestre", e.target.value));
  document.getElementById("filtroIntegridad").addEventListener("change", e => store.setFiltros({ soloDuplicados: e.target.value === "duplicados", soloRevision: e.target.value === "revision" }));
  document.getElementById("toggleMasFiltros").addEventListener("click", () => document.getElementById("masFiltrosBar").classList.toggle("open"));
  document.getElementById("btnLimpiarFiltros").addEventListener("click", () => store.clearFiltros());
  document.getElementById("filterChips").addEventListener("click", e => {
    const chip = e.target.closest("[data-filter-key]");
    if (!chip) return;
    const key = chip.dataset.filterKey;
    if (key === "soloDuplicados" || key === "soloRevision") store.setFiltro(key, false);
    else store.setFiltro(key, key === "semestre" ? "todos" : "");
  });
  store.subscribe(renderFilters);
  renderFilters(store);
}

function fillSelect(id, values, allLabel) {
  const el = document.getElementById(id);
  const previous = el.value;
  el.innerHTML = `<option value="">${allLabel}</option>${values.map(v => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join("")}`;
  el.value = previous;
}

function renderOptions(s) {
  if (optionsVersion === s.dataVersion) return;
  optionsVersion = s.dataVersion;
  fillSelect("filtroBase", s.options("base"), "Todas las bases");
  fillSelect("filtroCurso", s.options("curso"), "Todos los cursos");
  fillSelect("filtroGrupo", s.options("grupo"), "Todos los grupos");
  fillSelect("filtroInstructor", s.options("instructor"), "Todos los instructores");
  fillSelect("filtroSalon", s.options("salon"), "Todos los salones");
}

function syncControls(s) {
  const ids = { searchInput: "busqueda", filtroBase: "base", filtroCurso: "curso", filtroGrupo: "grupo", filtroInstructor: "instructor", filtroSalon: "salon", filtroAsistio: "asistio", filtroFechaDesde: "desde", filtroFechaHasta: "hasta", filtroSemestre: "semestre" };
  Object.entries(ids).forEach(([id, key]) => {
    const el = document.getElementById(id);
    if (el && document.activeElement !== el) el.value = s.filtros[key] ?? "";
  });
  document.getElementById("filtroIntegridad").value = s.filtros.soloDuplicados ? "duplicados" : s.filtros.soloRevision ? "revision" : "";
}

function renderFilters(s) {
  renderOptions(s);
  syncControls(s);
  const chips = s.filtrosActivos();
  document.getElementById("filterChips").innerHTML = chips.map(x => `<button class="filter-chip" data-filter-key="${x.clave}">${escapeHtml(x.etiqueta)}${x.valor ? `: ${escapeHtml(x.valor)}` : ""} <i class="fa-solid fa-xmark"></i></button>`).join(" ");
  const count = s.metrics.summary.registros;
  document.getElementById("filterSummary").innerHTML = `<strong>${count.toLocaleString("es-CO")}</strong> ${count === 1 ? "registro" : "registros"}`;
}
