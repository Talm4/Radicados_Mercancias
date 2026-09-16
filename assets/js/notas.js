import { doc, writeBatch } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { db } from "./firebase-config.js";
import { store } from "./store.js";
import { showToast } from "./utils.js";
import { planificarActualizacionesNotas } from "./notas-core.js";

export const REPORTE_URL = "https://aprende.talma.com.co/reporteglobal.xlsx";
let modalNotas;
let procesando = false;
let descargando = false;

function setEstado(texto, tipo = "") {
  const el = document.getElementById("notasEstado");
  if (!el) return;
  el.className = `notes-status ${tipo}`.trim();
  el.textContent = texto;
}

function setProgreso(valor) {
  const barra = document.getElementById("notasProgressBar");
  if (barra) barra.style.width = `${Math.max(0, Math.min(100, valor))}%`;
}

export function descargarReporteAprende() {
  const enlace = document.createElement("a");
  enlace.href = REPORTE_URL;
  enlace.target = "_blank";
  enlace.rel = "noopener noreferrer";
  enlace.download = "reporteglobal.xlsx";
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
}

export async function iniciarRevisionNotasManual({ automatico = true } = {}) {
  modalNotas.show();
  document.getElementById("notasContenido")?.classList.remove("d-none");
  setProgreso(0);
  document.getElementById("notasResultado").innerHTML = "";
  if (!automatico || procesando) {
    setEstado("Selecciona reporteglobal.xlsx para iniciar la validación.", "warning");
    return;
  }
  await descargarYProcesarReporte();
}

function resumenHtml(stats, lectura) {
  return `<div class="notes-metrics">
    <span>Filas leídas<strong>${lectura.filasLeidas.toLocaleString("es-CO")}</strong></span>
    <span>Coincidencias<strong>${stats.coincidencias.toLocaleString("es-CO")}</strong></span>
    <span>Actualizadas<strong>${stats.actualizadas.toLocaleString("es-CO")}</strong></span>
    <span>Ya correctas<strong>${stats.yaCorrectas.toLocaleString("es-CO")}</strong></span>
    <span>Omitidas<strong>${stats.omitidas.toLocaleString("es-CO")}</strong></span>
  </div><div class="notes-source">${stats.cargadas} notas nuevas · ${stats.corregidas} corregidas · ${stats.conflictosIdentidad} conflictos de identidad · ${stats.historialConservado} registros históricos conservados · ${lectura.notasInvalidas} notas inválidas en el reporte.</div>`;
}

async function escribirNotas(actualizaciones) {
  let completadas = 0;
  for (let inicio = 0; inicio < actualizaciones.length; inicio += 450) {
    const bloque = actualizaciones.slice(inicio, inicio + 450);
    const batch = writeBatch(db);
    bloque.forEach(item => batch.update(doc(db, "capacitaciones", item.docId), { NOTA: String(item.nota) }));
    await batch.commit();
    completadas += bloque.length;
    setProgreso(70 + Math.round(completadas / Math.max(1, actualizaciones.length) * 30));
  }
}

function procesarBuffer(buffer) {
  if (procesando) return;
  procesando = true;
  const input = document.getElementById("reportFileInput");
  const button = document.getElementById("btnProcesarNotas");
  if (input) input.disabled = true;
  if (button) button.disabled = true;
  setEstado("Leyendo el reporte sin bloquear la pantalla...");
  setProgreso(2);
  const worker = new Worker("assets/js/notas-worker.js");
  worker.onmessage = async event => {
    const payload = event.data;
    if (payload.type === "progress") {
      setProgreso(Math.min(65, Math.round(payload.filasLeidas / Math.max(1, payload.total) * 65)));
      setEstado(`Leyendo reporte: ${payload.filasLeidas.toLocaleString("es-CO")} filas revisadas...`);
      return;
    }
    if (payload.type === "error") {
      worker.terminate();
      finalizarError(payload.message);
      return;
    }
    if (payload.type === "done") {
      worker.terminate();
      try {
        setEstado("Cruzando cédula, nombre y tipo de curso...");
        setProgreso(68);
        const plan = planificarActualizacionesNotas(store.data, payload.records);
        await escribirNotas(plan.actualizaciones);
        document.getElementById("notasResultado").innerHTML = resumenHtml(plan.stats, payload.statistics);
        localStorage.setItem("talmaUltimaRevisionNotas", JSON.stringify({ fecha: new Date().toISOString(), stats: plan.stats, lectura: payload.statistics }));
        setProgreso(100);
        setEstado(`Proceso terminado: ${plan.stats.actualizadas.toLocaleString("es-CO")} notas actualizadas.`, "success");
        showToast(`Notas revisadas: ${plan.stats.actualizadas} actualizadas y ${plan.stats.yaCorrectas} ya estaban correctas.`, "success");
      } catch (error) { finalizarError(error?.message || String(error)); return; }
      finally { liberarControles(); }
    }
  };
  worker.onerror = event => { worker.terminate(); finalizarError(event.message || "No fue posible procesar el reporte."); };
  worker.postMessage(buffer, [buffer]);
}

function procesarArchivo(file) {
  if (procesando) return;
  setEstado(`${file.name} seleccionado. Leyendo el reporte...`);
  setProgreso(2);
  file.arrayBuffer()
    .then(buffer => procesarBuffer(buffer))
    .catch(error => finalizarError(error?.message || "No fue posible leer el archivo."));
}

async function descargarYProcesarReporte() {
  if (procesando || descargando) return;
  descargando = true;
  setEstado("Descargando y validando el reporte...");
  setProgreso(2);
  const button = document.getElementById("btnProcesarNotas");
  if (button) button.disabled = true;
  try {
    const response = await fetch(`${REPORTE_URL}?t=${Date.now()}`, { cache: "no-store", credentials: "omit" });
    if (!response.ok) throw new Error(`respuesta ${response.status}`);
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength < 1000) throw new Error("el archivo recibido está vacío");
    descargando = false;
    procesarBuffer(buffer);
  } catch (error) {
    console.warn("Descarga automática no disponible", error);
    descargando = false;
    liberarControles();
    setEstado("No se pudo leer el reporte automáticamente. Descárgalo y selecciónalo aquí.", "warning");
    descargarReporteAprende();
  }
}

function liberarControles() {
  procesando = false;
  descargando = false;
  const input = document.getElementById("reportFileInput");
  const button = document.getElementById("btnProcesarNotas");
  if (input) input.disabled = false;
  if (button) button.disabled = false;
}

function finalizarError(message) {
  console.error(message);
  setEstado(`No se realizaron cambios: ${message}`, "error");
  setProgreso(0);
  liberarControles();
}

export function initNotas() {
  modalNotas = new bootstrap.Modal(document.getElementById("modalRevisionNotas"));
  document.getElementById("reportFileInput")?.addEventListener("change", event => {
    const file = event.target.files?.[0];
    if (file) {
      setEstado(`${file.name} seleccionado. Iniciando validación automática...`, "success");
      procesarArchivo(file);
    }
  });
  const saved = localStorage.getItem("talmaUltimaRevisionNotas");
  if (saved) {
    try {
      const last = JSON.parse(saved);
      document.getElementById("notasUltimaRevision").textContent = `Última actualización: ${new Date(last.fecha).toLocaleString("es-CO")}.`;
    } catch { /* resumen local opcional */ }
  }
}

window.revisarNotas = () => iniciarRevisionNotasManual({ automatico: true });
window.descargarReporteNotas = descargarReporteAprende;
window.procesarReporteNotas = () => {
  const file = document.getElementById("reportFileInput")?.files?.[0];
  if (file) procesarArchivo(file);
  else descargarYProcesarReporte();
};
