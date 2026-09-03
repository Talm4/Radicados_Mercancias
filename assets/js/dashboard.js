import { escapeHtml, renderMetrics } from "./ui.js";
import { formatFechaDisplay } from "./utils.js";

let actionsReady = false;

function openAbsences(store) {
  store.setFiltro("asistio", "NO");
  window.location.hash = "#registros";
}

function bindActions(store) {
  if (actionsReady) return;
  actionsReady = true;
  document.getElementById("dashReviewAbsences")?.addEventListener("click", () => openAbsences(store));
  document.getElementById("dashOpenAllAbsences")?.addEventListener("click", () => openAbsences(store));
}

function renderAbsences(metrics) {
  const rows = metrics.noAttendance;
  document.getElementById("dashAbsences").innerHTML = rows.length ? rows.map(rec => `
    <tr>
      <td><span class="person-link" data-open-perfil="${escapeHtml(rec._personKey)}">${escapeHtml(rec.NOMBRES || "Sin nombre")}</span></td>
      <td class="mono">${escapeHtml(rec.ID || "—")}</td>
      <td>${formatFechaDisplay(rec.FECHA)}</td>
      <td>${escapeHtml(rec.BASE || "—")}</td>
      <td>${escapeHtml(rec.GRUPO || "—")}</td>
      <td>${escapeHtml(rec.INSTRUCTOR || "—")}</td>
    </tr>`).join("") : '<tr><td colspan="6" class="empty-cell attendance-empty"><i class="fa-solid fa-circle-check"></i><strong>No hay inasistencias en esta selección.</strong></td></tr>';
}

export function renderDashboard(store) {
  const { summary } = store.metrics;
  const count = summary.registros;
  document.getElementById("dashHeroSub").textContent = `${count.toLocaleString("es-CO")} ${count === 1 ? "registro" : "registros"}`;

  renderMetrics("dashKpis", [
    { label: "Total de registros", value: count.toLocaleString("es-CO"), foot: "Según los filtros actuales", tone: "neutral" },
    { label: "Asistieron", value: summary.asistieron.toLocaleString("es-CO"), foot: `${summary.pctAsistencia}% del total`, tone: "positive" },
    { label: "No asistieron", value: summary.noAsistieron.toLocaleString("es-CO"), foot: summary.noAsistieron ? "Requieren validación" : "Sin pendientes", tone: summary.noAsistieron ? "critical" : "positive" },
  ]);

  document.getElementById("dashAttendanceRate").textContent = `${summary.pctAsistencia}%`;
  document.getElementById("dashAttendanceSentence").textContent = count
    ? `${summary.asistieron.toLocaleString("es-CO")} de ${count.toLocaleString("es-CO")} registros tienen asistencia confirmada.`
    : "Sin registros para mostrar.";
  document.getElementById("dashAttendanceFill").style.width = `${summary.pctAsistencia}%`;
  document.getElementById("dashReviewAbsences").disabled = summary.noAsistieron === 0;
  document.getElementById("dashOpenAllAbsences").disabled = summary.noAsistieron === 0;
  renderAbsences(store.metrics);
  bindActions(store);
}
