import { db } from "./firebase-config.js";
import { store } from "./store.js";
import { showToast } from "./utils.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

let modalNotas;

export function initNotas() {
  modalNotas = new bootstrap.Modal(document.getElementById("modalRevisionNotas"));
  cargarUltimoEstado(false);
  setInterval(() => cargarUltimoEstado(false), 60000);
}

function fechaLegible(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Sin ejecución" : date.toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" });
}

function setEstado(texto, tipo = "") {
  const estado = document.getElementById("notasEstado");
  if (!estado) return;
  estado.className = `notes-status ${tipo}`.trim();
  estado.innerText = texto;
}

async function estadoServidorLocal() {
  const response = await fetch("/api/notas/estado", { cache: "no-store" });
  const contentType = response.headers.get("content-type") || "";
  if (!response.ok || !contentType.includes("application/json")) throw new Error("Servidor horario no disponible");
  return response.json();
}

async function estadoFirestore() {
  const snapshot = await getDoc(doc(db, "sincronizaciones", "notasAprende"));
  return snapshot.exists() ? snapshot.data() : null;
}

async function cargarUltimoEstado(mostrarModal = true) {
  const button = document.getElementById("btnRevisarNotas");
  if (mostrarModal) modalNotas.show();
  if (button) button.disabled = true;
  if (mostrarModal) setEstado("Consultando la última revisión del reporte...");
  try {
    let resumen;
    try { resumen = await estadoServidorLocal(); }
    catch { resumen = await estadoFirestore(); }
    if (!resumen) {
      if (mostrarModal) setEstado("Todavía no se ha ejecutado la sincronización horaria.", "warning");
      return;
    }
    if (button) button.title = `Última revisión: ${fechaLegible(resumen.generatedAt)}`;
    if (!mostrarModal) return;
    const contenido = document.getElementById("notasContenido");
    if (resumen.report || resumen.synchronization) {
      renderResumen(resumen);
      contenido.classList.remove("d-none");
    } else contenido.classList.add("d-none");

    if (resumen.status === "completado") {
      setEstado(`Última sincronización completada: ${fechaLegible(resumen.generatedAt)}.`, "success");
      await store.actualizar();
    } else if (resumen.status === "procesando") {
      setEstado("El servidor está descargando y cruzando el reporte. Esta ventana se actualizará al terminar.", "warning");
    } else if (resumen.status === "reporte_listo_sin_credenciales") {
      setEstado("El Excel ya fue descargado y validado. Falta la credencial local para guardar las notas en Firestore.", "warning");
    } else {
      setEstado(resumen.message || "La última revisión no terminó correctamente.", "error");
    }
  } catch (error) {
    console.error(error);
    if (mostrarModal) {
      setEstado("No fue posible consultar el estado de la sincronización.", "error");
      showToast("No se pudo consultar la revisión de notas.", "danger");
    }
  } finally {
    if (button) button.disabled = false;
  }
}

window.revisarNotas = () => cargarUltimoEstado(true);

window.sincronizarNotasAhora = async function () {
  modalNotas.show();
  setEstado("Solicitando una descarga nueva del reporte...");
  try {
    const response = await fetch("/api/notas/sincronizar", { method: "POST", cache: "no-store" });
    if (!response.ok) throw new Error("Servidor local no disponible");
    setEstado("La descarga comenzó. Puedes cerrar esta ventana; el proceso continuará en segundo plano.", "warning");
    setTimeout(() => cargarUltimoEstado(true), 5000);
  } catch (error) {
    console.error(error);
    setEstado("Inicia la plataforma con INICIAR-PLATAFORMA.ps1 para ejecutar la descarga automática.", "error");
  }
};

function renderResumen(resumen) {
  const sync = resumen.synchronization || {};
  const report = resumen.report || {};
  document.getElementById("notasRevisados").innerText = Number(sync.platformRecords || report.rowsScanned || 0).toLocaleString("es-CO");
  document.getElementById("notasCargadas").innerText = Number(sync.loaded || 0).toLocaleString("es-CO");
  document.getElementById("notasCorregidas").innerText = Number(sync.corrected || 0).toLocaleString("es-CO");
  document.getElementById("notasIguales").innerText = Number(sync.confirmed || 0).toLocaleString("es-CO");
  document.getElementById("notasNoEncontrados").innerText = Number(sync.notFound || 0).toLocaleString("es-CO");
  document.getElementById("notasFuenteDetalle").innerText =
    `${Number(report.matchingRows || 0).toLocaleString("es-CO")} filas de los dos cursos en el reporte · ${Number(report.uniquePeopleCourses || 0).toLocaleString("es-CO")} personas/curso con nota válida · actualización automática cada 60 minutos`;
}
