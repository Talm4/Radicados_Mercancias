// Reutiliza instancias Chart.js; no destruye/reconstruye en cada filtro.
const charts = new Map();

export function upsertChart(id, config) {
  const canvas = document.getElementById(id);
  if (!canvas || typeof Chart === "undefined") return null;
  const current = charts.get(id);
  if (current && current.config.type === config.type) {
    current.data.labels = config.data.labels;
    current.data.datasets = config.data.datasets;
    current.options = { ...current.options, ...config.options, animation: false };
    current.update("none");
    return current;
  }
  if (current) current.destroy();
  const chart = new Chart(canvas.getContext("2d"), {
    ...config,
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      resizeDelay: 120,
      ...config.options,
    },
  });
  charts.set(id, chart);
  return chart;
}

export function clearChart(id) {
  const chart = charts.get(id);
  if (chart) chart.destroy();
  charts.delete(id);
}

export function clearCharts(prefix = "") {
  [...charts.keys()].filter(id => id.startsWith(prefix)).forEach(clearChart);
}

export function chartTheme() {
  const css = getComputedStyle(document.documentElement);
  return {
    text: css.getPropertyValue("--text-muted").trim() || "#5f6b7a",
    grid: css.getPropertyValue("--border-subtle").trim() || "#e5e9ef",
    surface: css.getPropertyValue("--surface").trim() || "#fff",
  };
}
