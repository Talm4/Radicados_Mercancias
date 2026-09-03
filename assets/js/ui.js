// ==========================================================================
// TALMA DATA CENTER — Helpers de UI compartidos
// ==========================================================================

export function escapeHtml(str) {
  if (str === undefined || str === null) return "";
  return String(str).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

export function renderMetrics(containerId, items) {
  const cont = document.getElementById(containerId);
  if (!cont) return;
  cont.innerHTML = items.map(item => `<article class="metric-card">
    <span class="metric-label">${escapeHtml(item.label)}</span>
    <strong class="metric-value">${escapeHtml(item.value)}</strong>
    <span class="metric-foot ${escapeHtml(item.tone || "")}">${escapeHtml(item.foot || "")}</span>
  </article>`).join("");
}

export function asistenciaPill(rec) {
  const esSi = (rec.ASISTIO || "SÍ").toUpperCase() !== "NO";
  return `<span class="hz-pill ${esSi ? "si" : "no"}"><span class="hz-dot"></span>${esSi ? "SÍ" : "NO"}</span>`;
}

/* ---------- Panel de estado / errores compartido ---------- */
export function renderEstado(store, panelId) {
  const panel = document.getElementById(panelId);
  if (panel) {
    if (store.error) {
      panel.classList.remove("d-none");
      panel.innerHTML = `
        <div class="d-flex align-items-start gap-3">
          <i class="fa-solid fa-triangle-exclamation" style="color:var(--dg-red); font-size:1.4rem; margin-top:2px;"></i>
          <div class="flex-grow-1">
            <div class="fw-bold" style="color:var(--dg-red);">${escapeHtml(store.error.titulo)}</div>
            <div class="small mt-1" style="color:var(--ink-600);"><strong>Proceso:</strong> ${escapeHtml(store.error.proceso)}</div>
            <div class="small" style="color:var(--ink-600);"><strong>Código:</strong> ${escapeHtml(store.error.codigo)}</div>
            <div class="small mono mt-1" style="color:var(--ink-600); word-break:break-word;">${escapeHtml(store.error.mensaje)}</div>
          </div>
        </div>`;
    } else {
      panel.classList.add("d-none");
      panel.innerHTML = "";
    }
  }
}
