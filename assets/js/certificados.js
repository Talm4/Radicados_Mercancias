import { db } from "./firebase-config.js";
import { doc, setDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { store } from "./store.js";
import { showToast } from "./utils.js";
import { subirCertificado } from "./certificados-storage.js";
import { certificateTextRuns, puedeCertificar } from "./certificados-core.js";
import { createCertificatePdf } from "./certificado-pdf.js";

const TEMPLATE_URL = "assets/pdf/PLANTILLA-CERTIFICADO.pdf";
const CERT_FIELDS = ["certNumero", "certCategoria", "certMetodologia", "certCiudad", "certTratamiento", "certLicencia"];
let modal;
let viewerModal;
let currentRecord = null;
let viewerUrl = "";

function ensureAttended(rec) {
  if (!puedeCertificar(rec)) {
    throw new Error("No se puede generar un certificado porque la persona no asistió.");
  }
}

function defaultCertificateNumber(rec) {
  const suffix = String(rec.ID || rec._docId || "00000").replace(/\D/g, "").slice(-5).padStart(5, "0");
  return `CI-${suffix}`;
}

function formValues() {
  return {
    CERT_NUMERO: document.getElementById("certNumero").value.trim(),
    CERT_CATEGORIA: document.getElementById("certCategoria").value.trim(),
    CERT_METODOLOGIA: document.getElementById("certMetodologia").value.trim().toUpperCase(),
    CERT_CIUDAD: document.getElementById("certCiudad").value.trim().toUpperCase(),
    CERT_TRATAMIENTO_INSTRUCTOR: document.getElementById("certTratamiento").value,
    CERT_LICENCIA_INSTRUCTOR: document.getElementById("certLicencia").value.trim(),
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
  status.textContent = message;
  status.className = `me-auto small ${tone ? `text-${tone}` : "text-muted"}`;
}

export function abrirEditorCertificado(docId) {
  const rec = store.getRecord(docId);
  if (!rec) return showToast("No se encontró el registro para generar el certificado.", "danger");
  try { ensureAttended(rec); }
  catch (error) { return showToast(error.message, "warning"); }
  currentRecord = rec;
  document.getElementById("certRecordId").value = docId;
  document.getElementById("certModalTitle").textContent = `${rec.NOMBRES || "Colaborador"} · ${rec.CURSO || "Curso"}`;
  document.getElementById("certNumero").value = rec.CERT_NUMERO || defaultCertificateNumber(rec);
  document.getElementById("certCategoria").value = rec.CERT_CATEGORIA || "Cat. 8";
  document.getElementById("certMetodologia").value = rec.CERT_METODOLOGIA || "PRESENCIAL";
  document.getElementById("certCiudad").value = rec.CERT_CIUDAD || rec.BASE || "";
  document.getElementById("certTratamiento").value = rec.CERT_TRATAMIENTO_INSTRUCTOR || "la Instructora";
  document.getElementById("certLicencia").value = rec.CERT_LICENCIA_INSTRUCTOR || "";
  setStatus("Los campos se guardan en el mismo registro de Firebase.");
  refreshPreview();
  modal.show();
}

export async function saveCertificateConfig({ quiet = false } = {}) {
  if (!currentRecord) throw new Error("No hay un registro seleccionado.");
  ensureAttended(currentRecord);
  const values = formValues();
  if (!values.CERT_CIUDAD || !values.CERT_LICENCIA_INSTRUCTOR) {
    throw new Error("Completa la ciudad y la licencia IET del instructor.");
  }
  await setDoc(doc(db, "capacitaciones", currentRecord._docId), {
    ...values,
    CERT_ACTUALIZADO: new Date().toISOString(),
  }, { merge: true });
  Object.assign(currentRecord, values);
  if (!quiet) {
    setStatus("Datos guardados en Firebase.", "success");
    showToast("Datos del certificado guardados.", "success");
  }
  return values;
}

export async function buildCertificatePdf(rec, config) {
  ensureAttended(rec);
  if (!window.PDFLib) throw new Error("La librería para generar PDF no está disponible.");
  const template = await fetch(TEMPLATE_URL).then(response => {
    if (!response.ok) throw new Error("No se pudo cargar la plantilla del certificado.");
    return response.arrayBuffer();
  });
  return createCertificatePdf(
    window.PDFLib,
    template,
    rec,
    config,
    config.CERT_NUMERO || defaultCertificateNumber(rec),
  );
}

function fileName(rec) {
  const name = String(rec.NOMBRES || rec.ID || "COLABORADOR").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `CERTIFICADO-${name}-${rec.FECHA || "SIN-FECHA"}.pdf`;
}

async function currentPdf() {
  if (!currentRecord) throw new Error("No hay un registro seleccionado.");
  ensureAttended(currentRecord);
  const config = formValues();
  return { bytes: await buildCertificatePdf(currentRecord, config), config };
}

function releaseViewerUrl() {
  if (viewerUrl) URL.revokeObjectURL(viewerUrl);
  viewerUrl = "";
}

export async function viewCertificate(docId) {
  const rec = store.getRecord(docId);
  if (!rec) throw new Error("No se encontró el registro para visualizar el certificado.");
  ensureAttended(rec);
  const config = {
    CERT_NUMERO: rec.CERT_NUMERO || defaultCertificateNumber(rec),
    CERT_CATEGORIA: rec.CERT_CATEGORIA || "Cat. 8",
    CERT_METODOLOGIA: rec.CERT_METODOLOGIA || "PRESENCIAL",
    CERT_CIUDAD: rec.CERT_CIUDAD || rec.BASE || "",
    CERT_TRATAMIENTO_INSTRUCTOR: rec.CERT_TRATAMIENTO_INSTRUCTOR || "la Instructora",
    CERT_LICENCIA_INSTRUCTOR: rec.CERT_LICENCIA_INSTRUCTOR || "SIN REGISTRAR",
  };
  const frame = document.getElementById("certViewerFrame");
  const loading = document.getElementById("certViewerLoading");
  const downloadButton = document.getElementById("certViewerDownload");
  document.getElementById("certViewerTitle").textContent = `${rec.NOMBRES || "Colaborador"} · ${rec.CURSO || "Curso"}`;
  frame.classList.add("d-none");
  loading.classList.remove("d-none");
  downloadButton.disabled = true;
  viewerModal.show();
  releaseViewerUrl();
  const bytes = await buildCertificatePdf(rec, config);
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
  ensureAttended(currentRecord);
  setStatus("Guardando datos y subiendo PDF...");
  const config = await saveCertificateConfig({ quiet: true });
  const bytes = await buildCertificatePdf(currentRecord, config);
  const file = new File([bytes], fileName(currentRecord), { type: "application/pdf" });
  await subirCertificado(currentRecord.ID, currentRecord.NOMBRES, file);
  setStatus("Certificado guardado en Firebase Storage.", "success");
  showToast("Certificado guardado en el perfil del colaborador.", "success");
}

async function safeAction(action) {
  try { await action(); }
  catch (error) {
    console.error("[CERTIFICADO]", error);
    setStatus(error.message || String(error), "danger");
    showToast(error.message || "No fue posible procesar el certificado.", "danger");
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
  window.abrirCertificado = abrirEditorCertificado;
  window.verCertificado = docId => safeAction(() => viewCertificate(docId));
  window.guardarDatosCertificado = () => safeAction(() => saveCertificateConfig());
  window.descargarCertificadoPDF = () => safeAction(downloadCurrentCertificate);
  window.guardarCertificadoFirebase = () => safeAction(uploadCurrentCertificate);
}
