// ==========================================================================
// TALMA DATA CENTER — Vista Asistencias (tabla + CRUD + carga masiva)
// Conserva toda la lógica original: crear, editar, eliminar, selección
// múltiple, edición masiva, exportación y carga masiva con validación.
// ==========================================================================
import { db, colRef, CAMPOS } from "./firebase-config.js";
import { doc, setDoc, addDoc, deleteDoc, writeBatch } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import {
  showToast, validarRegistro, normalizarFilaExcel,
  formatFechaDisplay, formatHoraDisplay, parseFechaFlexible, normalizarNombreCurso,
  CONSOLIDADO_HEADERS, detectarFilaEncabezados, registroAFormatoConsolidado,
} from "./utils.js";
import { store } from "./store.js";
import { escapeHtml } from "./ui.js";
import {
  normalizarCedula, clasificarRegistro, conTrazas, claveCitacion,
} from "./capacitacion.js";
import { normalizarNumeroCertificado } from "./certificados-core.js";
import {
  MAX_ARCHIVO_MB, TAMANO_LOTE_FIRESTORE, TAMANO_PAGINA_PREVIA,
  categorizarFilasImportacion, cederAlNavegador, crearIdTrabajo,
  eliminarTrabajoImportacion, guardarTrabajoImportacion, huellaArchivo,
  idDeterministaRegistro, leerTrabajoPendiente, lotesDe, paginaPrevia,
} from "./importacion-resiliente.js";
import { iniciarRevisionNotasManual } from "./notas.js";

let selectedIds = new Set();
let pendingImport = { filas: [], resumen: null, categorias: null, archivo: null };
let previewCategory = "nuevos";
let previewPage = 1;
let previewSize = TAMANO_PAGINA_PREVIA;
let activeUploadJob = null;
let gridEditMode = false;
const pendingGridEdits = new Map();

let sortKey = "FECHA";
let sortDir = -1;
let page = 1;
let pageSize = 25;
let sortedCache = { key: "", rows: [] };

const COLUMNAS = [
  { key: "PROGRAMA", label: "Programa" },
  { key: "CURSO", label: "Curso" },
  { key: "INTENSIDAD", label: "Intensidad" },
  { key: "BASE", label: "Base" },
  { key: "FECHA", label: "Fecha" },
  { key: "HORA", label: "Hora" },
  { key: "SALON", label: "Salón" },
  { key: "GRUPO", label: "Grupo" },
  { key: "ID", label: "ID" },
  { key: "NOMBRES", label: "Nombres y apellidos" },
  { key: "CARGO", label: "Cargo" },
  { key: "CORREO", label: "Correo" },
  { key: "INSTRUCTOR", label: "Instructor" },
  { key: "ASISTIO", label: "Asistió" },
  { key: "NOTA", label: "Nota" },
  { key: "OBSERVACION", label: "Observación" },
];

let modalRegistro, modalCargaMasiva, modalEdicionMasiva, modalValidacion;

export function initAsistencias() {
  modalRegistro = new bootstrap.Modal(document.getElementById("modalRegistro"));
  modalCargaMasiva = new bootstrap.Modal(document.getElementById("modalCargaMasiva"));
  modalEdicionMasiva = new bootstrap.Modal(document.getElementById("modalEdicionMasiva"));
  modalValidacion = new bootstrap.Modal(document.getElementById("modalValidacion"));

  document.querySelectorAll("#asistenciasTable thead th[data-sort]").forEach(th => {
    th.addEventListener("click", () => sortTabla(th.dataset.sort));
  });

  document.getElementById("pagerSize").addEventListener("change", (e) => {
    pageSize = e.target.value === "todos" ? Infinity : Number(e.target.value);
    page = 1;
    render(store);
  });

  document.getElementById("pagerPrev").addEventListener("click", () => { page--; render(store); });
  document.getElementById("pagerNext").addEventListener("click", () => { page++; render(store); });

  document.getElementById("previewPrev")?.addEventListener("click", () => {
    previewPage--;
    renderPrevisualizacionActiva();
  });
  document.getElementById("previewNext")?.addEventListener("click", () => {
    previewPage++;
    renderPrevisualizacionActiva();
  });
  document.getElementById("previewPageSize")?.addEventListener("change", e => {
    previewSize = Number(e.target.value) || TAMANO_PAGINA_PREVIA;
    previewPage = 1;
    renderPrevisualizacionActiva();
  });
  document.querySelectorAll("#modalValidacion [data-preview-category]").forEach(tab => {
    tab.addEventListener("shown.bs.tab", () => {
      previewCategory = tab.dataset.previewCategory;
      previewPage = 1;
      renderPrevisualizacionActiva();
    });
  });

  detectarCargaPendiente();
}

export function render(s) {
  const data = ordenar(s.filtered);
  const total = data.length;
  const pagina = pageSize === Infinity ? 1 : page;
  const pageCount = pageSize === Infinity ? 1 : Math.max(1, Math.ceil(total / pageSize));
  if (pageSize !== Infinity && page > pageCount) page = pageCount;
  const inicio = pageSize === Infinity ? 0 : (page - 1) * pageSize;
  const slice = pageSize === Infinity ? data : data.slice(inicio, inicio + pageSize);

  renderHeaders();
  renderTbody(slice, s.estado);
  renderPager(total, page, pageCount, inicio, slice.length);
  renderMobileCards(slice);
  updateBulkBar();
}

/* ============================== ORDENAMIENTO ============================== */
function sortTabla(key) {
  if (sortKey === key) sortDir = -sortDir;
  else { sortKey = key; sortDir = key === "FECHA" ? -1 : 1; }
  page = 1;
  render(store);
}

function ordena(regA, regB, key) {
  let va = String(regA[key] ?? "");
  let vb = String(regB[key] ?? "");
  if (key === "NOTA") {
    const na = parseFloat(va), nb = parseFloat(vb);
    if (!isNaN(na) && !isNaN(nb)) return na - nb;
  }
  return va.localeCompare(vb, "es", { numeric: true });
}

function ordenar(data) {
  const key = `${store.currentFilterKey}|${sortKey}|${sortDir}`;
  if (sortedCache.key === key) return sortedCache.rows;
  const copia = [...data];
  copia.sort((a, b) => ordena(a, b, sortKey) * sortDir);
  sortedCache = { key, rows: copia };
  return copia;
}

function renderHeaders() {
  document.querySelectorAll("#asistenciasTable thead th[data-sort]").forEach(th => {
    if (!th.dataset.label) th.dataset.label = th.textContent.trim();
    let ind = "";
    if (th.dataset.sort === sortKey) ind = sortDir === 1 ? "▲" : "▼";
    th.innerHTML = `${escapeHtml(th.dataset.label)}<span class="sort-ind">${ind}</span>`;
    th.classList.add("th-sort");
  });
}

/* ============================== TABLA ============================== */
function renderTbody(slice, estado) {
  const tbody = document.getElementById("tableBody");
  const totalCols = 2 + COLUMNAS.length;

  if (estado === "loading" && slice.length === 0) {
    tbody.innerHTML = Array.from({ length: 8 }, () =>
      `<tr><td colspan="${totalCols}"><div class="skeleton"></div></td></tr>`).join("");
    return;
  }
  if (slice.length === 0) {
    tbody.innerHTML = `<tr><td colspan="${totalCols}" class="text-center py-5 text-muted">No hay registros que coincidan con los filtros aplicados.</td></tr>`;
    return;
  }

  tbody.innerHTML = slice.map(item => {
    const checked = selectedIds.has(item._docId) ? "checked" : "";
    const rowClass = selectedIds.has(item._docId) ? "row-selected" : "";
    const cells = COLUMNAS.map(c => filaCelda(item, c.key)).join("");
    return `
      <tr class="${rowClass}">
        <td><input type="checkbox" class="form-check-input row-check" data-id="${item._docId}" ${checked}></td>
        <td>
          <button class="btn btn-sm btn-outline-navy py-0 px-1" title="Editar" onclick="editarRegistro('${item._docId}')"><i class="fa-solid fa-pen"></i></button>
          <button class="btn btn-sm btn-outline-danger py-0 px-1 ms-1" title="Eliminar" onclick="eliminarRegistro('${item._docId}')"><i class="fa-solid fa-trash"></i></button>
        </td>
        ${cells}
      </tr>`;
  }).join("");

  tbody.querySelectorAll(".row-check").forEach(chk => {
    chk.addEventListener("change", (e) => {
      const id = e.target.dataset.id;
      if (e.target.checked) selectedIds.add(id); else selectedIds.delete(id);
      e.target.closest("tr").classList.toggle("row-selected", e.target.checked);
      updateBulkBar();
    });
  });

  if (gridEditMode) activarEventosEdicionRapida(tbody);

  const allBox = document.getElementById("selectAllCheckbox");
  if (allBox) allBox.checked = slice.length > 0 && slice.every(d => selectedIds.has(d._docId));
}

function filaCelda(item, key) {
  const pendiente = pendingGridEdits.get(item._docId)?.[key];
  const valor = pendiente !== undefined ? pendiente : (item[key] || "");
  if (gridEditMode) {
    const dirty = pendiente !== undefined ? " is-dirty" : "";
    return `<td class="sheet-cell${dirty}" contenteditable="true" spellcheck="false" tabindex="0" data-grid-id="${escapeHtml(item._docId)}" data-grid-field="${key}" data-original="${escapeHtml(item[key] || "")}">${escapeHtml(valor)}</td>`;
  }
  const v = escapeHtml(valor);
  switch (key) {
    case "ID": return `<td class="id-cell">${v || "—"}</td>`;
    case "NOMBRES": return `<td title="${v}">${v
      ? `<span class="person-link" data-open-perfil="${escapeHtml(item.ID || "")}">${v}</span>` : "—"}</td>`;
    case "CURSO": return `<td title="${v}">${v || "—"}</td>`;
    case "PROGRAMA": return `<td title="${v}">${v || "—"}</td>`;
    case "FECHA": return `<td class="mono">${formatFechaDisplay(item.FECHA)}</td>`;
    case "HORA": return `<td class="mono">${escapeHtml(formatHoraDisplay(item.HORA))}</td>`;
    case "ASISTIO": {
      const esSi = (item.ASISTIO || "SÍ").toUpperCase() !== "NO";
      return `<td><span class="hz-pill ${esSi ? "si" : "no"}"><span class="hz-dot"></span>${esSi ? "SÍ" : "NO"}</span></td>`;
    }
    case "NOTA": {
      const verificada = item.NOTA_ORIGEN === "Reporte Aprende Talma";
      return `<td><span class="grade-value">${v || "—"}</span>${verificada ? '<i class="fa-solid fa-circle-check grade-verified" title="Verificada con el reporte de Aprende Talma" aria-label="Nota verificada"></i>' : ""}</td>`;
    }
    case "OBSERVACION": return `<td title="${v}">${v || "—"}</td>`;
    default: return `<td>${v || "—"}</td>`;
  }
}

function valorCelda(cell) {
  return cell.innerText.replace(/\r?\n/g, " ").trim();
}

function registrarCambioCelda(cell) {
  const id = cell.dataset.gridId;
  const field = cell.dataset.gridField;
  const item = store.getRecord(id);
  if (!item) return;
  const value = valorCelda(cell);
  const original = String(item[field] || "").trim();
  const changes = { ...(pendingGridEdits.get(id) || {}) };
  if (value === original) delete changes[field];
  else changes[field] = value;
  if (Object.keys(changes).length) pendingGridEdits.set(id, changes);
  else pendingGridEdits.delete(id);
  cell.classList.toggle("is-dirty", value !== original);
  actualizarBarraEdicion();
}

function pegarDesdeExcel(event, startCell) {
  const text = event.clipboardData?.getData("text/plain");
  if (!text || (!text.includes("\t") && !text.includes("\n"))) return;
  event.preventDefault();
  const rows = text.replace(/\r/g, "").replace(/\n$/, "").split("\n").map(row => row.split("\t"));
  const rowEls = [...document.querySelectorAll("#tableBody tr")];
  const startRow = rowEls.indexOf(startCell.closest("tr"));
  const startCol = COLUMNAS.findIndex(col => col.key === startCell.dataset.gridField);
  rows.forEach((values, rowOffset) => {
    const row = rowEls[startRow + rowOffset];
    if (!row) return;
    values.forEach((value, colOffset) => {
      const key = COLUMNAS[startCol + colOffset]?.key;
      if (!key) return;
      const target = row.querySelector(`[data-grid-field="${key}"]`);
      if (!target) return;
      target.textContent = value;
      registrarCambioCelda(target);
    });
  });
}

function activarEventosEdicionRapida(tbody) {
  tbody.querySelectorAll(".sheet-cell").forEach(cell => {
    cell.addEventListener("input", () => registrarCambioCelda(cell));
    cell.addEventListener("blur", () => registrarCambioCelda(cell));
    cell.addEventListener("paste", event => pegarDesdeExcel(event, cell));
    cell.addEventListener("keydown", event => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        window.guardarGridEdit();
      } else if (event.key === "Enter") {
        event.preventDefault();
        const row = cell.closest("tr")?.nextElementSibling;
        row?.querySelector(`[data-grid-field="${cell.dataset.gridField}"]`)?.focus();
      }
    });
  });
}

function actualizarBarraEdicion() {
  const bar = document.getElementById("gridEditBar");
  const count = document.getElementById("gridEditCount");
  const button = document.getElementById("btnEditarTabla");
  bar?.classList.toggle("d-none", !gridEditMode);
  document.querySelector("#view-registros .data-surface")?.classList.toggle("grid-editing", gridEditMode);
  if (count) count.textContent = pendingGridEdits.size
    ? `${pendingGridEdits.size} registro(s) con cambios`
    : "Sin cambios";
  if (button) button.innerHTML = gridEditMode
    ? '<i class="fa-solid fa-xmark"></i>Salir de edición'
    : '<i class="fa-solid fa-table-cells"></i>Editar tabla';
}

function normalizarCambioGrid(field, value) {
  const text = String(value ?? "").trim();
  if (field === "ID") return normalizarCedula(text);
  if (field === "CURSO") return normalizarNombreCurso(text);
  if (field === "FECHA") {
    const fecha = parseFechaFlexible(text);
    return fecha.valid && !fecha.empty ? fecha.iso : text;
  }
  if (field === "ASISTIO") return text.toUpperCase() === "NO" ? "NO" : "SÍ";
  if (field === "NOTA" && text) {
    const numero = Number(text.replace(",", "."));
    return Number.isFinite(numero) ? String(Math.round(numero)) : text;
  }
  return text;
}

window.toggleGridEdit = function () {
  if (gridEditMode && pendingGridEdits.size && !confirm("Hay cambios sin guardar. ¿Salir y descartarlos?")) return;
  if (gridEditMode) pendingGridEdits.clear();
  gridEditMode = !gridEditMode;
  actualizarBarraEdicion();
  render(store);
};

window.cancelarGridEdit = function () {
  if (pendingGridEdits.size && !confirm("¿Descartar los cambios realizados en la tabla?")) return;
  pendingGridEdits.clear();
  gridEditMode = false;
  actualizarBarraEdicion();
  render(store);
};

window.guardarGridEdit = async function () {
  if (!pendingGridEdits.size) return showToast("No hay cambios para guardar.", "warning");
  const operaciones = [];
  const errores = [];
  pendingGridEdits.forEach((changes, docId) => {
    const original = store.getRecord(docId);
    if (!original) return errores.push(`El registro ${docId} ya no está disponible.`);
    const normalizados = Object.fromEntries(Object.entries(changes).map(([field, value]) => [field, normalizarCambioGrid(field, value)]));
    const combinado = { ...original, ...normalizados };
    const validacion = validarRegistro(combinado);
    if (!validacion.valido) errores.push(`${combinado.NOMBRES || combinado.ID}: ${validacion.errores.join(", ")}`);
    else operaciones.push({ docId, original, changes: normalizados });
  });
  if (errores.length) {
    showToast(`Corrige ${errores.length} registro(s). ${errores[0]}`, "danger");
    return;
  }
  const button = document.querySelector("#gridEditBar .command-button.primary");
  if (button) { button.disabled = true; button.textContent = "Guardando..."; }
  try {
    for (let inicio = 0; inicio < operaciones.length; inicio += 450) {
      const batch = writeBatch(db);
      operaciones.slice(inicio, inicio + 450).forEach(op => {
        const datos = conTrazas(op.changes, "Edición rápida", "actualizar", op.original);
        batch.set(doc(db, "capacitaciones", op.docId), datos, { merge: true });
      });
      await batch.commit();
    }
    showToast(`${operaciones.length} registro(s) actualizados.`, "success");
    pendingGridEdits.clear();
    gridEditMode = false;
    actualizarBarraEdicion();
    render(store);
  } catch (error) {
    console.error(error);
    showToast("No se pudieron guardar todos los cambios.", "danger");
  } finally {
    if (button) { button.disabled = false; button.textContent = "Guardar cambios"; }
  }
};

/* ============================== TARJETAS MÓVILES ============================== */
function renderMobileCards(slice) {
  const cont = document.getElementById("mobileCards");
  if (!cont) return;
  if (slice.length === 0) { cont.innerHTML = '<div class="text-center py-4 text-muted small">Sin resultados.</div>'; return; }
  cont.innerHTML = slice.map(item => {
    const esSi = (item.ASISTIO || "SÍ").toUpperCase() !== "NO";
    const nombre = escapeHtml(item.NOMBRES || "(Sin nombre)");
    return `
    <div class="mobile-card">
      <div class="mc-head">
        <div class="mc-title">
          <span class="person-link" data-open-perfil="${escapeHtml(item.ID || "")}">${nombre}</span>
        </div>
        <span class="hz-pill ${esSi ? "si" : "no"}"><span class="hz-dot"></span>${esSi ? "SÍ" : "NO"}</span>
      </div>
      <dl class="mc-grid">
        <dt>ID</dt><dd class="mono">${escapeHtml(item.ID || "—")}</dd>
        <dt>Fecha</dt><dd>${formatFechaDisplay(item.FECHA)}</dd>
        <dt>Curso</dt><dd>${escapeHtml(item.CURSO || "—")}</dd>
        <dt>Base</dt><dd>${escapeHtml(item.BASE || "—")}</dd>
        <dt>Grupo</dt><dd>${escapeHtml(item.GRUPO || "—")}</dd>
        <dt>Nota</dt><dd>${escapeHtml(item.NOTA || "—")}</dd>
      </dl>
      <div class="mt-2">
        <button class="btn btn-sm btn-outline-navy py-1 px-2 me-1" onclick="editarRegistro('${item._docId}')"><i class="fa-solid fa-pen me-1"></i>Editar</button>
        <button class="btn btn-sm btn-outline-danger py-1 px-2" onclick="eliminarRegistro('${item._docId}')"><i class="fa-solid fa-trash me-1"></i>Eliminar</button>
      </div>
    </div>`;
  }).join("");
}

/* ============================== PAGINACIÓN ============================== */
function renderPager(total, pagina, pageCount, inicio, visible) {
  const info = document.getElementById("pagerInfo");
  const prev = document.getElementById("pagerPrev");
  const next = document.getElementById("pagerNext");
  if (pageSize === Infinity || total === 0) {
    info.innerText = `${total} registro(s)`;
    prev.disabled = next.disabled = true;
  } else {
    info.innerText = `Página ${pagina} de ${pageCount} · mostrando ${visible} de ${total} registro(s)`;
    prev.disabled = pagina <= 1;
    next.disabled = pagina >= pageCount;
  }
}

function updateBulkBar() {
  const bar = document.getElementById("bulkBar");
  if (!bar) return;
  const contador = document.getElementById("bulkCount");
  if (contador) contador.innerText = selectedIds.size;
  bar.classList.toggle("show", selectedIds.size > 0);
}

window.toggleSelectAll = function (checkbox) {
  const data = store.filtered;
  ordenar(data).forEach(item => {
    if (checkbox.checked) selectedIds.add(item._docId); else selectedIds.delete(item._docId);
  });
  render(store);
};

window.limpiarSeleccion = function () {
  selectedIds.clear();
  render(store);
};

/* ============================== CRUD INDIVIDUAL ============================== */
window.abrirModalNuevo = function () {
  document.getElementById("registroForm").reset();
  document.getElementById("recordDocId").value = "";
  document.getElementById("field_PROGRAMA").value = "Mercancías Peligrosas";
  document.getElementById("field_ASISTIO").value = "SÍ";
  document.getElementById("modalTitle").innerText = "Nuevo Registro";
  limpiarValidacionForm();
  modalRegistro.show();
};

window.editarRegistro = function (docId) {
  const item = store.getRecord(docId);
  if (!item) return;
  document.getElementById("recordDocId").value = docId;
  CAMPOS.forEach(campo => {
    const el = document.getElementById("field_" + campo);
    if (el) el.value = item[campo] || (campo === "ASISTIO" ? "SÍ" : "");
  });
  document.getElementById("modalTitle").innerText = "Editar Registro";
  limpiarValidacionForm();
  modalRegistro.show();
};

function limpiarValidacionForm() {
  document.querySelectorAll("#registroForm .field-invalid").forEach(el => el.classList.remove("field-invalid"));
  document.getElementById("formErrors").innerHTML = "";
}

window.guardarRegistro = async function () {
  const docId = document.getElementById("recordDocId").value;
  const dataObj = {};
  CAMPOS.forEach(campo => {
    const el = document.getElementById("field_" + campo);
    dataObj[campo] = el ? el.value.trim() : "";
  });

  // Normaliza la cédula antes de validar (identificador, no número).
  dataObj.ID = normalizarCedula(dataObj.ID);
  dataObj.CURSO = normalizarNombreCurso(dataObj.CURSO);

  const { valido, errores } = validarRegistro(dataObj);
  limpiarValidacionForm();
  if (!valido) {
    document.getElementById("formErrors").innerHTML = errores.map(e =>
      `<div><i class="fa-solid fa-circle-exclamation me-1"></i>${e}</div>`).join("");
    if (!dataObj.ID || !/^\d{5,12}$/.test(dataObj.ID)) document.getElementById("field_ID").classList.add("field-invalid");
    if (!dataObj.NOMBRES || dataObj.NOMBRES.length < 4) document.getElementById("field_NOMBRES").classList.add("field-invalid");
    if (dataObj.CORREO && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(dataObj.CORREO)) document.getElementById("field_CORREO").classList.add("field-invalid");
    return;
  }

  try {
    if (docId) {
      await setDoc(doc(db, "capacitaciones", docId), conTrazas(dataObj, "Edición manual", "actualizar"));
      showToast("Registro actualizado correctamente.", "success");
    } else {
      // UPSERT individual: antes de crear, verifica si ya existe la misma
      // persona (CÉDULA) con el mismo curso dentro de la vigencia.
      //   - Existe vigente  → ACTUALIZA ese registro (nunca duplica).
      //   - Vencido o nunca → CREA un registro nuevo (conserva historial).
      const hoy = store.estadoHoy;
      const similar = store.getPerson(dataObj.ID).find(e =>
        normalizarCedula(e.ID) === dataObj.ID &&
        (e.CURSO || "").trim().toUpperCase() === (dataObj.CURSO || "").trim().toUpperCase()
      );
      if (similar) {
        const clase = clasificarRegistro(dataObj, [similar], hoy);
        if (clase.accion === "nuevo") {
          await addDoc(colRef, conTrazas(dataObj, "Registro individual", "crear"));
          showToast("Registro creado (nueva recurrencia tras vigencia vencida).", "success");
        } else if (clase.accion === "sin_cambios") {
          showToast("Ya existe un registro idéntico de esta persona y curso.", "warning");
        } else {
          await setDoc(doc(db, "capacitaciones", similar._docId), conTrazas(dataObj, "Registro individual", "actualizar", similar));
          showToast("Registro existente actualizado (se evitó un duplicado).", "success");
        }
      } else {
        await addDoc(colRef, conTrazas(dataObj, "Registro individual", "crear"));
        showToast("Registro creado correctamente.", "success");
      }
    }
    modalRegistro.hide();
  } catch (err) {
    console.error(err);
    showToast("No se pudo guardar el registro.", "danger");
  }
};

window.eliminarRegistro = async function (docId) {
  const item = store.getRecord(docId);
  if (!item) return;
  if (!confirm(`¿Eliminar el registro de "${item.NOMBRES || "sin nombre"}"? Esta acción no se puede deshacer.`)) return;
  try {
    await deleteDoc(doc(db, "capacitaciones", docId));
    selectedIds.delete(docId);
    showToast("Registro eliminado.", "success");
  } catch (err) {
    console.error(err);
    showToast("No se pudo eliminar el registro.", "danger");
  }
};

/* ============================== ACCIONES MASIVAS ============================== */
window.eliminarSeleccionados = async function () {
  if (selectedIds.size === 0) return;
  if (!confirm(`¿Eliminar ${selectedIds.size} registro(s) seleccionados? Esta acción no se puede deshacer.`)) return;
  try {
    const ids = [...selectedIds];
    for (let i = 0; i < ids.length; i += 450) {
      const batch = writeBatch(db);
      ids.slice(i, i + 450).forEach(id => batch.delete(doc(db, "capacitaciones", id)));
      await batch.commit();
    }
    showToast(`${ids.length} registro(s) eliminados.`, "success");
    selectedIds.clear();
  } catch (err) {
    console.error(err);
    showToast("Error al eliminar los registros seleccionados.", "danger");
  }
};

window.abrirEdicionMasiva = function () {
  if (selectedIds.size === 0) return;
  document.getElementById("bulkEditCount").innerText = selectedIds.size;
  document.getElementById("formEdicionMasiva").reset();
  document.querySelectorAll("#formEdicionMasiva .bulk-field-toggle").forEach(chk => {
    chk.checked = false;
    toggleBulkField(chk);
  });
  modalEdicionMasiva.show();
};

window.toggleBulkField = function (checkbox) {
  const target = document.getElementById(checkbox.dataset.target);
  if (target) target.disabled = !checkbox.checked;
};

window.aplicarEdicionMasiva = async function () {
  const campos = ["INSTRUCTOR", "FECHA", "HORA", "SALON", "GRUPO", "BASE", "CURSO", "PROGRAMA", "ASISTIO"];
  const cambios = {};
  campos.forEach(campo => {
    const chk = document.querySelector(`.bulk-field-toggle[data-campo="${campo}"]`);
    if (chk && chk.checked) {
      const input = document.getElementById("bulk_" + campo);
      cambios[campo] = input.value.trim();
    }
  });
  if (Object.keys(cambios).length === 0) {
    showToast("Selecciona al menos un campo para actualizar.", "warning");
    return;
  }
  if (cambios.FECHA) {
    const f = parseFechaFlexible(cambios.FECHA);
    if (!f.valid) { showToast("La fecha ingresada no es válida.", "danger"); return; }
    cambios.FECHA = f.iso;
  }
  if (Object.hasOwn(cambios, "CURSO")) cambios.CURSO = normalizarNombreCurso(cambios.CURSO);
  try {
    const ids = [...selectedIds];
    for (let i = 0; i < ids.length; i += 450) {
      const batch = writeBatch(db);
      ids.slice(i, i + 450).forEach(id => batch.set(doc(db, "capacitaciones", id), cambios, { merge: true }));
      await batch.commit();
    }
    showToast(`${ids.length} registro(s) actualizados masivamente.`, "success");
    modalEdicionMasiva.hide();
    selectedIds.clear();
  } catch (err) {
    console.error(err);
    showToast("Error al aplicar la edición masiva.", "danger");
  }
};

/* ============================== EXPORTAR EXCEL ============================== */
window.exportarExcel = function () {
  const data = store.filtered;
  if (data.length === 0) return showToast("No hay datos visibles para exportar.", "warning");
  const cleanData = data.map(registroAFormatoConsolidado);
  const ws = XLSX.utils.json_to_sheet(cleanData, { header: CONSOLIDADO_HEADERS });
  ws["!autofilter"] = { ref: `A1:Z${cleanData.length + 1}` };
  ws["!cols"] = CONSOLIDADO_HEADERS.map(header => ({ wch: Math.min(38, Math.max(10, header.length + 2)) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Hoja1");
  XLSX.writeFile(wb, `Consolidado_Radicacion_MP_${new Date().toISOString().slice(0, 10)}.xlsx`);
  showToast(`Exportados ${cleanData.length} registro(s) a Excel.`, "success");
};

function encontrarHojaOperativa(workbook) {
  let mejor = null;
  workbook.SheetNames.forEach(nombre => {
    const sheet = workbook.Sheets[nombre];
    if (!sheet?.["!ref"]) return;
    const range = XLSX.utils.decode_range(sheet["!ref"]);
    const previewRange = {
      s: { r: range.s.r, c: range.s.c },
      e: { r: Math.min(range.e.r, range.s.r + 19), c: range.e.c },
    };
    const preview = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", blankrows: true, range: previewRange });
    const detected = detectarFilaEncabezados(preview);
    if (!detected) return;
    const candidate = { ...detected, sheet, nombre, headerRow: range.s.r + detected.index };
    if (!mejor || candidate.puntaje > mejor.puntaje) mejor = candidate;
  });
  return mejor;
}

/* ============================== CARGA MASIVA ============================== */
window.procesarCargaMasiva = function () {
  const fileInput = document.getElementById("excelFileInput");
  const file = fileInput.files[0];
  const statusDiv = document.getElementById("bulkStatus");
  if (!file) return showToast("Selecciona un archivo Excel o CSV.", "warning");
  if (activeUploadJob?.estado === "pausado" || activeUploadJob?.estado === "procesando") {
    return showToast("Hay una carga pendiente. Reanúdala o descártala antes de iniciar otro archivo.", "warning");
  }
  if (file.size > MAX_ARCHIVO_MB * 1024 * 1024) {
    return showToast(`El archivo supera ${MAX_ARCHIVO_MB} MB. Divídelo en archivos más pequeños para evitar que el navegador se quede sin memoria.`, "danger");
  }
  statusDiv.innerText = "Leyendo archivo...";
  const reader = new FileReader();
  reader.onload = async function (e) {
    try {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: "array" });
      const selected = encontrarHojaOperativa(workbook);
      if (!selected) {
        statusDiv.innerText = "";
        showToast("No se encontró una hoja con las columnas ID y Nombres y apellidos.", "danger");
        return;
      }
      statusDiv.innerText = `Leyendo ${selected.nombre}...`;
      const jsonData = XLSX.utils.sheet_to_json(selected.sheet, { defval: "", range: selected.headerRow });
      if (jsonData.length === 0) {
        statusDiv.innerText = "";
        showToast("El archivo no contiene filas de datos.", "warning");
        return;
      }
      const mapa = selected.mapa;
      if (!mapa.ID || !mapa.NOMBRES) {
        statusDiv.innerText = "";
        showToast("No se pudo identificar las columnas ID y/o Nombres. Revisa los encabezados del archivo.", "danger");
        return;
      }
      // 1) VALIDAR y limpiar cada fila (cédula, nombre, curso, fechas).
      const filas = [];
      const bloque = 250;
      for (let inicio = 0; inicio < jsonData.length; inicio += bloque) {
        const fin = Math.min(inicio + bloque, jsonData.length);
        statusDiv.innerText = `Validando ${fin.toLocaleString("es-CO")} de ${jsonData.length.toLocaleString("es-CO")} filas...`;
        for (let idx = inicio; idx < fin; idx++) {
          const rec = normalizarFilaExcel(jsonData[idx], mapa);
          if (!rec.PROGRAMA) rec.PROGRAMA = "Mercancías Peligrosas";
          rec.ID = normalizarCedula(rec.ID);
          rec.CURSO = normalizarNombreCurso(rec.CURSO);
          const { errores } = validarRegistro(rec);
          const erroresFinal = [...errores];
          if (rec._fechaValida === false) erroresFinal.push("Fecha con formato irreconocible");
          delete rec._fechaValida;
          if (!rec.CURSO) erroresFinal.push("Curso vacío");
          filas.push({ fila: selected.headerRow + idx + 2, rec, erroresFinal });
        }
        await cederAlNavegador();
      }

      // 2) Detectar DUPLICADOS INTERNOS del archivo (misma citación completa).
      //    Fechas, grupos u horarios diferentes se conservan. Solo la primera
      //    se toma en cuenta; las demás se marcan como "duplicado interno".
      const vistos = new Set();
      filas.forEach(f => {
        if (f.erroresFinal.length > 0) { f.duplicadoInterno = false; return; }
        const clave = claveCitacion(f.rec);
        if (vistos.has(clave)) { f.duplicadoInterno = true; f.erroresFinal.push("Duplicado interno del archivo (misma citación completa)"); }
        else vistos.add(clave);
      });

      // Los códigos que llegan en una migración se conservan, pero nunca se
      // permite que el mismo CI pertenezca a dos cédulas diferentes.
      const propietariosCodigo = new Map();
      store.data.forEach(rec => {
        const codigo = normalizarNumeroCertificado(rec.CERT_NUMERO);
        if (!codigo) return;
        const propietario = propietariosCodigo.get(codigo);
        propietariosCodigo.set(codigo, propietario && propietario !== rec.ID ? "__CONFLICTO__" : rec.ID);
      });
      for (let idx = 0; idx < filas.length; idx++) {
        const f = filas[idx];
        if (!f.rec.CERT_NUMERO) continue;
        const codigo = normalizarNumeroCertificado(f.rec.CERT_NUMERO);
        if (!codigo) {
          f.erroresFinal.push("Código de certificado inválido; usa el formato CI-15161");
          continue;
        }
        f.rec.CERT_NUMERO = codigo;
        const codigosPersona = [...new Set(store.getPerson(f.rec.ID).map(rec => normalizarNumeroCertificado(rec.CERT_NUMERO)).filter(Boolean))];
        if (codigosPersona.length && !codigosPersona.includes(codigo)) {
          f.erroresFinal.push(`La cédula ya conserva el código ${codigosPersona[0]}; no se reemplazará por ${codigo}`);
          continue;
        }
        const propietario = propietariosCodigo.get(codigo);
        if (propietario === "__CONFLICTO__" || (propietario && propietario !== f.rec.ID)) {
          f.erroresFinal.push(`${codigo} ya está asignado a otra cédula`);
          continue;
        }
        propietariosCodigo.set(codigo, f.rec.ID);
        if (idx > 0 && idx % 500 === 0) await cederAlNavegador();
      }

      // 3) Clasificar cada fila frente a lo existente en Firestore:
      //    NUEVO | ACTUALIZAR | SIN CAMBIOS | CON ERROR.
      const filasClasificadas = [];
      for (let idx = 0; idx < filas.length; idx++) {
        const f = filas[idx];
        if (f.erroresFinal.length > 0) {
          filasClasificadas.push({ ...f, accion: "error", objetivo: null, clase: null });
        } else {
          const { accion, objetivo, motivo } = clasificarRegistro(f.rec, store.getPerson(f.rec.ID), store.estadoHoy);
          filasClasificadas.push({ ...f, accion, objetivo, motivo });
        }
        if (idx > 0 && idx % 500 === 0) {
          statusDiv.innerText = `Clasificando ${idx.toLocaleString("es-CO")} de ${filas.length.toLocaleString("es-CO")} filas...`;
          await cederAlNavegador();
        }
      }

      pendingImport = {
        filas: filasClasificadas,
        resumen: null,
        categorias: null,
        archivo: { nombre: file.name, tamano: file.size, huella: huellaArchivo(file), trabajoId: crearIdTrabajo(file) },
      };
      mostrarPrevisualizacionCarga(filasClasificadas);
      statusDiv.innerText = "";
      modalCargaMasiva.hide();
    } catch (err) {
      console.error(err);
      statusDiv.innerText = "";
      showToast("Error al procesar el archivo. Verifica que sea un Excel o CSV válido.", "danger");
    }
  };
  reader.readAsArrayBuffer(file);
};

function accionTitulo(accion) {
  return {
    nuevo: "Nuevo", nuevos: "Nuevos", actualizar: "Actualizarán",
    sin_cambios: "Sin cambios", sincambios: "Sin cambios",
    error: "Con error", errores: "Errores", duplicado: "Duplicado",
  }[accion] || accion;
}

function mostrarPrevisualizacionCarga(filas) {
  let nuevos = 0, actualizar = 0, sinCambios = 0, conError = 0, duplicadosInternos = 0;
  filas.forEach(f => {
    if (f.erroresFinal.length > 0) {
      if (f.duplicadoInterno) duplicadosInternos++;
      else conError++;
    } else if (f.accion === "nuevo") nuevos++;
    else if (f.accion === "actualizar") actualizar++;
    else sinCambios++;
  });

  pendingImport.resumen = { total: filas.length, nuevos, actualizar, sinCambios, conError, duplicadosInternos };
  pendingImport.categorias = categorizarFilasImportacion(filas);
  document.getElementById("previewContent")?.classList.remove("d-none");

  document.getElementById("valTotal").innerText = filas.length;
  document.getElementById("valNuevos").innerText = nuevos;
  document.getElementById("valActualizar").innerText = actualizar;
  document.getElementById("valSinCambios").innerText = sinCambios;
  document.getElementById("valErrores").innerText = conError + duplicadosInternos;
  document.getElementById("valDuplicados").innerText = duplicadosInternos;
  document.getElementById("valComentario").innerText =
    "Revisa la clasificación. Nada se modifica hasta que confirmes la carga.";

  // Pestañas activas según haya filas de cada tipo.
  ["tabNuevos", "tabActualizar", "tabSinCambios", "tabErrores"].forEach(id => {
    const btnTab = document.getElementById(id);
    if (!btnTab) return;
    const tipo = id.replace("tab", "").toLowerCase();
    const count = tipo === "errores" ? conError + duplicadosInternos : { nuevos, actualizar, sincambios: sinCambios }[tipo];
    btnTab.innerText = `${accionTitulo(tipo)} (${count})`;
  });

  previewCategory = "nuevos";
  previewPage = 1;
  document.getElementById("previewPageSize").value = String(previewSize);
  document.querySelector('#modalValidacion [data-preview-category="nuevos"]')?.click();
  renderPrevisualizacionActiva();
  ocultarProgresoCarga();

  document.getElementById("btnConfirmarSubida").disabled = (nuevos + actualizar) === 0;
  modalValidacion.show();
}

const PREVIEW_TABLE_IDS = {
  nuevos: "prevTableNuevos",
  actualizar: "prevTableActualizar",
  sinCambios: "prevTableSinCambios",
  errores: "prevTableErrores",
};

function renderPrevisualizacionActiva() {
  if (!pendingImport.categorias) return;
  const filas = pendingImport.categorias[previewCategory] || [];
  const datos = paginaPrevia(filas, previewPage, previewSize);
  previewPage = datos.pagina;
  renderTablaPrevisualizacion(PREVIEW_TABLE_IDS[previewCategory], datos.filas);
  const info = document.getElementById("previewInfo");
  if (info) {
    info.innerText = datos.total
      ? `${datos.inicio.toLocaleString("es-CO")}–${datos.fin.toLocaleString("es-CO")} de ${datos.total.toLocaleString("es-CO")}`
      : "0 registros";
  }
  const prev = document.getElementById("previewPrev");
  const next = document.getElementById("previewNext");
  if (prev) prev.disabled = datos.pagina <= 1;
  if (next) next.disabled = datos.pagina >= datos.paginas;
}

function renderTablaPrevisualizacion(tbodyId, filas) {
  const tbody = document.getElementById(tbodyId);
  if (!tbody) return;
  if (filas.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted py-3">Sin filas en esta categoría.</td></tr>';
    return;
  }
  tbody.innerHTML = filas.map(f => {
    const r = f.rec;
    const errores = f.erroresFinal.length ? `<div class="error-reason">${escapeHtml(f.erroresFinal.join("; "))}</div>` : "";
    const motivo = f.motivo ? `<div class="prev-motive">${escapeHtml(f.motivo)}</div>` : "";
    return `
      <tr class="${f.erroresFinal.length ? "error-row" : ""}">
        <td class="mono">${f.fila}</td>
        <td class="mono">${escapeHtml(r.ID || "—")}</td>
        <td>${escapeHtml(r.NOMBRES || "—")}</td>
        <td>${escapeHtml(r.CURSO || "—")}</td>
        <td class="mono">${formatFechaDisplay(r.FECHA)}</td>
        <td>${escapeHtml(r.GRUPO || "—")}</td>
        <td>${errores || motivo || ""}</td>
      </tr>`;
  }).join("");
}

window.descargarReporteErrores = function () {
  const conError = pendingImport.filas.filter(f => f.erroresFinal.length > 0);
  if (conError.length === 0) return;
  const ws = XLSX.utils.json_to_sheet(conError.map(f => ({
    FILA: f.fila, ID: f.rec.ID, NOMBRES: f.rec.NOMBRES, CURSO: f.rec.CURSO, MOTIVO_ERROR: f.erroresFinal.join("; ")
  })));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Errores");
  XLSX.writeFile(wb, "TDC_Reporte_Errores_CargaMasiva.xlsx");
};

// UPSERT real: CREAR los nuevos y ACTUALIZAR los existentes, respetando el
// límite de 450 operaciones por batch de Firestore. Nunca se duplica.
window.confirmarSubidaValidos = async function () {
  if (activeUploadJob?.estado === "pausado") {
    await ejecutarTrabajoImportacion(activeUploadJob);
    return;
  }
  const clientes = pendingImport.filas.filter(f =>
    (f.accion === "nuevo" || f.accion === "actualizar") && f.erroresFinal.length === 0
  );
  if (clientes.length === 0) return;

  // Cada fecha es una citación independiente. Una misma cédula puede crear
  // varias filas del mismo curso cuando corresponden a días diferentes.
  const operaciones = clientes.map(f => ({ tipo: f.accion === "nuevo" ? "crear" : "actualizar", f }));
  const operacionesPersistibles = operaciones.map(op => {
    const { f } = op;
    const certificadoExistente = op.tipo === "actualizar" ? {
      CERT_NUMERO: f.objetivo?.CERT_NUMERO || f.rec.CERT_NUMERO || "",
      CERT_CATEGORIA: f.objetivo?.CERT_CATEGORIA || "",
      CERT_METODOLOGIA: f.objetivo?.CERT_METODOLOGIA || "",
      CERT_CIUDAD: f.objetivo?.CERT_CIUDAD || "",
      CERT_TRATAMIENTO_INSTRUCTOR: f.objetivo?.CERT_TRATAMIENTO_INSTRUCTOR || "",
      CERT_LICENCIA_INSTRUCTOR: f.objetivo?.CERT_LICENCIA_INSTRUCTOR || "",
      CERT_ACTUALIZADO: f.objetivo?.CERT_ACTUALIZADO || "",
    } : {};
    const data = conTrazas(
      { ...f.rec, ...certificadoExistente },
      "Carga Excel",
      op.tipo === "crear" ? "crear" : "actualizar",
      op.tipo === "actualizar" ? f.objetivo : null,
    );
    return {
      tipo: op.tipo,
      docId: op.tipo === "crear" ? idDeterministaRegistro(f.rec) : f.objetivo._docId,
      data,
    };
  });

  const ahora = new Date().toISOString();
  const trabajo = {
    id: pendingImport.archivo?.trabajoId || `carga_${Date.now()}`,
    archivo: pendingImport.archivo || { nombre: "archivo", huella: "" },
    estado: "procesando",
    creadoEn: ahora,
    actualizadoEn: ahora,
    siguienteLote: 0,
    totalLotes: Math.ceil(operacionesPersistibles.length / TAMANO_LOTE_FIRESTORE),
    procesados: 0,
    creadosCompletados: 0,
    actualizadosCompletados: 0,
    operaciones: operacionesPersistibles,
    resumen: pendingImport.resumen,
  };

  try {
    await guardarTrabajoImportacion(trabajo);
  } catch (error) {
    console.error(error);
    return showToast("No se pudo preparar la recuperación de la carga. Libera espacio del navegador e inténtalo de nuevo.", "danger");
  }
  await ejecutarTrabajoImportacion(trabajo);
};

async function ejecutarTrabajoImportacion(trabajo) {
  activeUploadJob = trabajo;
  trabajo.estado = "procesando";
  trabajo.actualizadoEn = new Date().toISOString();
  const lotes = lotesDe(trabajo.operaciones, TAMANO_LOTE_FIRESTORE);
  const boton = document.getElementById("btnConfirmarSubida");
  if (boton) { boton.disabled = true; boton.innerText = "Cargando..."; }
  mostrarProgresoCarga();
  actualizarProgresoCarga(trabajo);

  try {
    await guardarTrabajoImportacion(trabajo);
    for (let indice = trabajo.siguienteLote || 0; indice < lotes.length; indice++) {
      const lote = lotes[indice];
      const batch = writeBatch(db);
      lote.forEach(op => batch.set(doc(db, "capacitaciones", op.docId), op.data, { merge: false }));
      await batch.commit();

      trabajo.siguienteLote = indice + 1;
      trabajo.procesados = Math.min(trabajo.siguienteLote * TAMANO_LOTE_FIRESTORE, trabajo.operaciones.length);
      trabajo.creadosCompletados = (trabajo.creadosCompletados || 0) + lote.filter(op => op.tipo === "crear").length;
      trabajo.actualizadosCompletados = (trabajo.actualizadosCompletados || 0) + lote.filter(op => op.tipo === "actualizar").length;
      trabajo.actualizadoEn = new Date().toISOString();
      await guardarTrabajoImportacion(trabajo);
      actualizarProgresoCarga(trabajo);
      await cederAlNavegador();
    }

    trabajo.estado = "completado";
    try { await eliminarTrabajoImportacion(trabajo.id); }
    catch (cleanupError) { console.warn("La carga terminó, pero no se pudo limpiar su punto de recuperación.", cleanupError); }
    const creados = trabajo.creadosCompletados || 0;
    const actualizados = trabajo.actualizadosCompletados || 0;
    showToast(`Carga completada: ${creados.toLocaleString("es-CO")} creados y ${actualizados.toLocaleString("es-CO")} actualizados.`, "success");
    modalValidacion.hide();
    mostrarResultadoCarga({ ...trabajo.resumen, creados, actualizados });
    iniciarRevisionNotasManual({ automatico: true });
    pendingImport = { filas: [], resumen: null, categorias: null, archivo: null };
    activeUploadJob = null;
    document.getElementById("excelFileInput").value = "";
  } catch (err) {
    console.error(err);
    trabajo.estado = "pausado";
    trabajo.ultimoError = err?.message || "Error de conexión";
    trabajo.actualizadoEn = new Date().toISOString();
    try { await guardarTrabajoImportacion(trabajo); } catch (saveError) { console.error(saveError); }
    actualizarProgresoCarga(trabajo, true);
    if (boton) { boton.disabled = false; boton.innerText = "Reintentar pendientes"; }
    const pendientes = Math.max(0, trabajo.operaciones.length - (trabajo.procesados || 0));
    showToast(`La carga se pausó: ${trabajo.procesados.toLocaleString("es-CO")} registros quedaron guardados y ${pendientes.toLocaleString("es-CO")} siguen pendientes. Puedes reanudarla sin duplicar datos.`, "danger");
  }
}

function mostrarProgresoCarga() {
  document.getElementById("cargaProgress")?.classList.remove("d-none");
}

function ocultarProgresoCarga() {
  document.getElementById("cargaProgress")?.classList.add("d-none");
  const boton = document.getElementById("btnConfirmarSubida");
  if (boton) boton.innerText = "Confirmar carga";
}

function actualizarProgresoCarga(trabajo, pausado = false) {
  const total = trabajo.operaciones.length;
  const procesados = Math.min(trabajo.procesados || 0, total);
  const porcentaje = total ? Math.round((procesados / total) * 100) : 100;
  const barra = document.getElementById("cargaProgressBar");
  if (barra) {
    barra.style.width = `${porcentaje}%`;
    barra.setAttribute("aria-valuenow", String(porcentaje));
    barra.classList.toggle("paused", pausado);
  }
  const estado = document.getElementById("cargaProgressText");
  if (estado) estado.innerText = pausado
    ? `Carga pausada en ${procesados.toLocaleString("es-CO")} de ${total.toLocaleString("es-CO")} registros.`
    : `${procesados.toLocaleString("es-CO")} de ${total.toLocaleString("es-CO")} registros · lote ${trabajo.siguienteLote || 0} de ${trabajo.totalLotes || 0}`;
  const detalle = document.getElementById("cargaProgressDetail");
  if (detalle) detalle.innerText = `${(trabajo.creadosCompletados || 0).toLocaleString("es-CO")} creados · ${(trabajo.actualizadosCompletados || 0).toLocaleString("es-CO")} actualizados`;
}

async function detectarCargaPendiente() {
  try {
    const trabajo = await leerTrabajoPendiente();
    if (trabajo) mostrarRecuperacionCarga(trabajo);
  } catch (error) {
    console.warn("No se pudo consultar una carga pendiente.", error);
  }
}

function mostrarRecuperacionCarga(trabajo) {
  activeUploadJob = trabajo;
  const cont = document.getElementById("cargaResultado");
  if (!cont) return;
  const pendientes = Math.max(0, trabajo.operaciones.length - (trabajo.procesados || 0));
  cont.innerHTML = `
    <div class="carga-resultado carga-recuperable">
      <div class="cr-titulo"><i class="fa-solid fa-rotate"></i> Carga pendiente</div>
      <p>Quedan <strong>${pendientes.toLocaleString("es-CO")}</strong> registros de <strong>${escapeHtml(trabajo.archivo?.nombre || "un archivo")}</strong>.</p>
      <div class="recovery-actions">
        <button class="command-button primary" onclick="reanudarCargaPendiente()">Reanudar</button>
        <button class="command-button secondary" onclick="descartarCargaPendiente()">Descartar</button>
      </div>
    </div>`;
}

window.reanudarCargaPendiente = async function () {
  let trabajo = activeUploadJob;
  if (!trabajo) trabajo = await leerTrabajoPendiente();
  if (!trabajo) return showToast("No hay una carga pendiente.", "warning");
  pendingImport.resumen = trabajo.resumen;
  document.getElementById("previewContent")?.classList.add("d-none");
  document.getElementById("valComentario").innerText = `Reanudando ${trabajo.archivo?.nombre || "la carga"} desde el último lote confirmado.`;
  const resumen = trabajo.resumen || {};
  document.getElementById("valTotal").innerText = resumen.total || trabajo.operaciones.length;
  document.getElementById("valNuevos").innerText = resumen.nuevos || 0;
  document.getElementById("valActualizar").innerText = resumen.actualizar || 0;
  document.getElementById("valSinCambios").innerText = resumen.sinCambios || 0;
  document.getElementById("valDuplicados").innerText = resumen.duplicadosInternos || 0;
  document.getElementById("valErrores").innerText = (resumen.conError || 0) + (resumen.duplicadosInternos || 0);
  modalValidacion.show();
  await ejecutarTrabajoImportacion(trabajo);
};

window.descartarCargaPendiente = async function () {
  const trabajo = activeUploadJob || await leerTrabajoPendiente();
  if (!trabajo) return;
  if (!confirm("¿Descartar el avance pendiente? Los lotes ya guardados permanecerán disponibles.")) return;
  await eliminarTrabajoImportacion(trabajo.id);
  activeUploadJob = null;
  const cont = document.getElementById("cargaResultado");
  if (cont) cont.innerHTML = "";
  showToast("Se descartó el punto de recuperación. Los registros ya confirmados se conservaron.", "warning");
};

function mostrarResultadoCarga(res) {
  const cont = document.getElementById("cargaResultado");
  if (!cont) return;
  const fecha = new Date().toLocaleString("es-CO");
  cont.innerHTML = `
    <div class="carga-resultado">
      <div class="cr-titulo"><i class="fa-solid fa-circle-check" style="color:var(--dg-green)"></i> Carga completada — ${fecha}</div>
      <div class="cr-grid">
        <div><span class="cr-num">${res.creados}</span><span class="cr-label">Creados</span></div>
        <div><span class="cr-num">${res.actualizados}</span><span class="cr-label">Actualizados</span></div>
        <div><span class="cr-num">${res.sinCambios}</span><span class="cr-label">Sin cambios</span></div>
        <div><span class="cr-num" style="color:var(--dg-red)">${res.conError + res.duplicadosInternos}</span><span class="cr-label">Con error</span></div>
      </div>
    </div>`;
  cont.scrollIntoView({ behavior: "smooth", block: "center" });
  setTimeout(() => { cont.innerHTML = ""; }, 12000);
}
