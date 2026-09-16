import { db } from "./firebase-config.js";
import { doc, setDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { store } from "./store.js";
import { showToast } from "./utils.js";
import { subirCertificado } from "./certificados-storage.js";
import {
  certificateTextRuns,
  evaluarCertificacion,
  instructorCertificado,
  normalizarNumeroCertificado,
} from "./certificados-core.js";
import { asegurarNumeroCertificado } from "./certificados-numeracion.js";
import { createCertificatePdf } from "./certificado-pdf.js";

const TEMPLATE_URL = "assets/pdf/PLANTILLA-CERTIFICADO.pdf";
const CERT_FIELDS = ["certCategoria", "certMetodologia", "certCiudad", "certTratamiento", "certLicencia"];
let modal;
let viewerModal;
let currentRecord = null;
let viewerUrl = "";

function ensureEligible(rec) {
  const result = evaluarCertificacion(rec);
  if (!result.elegible) throw new Error(`No se puede generar el certificado. ${result.motivo}`);
}

function instructorValues(rec) {
  const automatic = instructorCertificado(rec.INSTRUCTOR);
  return {
    automatic,
    treatment: automatic?.tratamiento || rec.CERT_TRATAMIENTO_INSTRUCTOR || "la persona instructora",
    license: automatic?.licencia || rec.CERT_LICENCIA_INSTRUCTOR || "",
  };
}

function formValues(rec = currentRecord) {
  const instructor = instructorValues(rec);
  return {
    CERT_NUMERO: normalizarNumeroCertificado(document.getElementById("certNumero").value),
    CERT_CATEGORIA: document.getElementById("certCategoria").value.trim(),
    CERT_METODOLOGIA: document.getElementById("certMetodologia").value.trim().toUpperCase(),
    CERT_CIUDAD: document.getElementById("certCiudad").value.trim().toUpperCase(),
    CERT_TRATAMIENTO_INSTRUCTOR: instructor.automatic?.tratamiento || document.getElementById("certTratamiento").value,
    CERT_LICENCIA_INSTRUCTOR: instructor.automatic?.licencia || document.getElementById("certLicencia").value.trim(),
  };
}

function applyInstructorFields(rec) {
  const values = instructorValues(rec);
  const treatment = document.getElementById("certTratamiento");
  const license = document.getElementById("certLicencia");
  const help = document.getElementById("certLicenseHelp");
  treatment.value = values.treatment;
  license.value = values.license;
  treatment.disabled = Boolean(values.automatic);
  license.readOnly = Boolean(values.automatic);
  help.textContent = values.automatic
    ? `Asignada automáticamente a ${rec.INSTRUCTOR}: ${values.license}.`
    : "Instructor no registrado en el catálogo. Completa la licencia manualmente.";
}

function fillForm(rec, number = "") {
  document.getElementById("certRecordId").value = rec._docId;
  document.getElementById("certModalTitle").textContent = `${rec.NOMBRES || "Colaborador"} · ${rec.CURSO || "Curso"}`;
  document.getElementById("certNumero").value = number || normalizarNumeroCertificado(rec.CERT_NUMERO) || "Asignando...";
  document.getElementById("certCategoria").value = rec.CERT_CATEGORIA || "Cat. 8";
  document.getElementById("certMetodologia").value = rec.CERT_METODOLOGIA || "PRESENCIAL";
  document.getElementById("certCiudad").value = rec.CERT_CIUDAD || rec.BASE || "";
  applyInstructorFields(rec);
}

function configFromRecord(rec, number) {
  const instructor = instructorValues(rec);
  return {
    CERT_NUMERO: number,
    CERT_CATEGORIA: rec.CERT_CATEGORIA || "Cat. 8",
    CERT_METODOLOGIA: rec.CERT_METODOLOGIA || "PRESENCIAL",
    CERT_CIUDAD: rec.CERT_CIUDAD || rec.BASE || "",
    CERT_TRATAMIENTO_INSTRUCTOR: instructor.treatment,
    CERT_LICENCIA_INSTRUCTOR: instructor.license || "SIN REGISTRAR",
  };
}

function refreshPreview() {
  if (!currentRecord) return;
  const runs = certificateTextRuns(currentRecord, formValues());
  renderRuns(document.getElementById("certPreviewBody"), runs.body);
  renderRuns(document.getElementById("certPreviewInstructor"), runs.instructor);
}

function renderRuns(element, runs) {
  element.replaceChildren(...runs.map(run => {
    const node = document.createElement(run.bold ? "strong" : "span");
    node.textContent = run.text;
    return node;
  }));
}

function setStatus(message, tone = "") {
  const status = document.getElementById("certStatus");
  if (!status) return;
  status.textContent = message;
  status.className = `me-auto small ${tone ? `text-${tone}` : "text-muted"}`;
}

export async function abrirEditorCertificado(docId) {
  const rec = store.getRecord(docId);
  if (!rec) throw new Error("No se encontró el registro para generar el certificado.");
  ensureEligible(rec);
  currentRecord = rec;
  fillForm(rec);
  setStatus("Validando el código único...");
  refreshPreview();
  modal.show();
  const number = await asegurarNumeroCertificado(rec);
  if (currentRecord !== rec) return;
  document.getElementById("certNumero").value = number;
  refreshPreview();
  setStatus(`${number} quedó reservado exclusivamente para este colaborador.`, "success");
}

export async function saveCertificateConfig({ quiet = false } = {}) {
  if (!currentRecord) throw new Error("No hay un registro seleccionado.");
  ensureEligible(currentRecord);
  const number = await asegurarNumeroCertificado(currentRecord);
  document.getElementById("certNumero").value = number;
  const values = formValues(currentRecord);
  if (!values.CERT_CIUDAD || !values.CERT_LICENCIA_INSTRUCTOR) {
    throw new Error("Completa la ciudad y la licencia IET del instructor.");
  }
  await setDoc(doc(db, "capacitaciones", currentRecord._docId), {
    ...values,
    CERT_ACTUALIZADO: new Date().toISOString(),
  }, { merge: true });
  Object.assign(currentRecord, values);
  if (!quiet) {
    setStatus(`Datos guardados con el código ${number}.`, "success");
    showToast("Datos del certificado guardados.", "success");
  }
  return values;
}

export async function buildCertificatePdf(rec, config) {
  ensureEligible(rec);
  const number = normalizarNumeroCertificado(config.CERT_NUMERO);
  if (!number) throw new Error("El certificado no tiene un código único válido.");
  if (!window.PDFLib) throw new Error("La librería para generar PDF no está disponible.");
  const template = await fetch(TEMPLATE_URL).then(response => {
    if (!response.ok) throw new Error("No se pudo cargar la plantilla del certificado.");
    return response.arrayBuffer();
  });
  return createCertificatePdf(window.PDFLib, template, rec, { ...config, CERT_NUMERO: number }, number);
}

function fileName(rec) {
  const name = String(rec.NOMBRES || rec.ID || "COLABORADOR").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `CERTIFICADO-${name}-${rec.FECHA || "SIN-FECHA"}.pdf`;
}

async function currentPdf() {
  if (!currentRecord) throw new Error("No hay un registro seleccionado.");
  ensureEligible(currentRecord);
  const number = await asegurarNumeroCertificado(currentRecord);
  document.getElementById("certNumero").value = number;
  const config = formValues(currentRecord);
  return { bytes: await buildCertificatePdf(currentRecord, config), config };
}

function releaseViewerUrl() {
  if (viewerUrl) URL.revokeObjectURL(viewerUrl);
  viewerUrl = "";
}

export async function viewCertificate(docId) {
  const rec = store.getRecord(docId);
  if (!rec) throw new Error("No se encontró el registro para visualizar el certificado.");
  ensureEligible(rec);
  const frame = document.getElementById("certViewerFrame");
  const loading = document.getElementById("certViewerLoading");
  const downloadButton = document.getElementById("certViewerDownload");
  document.getElementById("certViewerTitle").textContent = `${rec.NOMBRES || "Colaborador"} · ${rec.CURSO || "Curso"}`;
  frame.classList.add("d-none");
  loading.innerHTML = '<span class="spinner-border spinner-border-sm" aria-hidden="true"></span> Preparando certificado...';
  loading.classList.remove("d-none");
  downloadButton.disabled = true;
  viewerModal.show();
  releaseViewerUrl();
  let number;
  let bytes;
  try {
    number = await asegurarNumeroCertificado(rec);
    bytes = await buildCertificatePdf(rec, configFromRecord(rec, number));
  } catch (error) {
    loading.textContent = error.message || "No fue posible preparar el certificado.";
    throw error;
  }
  viewerUrl = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
  frame.src = `${viewerUrl}#toolbar=1&navpanes=0&view=FitH`;
  frame.onload = () => {
    loading.classList.add("d-none");
    frame.classList.remove("d-none");
    downloadButton.disabled = false;
  };
  window.descargarCertificadoVisto = () => downloadBytes(bytes, fileName(rec));
}

function downloadBytes(bytes, name) {
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function downloadCurrentCertificate() {
  setStatus("Generando PDF...");
  const { bytes } = await currentPdf();
  downloadBytes(bytes, fileName(currentRecord));
  setStatus("PDF generado correctamente.", "success");
}

export async function uploadCurrentCertificate() {
  if (!currentRecord) throw new Error("No hay un registro seleccionado.");
  ensureEligible(currentRecord);
  setStatus("Guardando datos y subiendo PDF...");
  const config = await saveCertificateConfig({ quiet: true });
  const bytes = await buildCertificatePdf(currentRecord, config);
  const file = new File([bytes], fileName(currentRecord), { type: "application/pdf" });
  await subirCertificado(currentRecord.ID, currentRecord.NOMBRES, file);
  setStatus("Certificado guardado correctamente.", "success");
  showToast("Certificado guardado correctamente.", "success");
}

async function safeAction(action) {
  try { await action(); }
  catch (error) {
    console.error("[CERTIFICADO]", error);
    setStatus(error.message || String(error), "danger");
    showToast(error.message || "No fue posible procesar el certificado.", "warning");
  }
}

export function initCertificados() {
  modal = new bootstrap.Modal(document.getElementById("modalCertificado"));
  viewerModal = new bootstrap.Modal(document.getElementById("modalVistaCertificado"));
  document.getElementById("modalVistaCertificado").addEventListener("hidden.bs.modal", () => {
    document.getElementById("certViewerFrame").src = "about:blank";
    releaseViewerUrl();
  });
  CERT_FIELDS.forEach(id => {
    const field = document.getElementById(id);
    field.addEventListener("input", refreshPreview);
    field.addEventListener("change", refreshPreview);
  });
  window.abrirCertificado = docId => safeAction(() => abrirEditorCertificado(docId));
  window.verCertificado = docId => safeAction(() => viewCertificate(docId));
  window.guardarDatosCertificado = () => safeAction(() => saveCertificateConfig());
  window.descargarCertificadoPDF = () => safeAction(downloadCurrentCertificate);
  window.guardarCertificadoFirebase = () => safeAction(uploadCurrentCertificate);
}
