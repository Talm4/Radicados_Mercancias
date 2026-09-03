// Talma Mercancías V2 — Store central indexado.
// Firebase emite una sola vez hacia este pipeline:
// normalización → modelo/índices → filtro cacheado → agregación cacheada → UI.
import { colRef, CAMPOS } from "./firebase-config.js";
import { onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { normalizarRegistroFirestore } from "./utils.js";
import { hoyLocal } from "./capacitacion.js";
import { aggregateRecords, buildDataModel, filterKey, filterRecords, problemasRegistro } from "./data-engine.js";

const listeners = new Set();
const FILTER_DEFAULT = {
  busqueda: "", desde: "", hasta: "", semestre: "todos", asistio: "",
  base: "", grupo: "", curso: "", instructor: "", salon: "",
  soloDuplicados: false, soloRevision: false,
};

function scheduleNotify() {
  if (store._notifyQueued) return;
  store._notifyQueued = true;
  queueMicrotask(() => {
    store._notifyQueued = false;
    listeners.forEach(fn => fn(store));
  });
}

function putCache(key, value) {
  store._filterCache.set(key, value);
  if (store._filterCache.size > 24) store._filterCache.delete(store._filterCache.keys().next().value);
}

export const store = {
  data: [],
  filtered: [],
  metrics: aggregateRecords([]),
  model: buildDataModel([], hoyLocal()),
  filtros: { ...FILTER_DEFAULT },
  estado: "loading",
  error: null,
  sizeCrudo: 0,
  ultimaActualizacion: "",
  estadoHoy: hoyLocal(),
  dataVersion: 0,
  filterVersion: 0,
  currentFilterKey: "",
  _filterCache: new Map(),
  _unsubscribe: null,
  _notifyQueued: false,

  subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  notify() { scheduleNotify(); },

  setFiltro(clave, valor) { store.setFiltros({ [clave]: valor }); },
  setFiltros(cambios) {
    let changed = false;
    Object.entries(cambios).forEach(([clave, valor]) => {
      if (store.filtros[clave] !== valor) { store.filtros[clave] = valor; changed = true; }
    });
    if (changed) store.applyFilters();
  },
  clearFiltros() { store.filtros = { ...FILTER_DEFAULT }; store.applyFilters(); },

  filtrosActivos() {
    const labels = { busqueda: "Búsqueda", desde: "Desde", hasta: "Hasta", semestre: "Semestre", asistio: "Asistencia", base: "Base", grupo: "Grupo", curso: "Curso", instructor: "Instructor", salon: "Salón", soloDuplicados: "Duplicados", soloRevision: "Revisión" };
    return Object.entries(store.filtros).flatMap(([key, value]) => {
      const active = key === "semestre"
        ? value !== "todos"
        : typeof value === "boolean" ? value : (value ?? "") !== "";
      return active ? [{ clave: key, etiqueta: labels[key], valor: value === true ? "" : value }] : [];
    });
  },

  applyFilters() {
    const key = `${store.dataVersion}::${filterKey(store.filtros)}`;
    const cached = store._filterCache.get(key);
    if (cached) {
      store.filtered = cached.filtered;
      store.metrics = cached.metrics;
    } else {
      const filtered = filterRecords(store.model, store.filtros);
      const metrics = aggregateRecords(filtered);
      putCache(key, { filtered, metrics });
      store.filtered = filtered;
      store.metrics = metrics;
    }
    store.currentFilterKey = key;
    store.filterVersion++;
    store.notify();
  },

  iniciar() { store.connect(); },
  connect() {
    store.estado = "loading";
    store.notify();
    if (typeof store._unsubscribe === "function") store._unsubscribe();
    store._unsubscribe = onSnapshot(colRef, snapshot => store.procesarSnapshot(snapshot), error => {
      store.error = { titulo: "No fue posible conectar con la nube", mensaje: error.message || String(error), codigo: error.code || "—", proceso: "Suscripción a capacitaciones" };
      store.estado = "error";
      store.notify();
    });
  },

  procesarSnapshot(snapshot) {
    try {
      store.sizeCrudo = snapshot.size;
      store.estadoHoy = hoyLocal();
      store.data = snapshot.docs.map(d => normalizarRegistroFirestore({ _docId: d.id, ...d.data() }, CAMPOS));
      store.model = buildDataModel(store.data, store.estadoHoy);
      store.dataVersion++;
      store._filterCache.clear();
      store.error = null;
      store.estado = "online";
      store.ultimaActualizacion = new Date().toLocaleString("es-CO");
      store.applyFilters();
    } catch (error) {
      store.error = { titulo: "Los datos llegaron, pero no pudieron procesarse", mensaje: error.message || String(error), codigo: "DATA_PIPELINE", proceso: "Normalización e indexación" };
      store.estado = "partial";
      store.notify();
    }
  },

  async actualizar() {
    // onSnapshot ya mantiene los datos en tiempo real. Evitamos un getDocs
    // duplicado (y sus lecturas facturables) cuando la suscripción está sana.
    if (store.estado === "online") {
      store.ultimaActualizacion = new Date().toLocaleString("es-CO");
      store.notify();
      return { ok: true, live: true };
    }
    store.connect();
    return { ok: true, reconnecting: true };
  },

  getRecord(id) { return store.model.byId.get(id); },
  getPerson(key) { return store.model.peopleRecords.get(key) || []; },
  getCourse(name) { return store.model.courseRecords.get(name) || []; },
  getGroup(name) { return store.model.groupRecords.get(name) || []; },
  options(dimension) { return store.model.options[dimension] || []; },
  calculaProblemasRec(rec) { return rec?._qualityProblems || problemasRegistro(rec, store.estadoHoy); },
  resumenCalidad() {
    return {
      correctos: store.data.length - store.model.reviewIds.size,
      revision: [...store.model.reviewIds],
      duplicados: [...store.model.duplicateIds],
      categorias: [...store.model.qualityCategories.entries()].sort((a, b) => b[1] - a[1]),
    };
  },
};
