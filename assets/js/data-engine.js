// Talma Mercancías V2 — motor de datos puro.
// Normaliza derivados una vez, crea índices y produce una sola agregación
// reutilizable por vista. No conoce el DOM ni Firebase.
import { normKey, safeStr } from "./utils.js";
import { normalizarCedula } from "./capacitacion.js";

export const DIMENSIONES = {
  base: "BASE",
  grupo: "GRUPO",
  curso: "CURSO",
  instructor: "INSTRUCTOR",
  salon: "SALON",
  fecha: "FECHA",
  persona: "_personKey",
};

const SEARCH_FIELDS = ["ID", "NOMBRES", "CORREO", "CURSO", "GRUPO", "BASE", "INSTRUCTOR", "PROGRAMA", "CARGO"];

export function personKey(rec) {
  const id = normalizarCedula(rec.ID);
  if (id) return id;
  const nombre = normKey(rec.NOMBRES);
  return nombre ? `N:${nombre}` : `SIN-ID:${rec._docId}`;
}

export function problemasRegistro(rec, hoy) {
  const problemas = [];
  const id = normalizarCedula(rec.ID);
  if (!id) problemas.push("Sin cédula");
  else if (!/^\d{5,12}$/.test(id)) problemas.push("Cédula no numérica");
  const nombre = safeStr(rec.NOMBRES).trim();
  if (!nombre) problemas.push("Sin nombre");
  else if (nombre.length < 4) problemas.push("Nombre demasiado corto");
  if (!safeStr(rec.CURSO).trim()) problemas.push("Sin curso");
  if (!safeStr(rec.GRUPO).trim()) problemas.push("Sin grupo");
  if (!safeStr(rec.BASE).trim()) problemas.push("Sin base");
  if (!safeStr(rec.FECHA).trim()) problemas.push("Sin fecha");
  else if (rec.FECHA > hoy) problemas.push("Fecha futura");
  const asistio = safeStr(rec.ASISTIO).toUpperCase();
  if (asistio && !["SÍ", "SI", "NO"].includes(asistio)) problemas.push("Asistencia inválida");
  return problemas;
}

function addToIndex(index, value, docId) {
  const key = safeStr(value).trim();
  if (!index.has(key)) index.set(key, new Set());
  index.get(key).add(docId);
}

function decorate(rec, hoy) {
  rec._personKey = personKey(rec);
  rec._searchText = SEARCH_FIELDS.map(c => normKey(rec[c])).filter(Boolean).join(" § ");
  rec._asistioSi = safeStr(rec.ASISTIO || "SÍ").toUpperCase() !== "NO";
  rec._qualityProblems = problemasRegistro(rec, hoy);
  rec._isDuplicate = false;
  return rec;
}

export function buildDataModel(records, hoy) {
  const byId = new Map();
  const indices = Object.fromEntries(Object.keys(DIMENSIONES).map(k => [k, new Map()]));
  const peopleRecords = new Map();
  const courseRecords = new Map();
  const groupRecords = new Map();
  const duplicateGroups = new Map();
  const qualityCategories = new Map();

  records.forEach(raw => {
    const rec = decorate(raw, hoy);
    byId.set(rec._docId, rec);
    Object.entries(DIMENSIONES).forEach(([dimension, campo]) => addToIndex(indices[dimension], rec[campo], rec._docId));
    if (!peopleRecords.has(rec._personKey)) peopleRecords.set(rec._personKey, []);
    peopleRecords.get(rec._personKey).push(rec);
    const curso = rec.CURSO || "(Sin curso)";
    if (!courseRecords.has(curso)) courseRecords.set(curso, []);
    courseRecords.get(curso).push(rec);
    const grupo = rec.GRUPO || "(Sin grupo)";
    if (!groupRecords.has(grupo)) groupRecords.set(grupo, []);
    groupRecords.get(grupo).push(rec);
    const dupKey = `${rec._personKey}|${normKey(rec.CURSO)}`;
    if (!duplicateGroups.has(dupKey)) duplicateGroups.set(dupKey, []);
    duplicateGroups.get(dupKey).push(rec);
    rec._qualityProblems.forEach(p => qualityCategories.set(p, (qualityCategories.get(p) || 0) + 1));
  });

  const duplicateIds = new Set();
  duplicateGroups.forEach(group => {
    if (group.length < 2) return;
    const sorted = group.slice().sort((a, b) => (b.FECHA || "").localeCompare(a.FECHA || ""));
    sorted.slice(1).forEach(rec => { rec._isDuplicate = true; duplicateIds.add(rec._docId); });
  });

  const reviewIds = new Set(records.filter(r => r._qualityProblems.length).map(r => r._docId));
  const options = {};
  ["base", "grupo", "curso", "instructor", "salon"].forEach(dimension => {
    options[dimension] = [...indices[dimension].keys()].filter(Boolean).sort((a, b) => a.localeCompare(b, "es", { numeric: true }));
  });

  return {
    records,
    byId,
    indices,
    peopleRecords,
    courseRecords,
    groupRecords,
    duplicateIds,
    reviewIds,
    options,
    qualityCategories,
  };
}

function statsBucket(key) {
  return { key, total: 0, asistieron: 0, noAsistieron: 0, personas: new Set(), latestDate: "" };
}

function accumulate(bucket, rec) {
  bucket.total++;
  if (rec._asistioSi) bucket.asistieron++; else bucket.noAsistieron++;
  bucket.personas.add(rec._personKey);
  if (rec.FECHA && rec.FECHA > bucket.latestDate) bucket.latestDate = rec.FECHA;
}

function finish(bucket) {
  return {
    key: bucket.key,
    total: bucket.total,
    asistieron: bucket.asistieron,
    noAsistieron: bucket.noAsistieron,
    pctAsistencia: bucket.total ? Math.round(bucket.asistieron / bucket.total * 100) : 0,
    personas: bucket.personas.size,
    latestDate: bucket.latestDate,
  };
}

export function aggregateRecords(records) {
  const total = statsBucket("TOTAL");
  const maps = Object.fromEntries(Object.keys(DIMENSIONES).map(k => [k, new Map()]));
  const noAttendance = [];
  const problemCategories = new Map();
  let review = 0;
  let duplicates = 0;

  records.forEach(rec => {
    accumulate(total, rec);
    Object.entries(DIMENSIONES).forEach(([dimension, campo]) => {
      const key = safeStr(rec[campo]).trim() || "SIN ASIGNAR";
      if (!maps[dimension].has(key)) maps[dimension].set(key, statsBucket(key));
      accumulate(maps[dimension].get(key), rec);
    });
    if (rec._qualityProblems.length) {
      review++;
      rec._qualityProblems.forEach(p => problemCategories.set(p, (problemCategories.get(p) || 0) + 1));
    }
    if (rec._isDuplicate) duplicates++;
    if (!rec._asistioSi) noAttendance.push(rec);
  });

  noAttendance.sort((a, b) => (b.FECHA || "").localeCompare(a.FECHA || ""));
  const summary = finish(total);
  summary.registros = summary.total;
  summary.personasUnicas = summary.personas;
  summary.grupos = maps.grupo.size;
  summary.cursos = maps.curso.size;
  summary.bases = maps.base.size;
  summary.instructores = maps.instructor.size;

  const by = {};
  Object.entries(maps).forEach(([dimension, map]) => {
    by[dimension] = [...map.values()].map(finish);
  });
  return {
    summary,
    by,
    quality: {
      review,
      duplicates,
      correct: records.length - review,
      score: records.length ? Math.max(0, Math.round((1 - (review + duplicates) / records.length) * 100)) : 100,
      categories: [...problemCategories.entries()].sort((a, b) => b[1] - a[1]),
    },
    noAttendance: noAttendance.slice(0, 12),
  };
}

function intersect(a, b) {
  if (!a) return b ? new Set(b) : null;
  if (!b) return new Set();
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  const out = new Set();
  small.forEach(id => { if (large.has(id)) out.add(id); });
  return out;
}

export function filterKey(filters) {
  return Object.keys(filters).sort().map(k => `${k}:${filters[k] === true ? 1 : filters[k] || ""}`).join("|");
}

export function filterRecords(model, filters) {
  let candidateIds = null;
  ["base", "grupo", "curso", "instructor", "salon"].forEach(dimension => {
    if (filters[dimension]) candidateIds = intersect(candidateIds, model.indices[dimension].get(filters[dimension]));
  });
  const source = candidateIds ? [...candidateIds].map(id => model.byId.get(id)) : model.records;
  const term = normKey(filters.busqueda || "");
  return source.filter(rec => {
    if (term && !rec._searchText.includes(term)) return false;
    if (filters.asistio && (rec._asistioSi ? "SÍ" : "NO") !== filters.asistio) return false;
    if (filters.desde && rec.FECHA && rec.FECHA < filters.desde) return false;
    if (filters.hasta && rec.FECHA && rec.FECHA > filters.hasta) return false;
    if (filters.semestre !== "todos" && rec.FECHA && String(new Date(`${rec.FECHA}T00:00:00`).getMonth() < 6 ? 1 : 2) !== filters.semestre) return false;
    if (filters.soloDuplicados && !rec._isDuplicate) return false;
    if (filters.soloRevision && !rec._qualityProblems.length) return false;
    return true;
  });
}
