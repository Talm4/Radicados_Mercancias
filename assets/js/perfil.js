// Perfil lateral del colaborador, centrado únicamente en su asistencia.
import { store } from "./store.js";
import { agregarPorPersona } from "./agregados.js";
import { escapeHtml, asistenciaPill } from "./ui.js";
import { formatFechaDisplay } from "./utils.js";
import { puedeCertificar } from "./certificados-core.js";

let currentPersonId = null;

function overlay() { return document.getElementById("profileOverlay"); }

function certificateCell(rec) {
  if (!puedeCertificar(rec)) {
    return '<span class="certificate-unavailable" title="El certificado solo está disponible para quienes asistieron"><i class="fa-solid fa-lock"></i> No disponible</span>';
  }
  return `<div class="certificate-row-actions">
    <button class="command-button primary certificate-button" type="button" onclick="verCertificado('${escapeHtml(rec._docId)}')"><i class="fa-solid fa-eye"></i>Ver</button>
    <button class="icon-button certificate-config-button" type="button" title="Configurar certificado" aria-label="Configurar certificado" onclick="abrirCertificado('${escapeHtml(rec._docId)}')"><i class="fa-solid fa-gear"></i></button>
  </div>`;
}

export function abrirPerfil(id) {
  if (!id) return;
  currentPersonId = id;
  overlay().classList.add("open");
  renderPerfil(store);
}

export function cerrarPerfil() {
  overlay().classList.remove("open");
  currentPersonId = null;
}

export function renderPerfil(s) {
  if (!currentPersonId || !overlay().classList.contains("open")) return;
  const direct = s.getPerson(currentPersonId);
  const fallback = direct.length ? direct : s.data.filter(rec => rec.ID === currentPersonId);
  const persona = agregarPorPersona(fallback)[0];
  const content = document.getElementById("profileContent");
  if (!content) return;
  if (!persona) {
    content.innerHTML = '<div class="profile-body"><p class="text-muted">No se encontró información del colaborador.</p></div>';
    return;
  }

  const total = persona.asistencias + persona.inasistencias;
  const rate = total ? Math.round(persona.asistencias / total * 100) : 0;
  const history = persona.registros.slice().sort((a, b) => (b.FECHA || "").localeCompare(a.FECHA || ""));
  content.innerHTML = `
    <div class="profile-header">
      <button class="p-close" onclick="cerrarPerfil()" aria-label="Cerrar perfil"><i class="fa-solid fa-xmark"></i></button>
      <span class="hero-kicker">Perfil de asistencia</span>
      <div class="profile-name">${escapeHtml(persona.NOMBRES)}</div>
      <div class="profile-meta">ID: ${escapeHtml(persona.ID || "—")} · ${escapeHtml(persona.CARGO || "—")} · Base: ${escapeHtml(persona.BASE || "—")}</div>
    </div>
    <div class="profile-body">
      <div class="profile-section">
        <div class="section-title">Resumen de asistencia</div>
        <div class="profile-kpis attendance-profile-kpis">
          <div class="kpi-card"><div class="kpi-value">${total}</div><div class="kpi-label">Registros</div></div>
          <div class="kpi-card"><div class="kpi-value positive-value">${persona.asistencias}</div><div class="kpi-label">Asistió</div></div>
          <div class="kpi-card"><div class="kpi-value critical-value">${persona.inasistencias}</div><div class="kpi-label">No asistió</div></div>
          <div class="kpi-card"><div class="kpi-value">${rate}%</div><div class="kpi-label">Asistencia</div></div>
        </div>
      </div>
      <div class="profile-section">
        <div class="section-title">Información personal</div>
        <div class="info-grid">
          ${infoItem("ID", persona.ID)}
          ${infoItem("Nombres", persona.NOMBRES)}
          ${infoItem("Cargo", persona.CARGO)}
          ${infoItem("Correo", persona.CORREO)}
          ${infoItem("Base", persona.BASE)}
        </div>
      </div>
      <div class="profile-section">
        <div class="section-title">Historial de asistencia</div>
        <div class="table-responsive">
          <table class="mini-table"><thead><tr><th>Curso</th><th>Fecha</th><th>Grupo</th><th>Instructor</th><th>Asistencia</th><th>Certificado</th></tr></thead>
          <tbody>${history.map(rec => `<tr>
            <td>${escapeHtml(rec.CURSO || "—")}</td>
            <td class="mono">${formatFechaDisplay(rec.FECHA)}</td>
            <td>${escapeHtml(rec.GRUPO || "—")}</td>
            <td>${escapeHtml(rec.INSTRUCTOR || "—")}</td>
            <td>${asistenciaPill(rec)}</td>
            <td>${certificateCell(rec)}</td>
          </tr>`).join("")}</tbody></table>
        </div>
      </div>
    </div>`;
}

function infoItem(label, value) {
  return `<div><div class="ig-label">${escapeHtml(label)}</div><div class="ig-value">${escapeHtml(value || "—")}</div></div>`;
}

window.cerrarPerfil = cerrarPerfil;
window.abrirPerfil = abrirPerfil;

export function initPerfil() {
  overlay().addEventListener("click", event => {
    if (event.target === overlay()) cerrarPerfil();
  });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && overlay().classList.contains("open")) cerrarPerfil();
  });
}
