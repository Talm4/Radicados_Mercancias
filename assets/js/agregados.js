// Adaptadores de agregación para módulos de detalle. Los arreglos se memoizan
// por referencia; las vistas principales consumen store.metrics directamente.
import { aggregateRecords, personKey } from "./data-engine.js";

const summaryCache = new WeakMap();
function metrics(data) {
  if (!summaryCache.has(data)) summaryCache.set(data, aggregateRecords(data));
  return summaryCache.get(data);
}

export { personKey };
export function asisteSi(rec) { return rec._asistioSi ?? (rec.ASISTIO || "SÍ").toUpperCase() !== "NO"; }
export function resumen(data) { return metrics(data).summary; }

export function agregarPorPersona(data) {
  const map = new Map();
  data.forEach(rec => {
    const key = rec._personKey || personKey(rec);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(rec);
  });
  return [...map.entries()].map(([key, registros]) => {
    const m = metrics(registros).summary;
    const sorted = registros.slice().sort((a, b) => (b.FECHA || "").localeCompare(a.FECHA || ""));
    const latest = sorted[0] || {};
    return { key, ID: latest.ID || key, NOMBRES: latest.NOMBRES || "(Sin nombre)", CARGO: latest.CARGO || "", BASE: latest.BASE || "", CORREO: latest.CORREO || "", totalCursos: m.cursos, asistencias: m.asistieron, inasistencias: m.noAsistieron, ultimoCurso: latest.CURSO || "", ultimaFecha: latest.FECHA || "", registros };
  }).sort((a, b) => a.NOMBRES.localeCompare(b.NOMBRES, "es"));
}

export function agregarPorCurso(data) {
  const map = new Map();
  data.forEach(rec => { const key = rec.CURSO || "(Sin curso)"; if (!map.has(key)) map.set(key, []); map.get(key).push(rec); });
  return [...map.entries()].map(([curso, registros]) => ({ curso, programa: registros.find(x => x.PROGRAMA)?.PROGRAMA || "", resumen: metrics(registros).summary, registros })).sort((a, b) => a.curso.localeCompare(b.curso, "es"));
}

export function agregarPorGrupo(data) {
  const map = new Map();
  data.forEach(rec => { const key = rec.GRUPO || "(Sin grupo)"; if (!map.has(key)) map.set(key, []); map.get(key).push(rec); });
  return [...map.entries()].map(([grupo, registros]) => { const sorted = registros.slice().sort((a, b) => (b.FECHA || "").localeCompare(a.FECHA || "")); const latest = sorted[0] || {}; return { grupo, curso: latest.CURSO || "", programa: latest.PROGRAMA || "", fecha: latest.FECHA || "", base: latest.BASE || "", instructor: latest.INSTRUCTOR || "", salon: latest.SALON || "", resumen: metrics(registros).summary, registros }; }).sort((a, b) => (b.fecha || "").localeCompare(a.fecha || ""));
}
