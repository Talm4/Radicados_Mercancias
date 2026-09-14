import { store } from "./store.js";
import { showToast } from "./utils.js";

const RESUMEN_NOTAS = "assets/data/notas-resumen.json";
let modalNotas;

export function initNotas() {
  modalNotas = new bootstrap.Modal(document.getElementById("modalRevisionNotas"));
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

window.revisarNotas = async function () {
  const boton = document.getElementById("btnRevisarNotas");
  boton.disabled = true;
  setEstado("Consultando la última revisión automática...");
  modalNotas.show();
  document.getElementById("notasContenido").classList.add("d-none");
  try {
    const [response] = await Promise.all([
      fetch(`${RESUMEN_NOTAS}?v=${Date.now()}`, { cache: "no-store" }),
      store.actualizar(),
    ]);
    if (!response.ok) throw new Error(`No se pudo descargar el resumen (${response.status})`);
    const resumen = await response.json();
    renderResumen(resumen);
    document.getElementById("notasContenido").classList.remove("d-none");
    if (resumen.status === "completado") {
      setEstado(`Última revisión completada: ${fechaLegible(resumen.generatedAt)}.`, "success");
    } else {
      setEstado("La automatización está instalada. Falta configurar el acceso seguro a Firebase y ejecutar el flujo por primera vez.", "warning");
    }
  } catch (error) {
    console.error(error);
    setEstado("No fue posible consultar el estado de las notas. Revisa la última ejecución en GitHub Actions.", "error");
    showToast("No fue posible consultar la revisión de notas.", "danger");
  } finally {
    boton.disabled = false;
  }
};

function renderResumen(resumen) {
  const sync = resumen.synchronization || {};
  const report = resumen.report || {};
  const verificadasEnFirebase = store.data.filter(rec => rec.NOTA_ORIGEN === "Reporte Aprende Talma").length;
  document.getElementById("notasRevisados").innerText = Number(sync.platformRecords || 0).toLocaleString("es-CO");
  document.getElementById("notasCambios").innerText = Number(sync.updated || 0).toLocaleString("es-CO");
  document.getElementById("notasIguales").innerText = Number(sync.unchanged || 0).toLocaleString("es-CO");
  document.getElementById("notasNoEncontrados").innerText = Number(sync.notFound || 0).toLocaleString("es-CO");
  document.getElementById("notasFuenteDetalle").innerText =
    `${Number(report.matchingRows || 0).toLocaleString("es-CO")} filas encontradas en los dos cursos · ${Number(report.uniquePeopleCourses || 0).toLocaleString("es-CO")} personas/curso con nota válida · ${verificadasEnFirebase.toLocaleString("es-CO")} registros identificados localmente como verificados`;
}
