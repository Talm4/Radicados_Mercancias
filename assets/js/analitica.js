import { renderMetrics, escapeHtml } from "./ui.js";
import { chartTheme, upsertChart } from "./chart-manager.js";

const GREEN = "#007a53", RED = "#c42b1c", CYAN = "#35c2d7", NAVY = "#10344d";
let activeDimension = "curso";
let token = 0;

function idle(task) {
  if ("requestIdleCallback" in window) requestIdleCallback(task, { timeout: 400 });
  else setTimeout(task, 32);
}

function chartBase() {
  const t = chartTheme();
  return { plugins: { legend: { labels: { color: t.text, boxWidth: 10 } } }, scales: { x: { ticks: { color: t.text }, grid: { color: t.grid } }, y: { ticks: { color: t.text }, grid: { color: t.grid } } } };
}

function renderKpis(m) {
  renderMetrics("analysisKpis", [
    { label: "Cobertura", value: m.summary.personasUnicas, foot: `${m.summary.bases} bases` },
    { label: "Asistencia", value: `${m.summary.pctAsistencia}%`, foot: `${m.summary.asistieron} confirmadas`, tone: m.summary.pctAsistencia >= 85 ? "positive" : "warning" },
    { label: "Horas", value: m.summary.horas.toLocaleString("es-CO"), foot: `${m.summary.grupos} grupos` },
    { label: "Calidad", value: `${m.quality.score}%`, foot: `${m.quality.review} por revisar`, tone: m.quality.score >= 95 ? "positive" : "warning" },
  ]);
}

function trend(m) {
  const rows = m.by.fecha.filter(x => x.key !== "SIN ASIGNAR").sort((a, b) => a.key.localeCompare(b.key));
  const opt = chartBase();
  upsertChart("analysisTrend", { type: "line", data: { labels: rows.map(x => x.key), datasets: [{ label: "% asistencia", data: rows.map(x => x.pctAsistencia), borderColor: GREEN, backgroundColor: "rgba(0,122,83,.1)", fill: true, tension: .25, pointRadius: rows.length > 30 ? 0 : 2 }, { label: "Volumen", data: rows.map(x => x.total), borderColor: CYAN, borderDash: [4, 4], yAxisID: "volume", pointRadius: 0 }] }, options: { ...opt, interaction: { mode: "index", intersect: false }, plugins: { ...opt.plugins, decimation: { enabled: true, algorithm: "lttb", samples: 60 } }, scales: { x: opt.scales.x, y: { ...opt.scales.y, min: 0, max: 100, ticks: { ...opt.scales.y.ticks, callback: v => `${v}%` } }, volume: { display: false, beginAtZero: true, position: "right" } } } });
}

function attendance(m) {
  upsertChart("analysisAttendance", { type: "doughnut", data: { labels: ["Asistieron", "No asistieron"], datasets: [{ data: [m.summary.asistieron, m.summary.noAsistieron], backgroundColor: [GREEN, RED], borderWidth: 0 }] }, options: { cutout: "72%", plugins: { legend: { position: "bottom", labels: { color: chartTheme().text, boxWidth: 10 } } } } });
}

function comparison(m, dimension) {
  const rows = (m.by[dimension] || []).slice().sort((a, b) => b.total - a.total).slice(0, 15).reverse();
  const opt = chartBase();
  document.getElementById("analysisCompareTitle").textContent = `Comparación por ${dimension}`;
  upsertChart("analysisComparison", { type: "bar", data: { labels: rows.map(x => x.key), datasets: [{ label: "Asistieron", data: rows.map(x => x.asistieron), backgroundColor: GREEN, stack: "attendance", borderRadius: 3 }, { label: "No asistieron", data: rows.map(x => x.noAsistieron), backgroundColor: RED, stack: "attendance", borderRadius: 3 }] }, options: { ...opt, indexAxis: "y", scales: { x: { ...opt.scales.x, stacked: true, beginAtZero: true }, y: { ...opt.scales.y, stacked: true, grid: { display: false } } } } });
  document.getElementById("analysisMatrix").innerHTML = rows.slice().reverse().map(x => `<div class="matrix-row"><strong title="${escapeHtml(x.key)}">${escapeHtml(x.key)}</strong><span>${x.total} reg.</span><span class="${x.pctAsistencia >= 85 ? "good" : "bad"}">${x.pctAsistencia}%</span></div>`).join("") || '<div class="empty-cell">Sin datos.</div>';
}

function hours(m) {
  const periods = new Map();
  m.by.fecha.forEach(row => {
    if (!/^\d{4}-\d{2}/.test(row.key)) return;
    const year = row.key.slice(0, 4);
    const sem = Number(row.key.slice(5, 7)) <= 6 ? "S1" : "S2";
    const key = `${year}-${sem}`;
    periods.set(key, (periods.get(key) || 0) + row.horas);
  });
  const rows = [...periods.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const opt = chartBase();
  upsertChart("analysisHours", { type: "bar", data: { labels: rows.map(x => x[0]), datasets: [{ label: "Horas", data: rows.map(x => Math.round(x[1] * 10) / 10), backgroundColor: NAVY, borderRadius: 5 }] }, options: { ...opt, plugins: { legend: { display: false } } } });
}

function grades(m) {
  const opt = chartBase();
  upsertChart("analysisGrades", { type: "bar", data: { labels: m.gradeBins.map(x => x.label), datasets: [{ label: "Registros", data: m.gradeBins.map(x => x.count), backgroundColor: [RED, "#e06b45", "#d99000", CYAN, GREEN], borderRadius: 5 }] }, options: { ...opt, plugins: { legend: { display: false } } } });
}

export function initAnalitica(onChange) {
  document.getElementById("analysisDimension")?.addEventListener("change", e => { activeDimension = e.target.value; onChange(); });
}

export function renderAnalitica(s) {
  const current = ++token;
  renderKpis(s.metrics);
  idle(() => { if (current !== token || !document.getElementById("view-analitica")?.classList.contains("view-active")) return; trend(s.metrics); attendance(s.metrics); });
  idle(() => { if (current !== token || !document.getElementById("view-analitica")?.classList.contains("view-active")) return; comparison(s.metrics, activeDimension); hours(s.metrics); grades(s.metrics); });
}
