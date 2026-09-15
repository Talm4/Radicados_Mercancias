// Utilidades para cargas masivas grandes. Este módulo no depende de Firebase,
// por lo que también puede probarse de forma aislada.

export const TAMANO_LOTE_FIRESTORE = 450;
export const TAMANO_PAGINA_PREVIA = 50;
export const MAX_ARCHIVO_MB = 25;

const DB_NAME = "talma-importaciones-v2";
const STORE_NAME = "trabajos";
const DB_VERSION = 1;

export function categorizarFilasImportacion(filas) {
  const categorias = { nuevos: [], actualizar: [], sinCambios: [], errores: [] };
  for (const fila of filas) {
    if (fila.erroresFinal?.length) categorias.errores.push(fila);
    else if (fila.accion === "nuevo") categorias.nuevos.push(fila);
    else if (fila.accion === "actualizar") categorias.actualizar.push(fila);
    else categorias.sinCambios.push(fila);
  }
  return categorias;
}

export function paginaPrevia(filas, pagina = 1, tamano = TAMANO_PAGINA_PREVIA) {
  const total = filas.length;
  const paginas = Math.max(1, Math.ceil(total / tamano));
  const paginaSegura = Math.min(Math.max(1, Number(pagina) || 1), paginas);
  const inicio = (paginaSegura - 1) * tamano;
  return {
    filas: filas.slice(inicio, inicio + tamano),
    pagina: paginaSegura,
    paginas,
    total,
    inicio: total ? inicio + 1 : 0,
    fin: Math.min(inicio + tamano, total),
  };
}

export function lotesDe(items, tamano = TAMANO_LOTE_FIRESTORE) {
  const lotes = [];
  for (let i = 0; i < items.length; i += tamano) lotes.push(items.slice(i, i + tamano));
  return lotes;
}

export function huellaArchivo(file) {
  return [file?.name || "archivo", file?.size || 0, file?.lastModified || 0].join("|");
}

function fnv1a(texto, semilla = 0x811c9dc5) {
  let hash = semilla >>> 0;
  for (let i = 0; i < texto.length; i++) {
    hash ^= texto.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

export function idDeterministaRegistro(rec) {
  const base = [rec?.ID, rec?.CURSO, rec?.FECHA, rec?.GRUPO, rec?.HORA, rec?.SALON]
    .map(v => String(v || "").trim().toUpperCase())
    .join("|");
  // Dos pasadas con semillas distintas mantienen el identificador compacto y
  // estable. El prefijo evita colisiones con IDs históricos autogenerados.
  return `imp_${fnv1a(base)}${fnv1a(base, 0x9e3779b9)}`;
}

export function crearIdTrabajo(file) {
  const huella = huellaArchivo(file);
  return `carga_${fnv1a(huella)}${fnv1a(huella, 0x9e3779b9)}`;
}

export function cederAlNavegador() {
  return new Promise(resolve => setTimeout(resolve, 0));
}

function abrirDB() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB no está disponible"));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("No se pudo abrir el almacenamiento local"));
  });
}

function ejecutarEnDB(modo, accion) {
  return abrirDB().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, modo);
    const store = tx.objectStore(STORE_NAME);
    let resultado;
    try { resultado = accion(store); }
    catch (error) { db.close(); reject(error); return; }
    tx.oncomplete = () => { db.close(); resolve(resultado?.result); };
    tx.onerror = () => { db.close(); reject(tx.error || new Error("No se pudo guardar el avance")); };
    tx.onabort = () => { db.close(); reject(tx.error || new Error("Se canceló el guardado del avance")); };
  }));
}

export function guardarTrabajoImportacion(trabajo) {
  return ejecutarEnDB("readwrite", store => store.put(trabajo));
}

export function eliminarTrabajoImportacion(id) {
  return ejecutarEnDB("readwrite", store => store.delete(id));
}

export async function leerTrabajoPendiente() {
  const trabajos = await ejecutarEnDB("readonly", store => store.getAll());
  return (trabajos || [])
    .filter(t => t.estado === "pausado" || t.estado === "procesando")
    .sort((a, b) => String(b.actualizadoEn || "").localeCompare(String(a.actualizadoEn || "")))[0] || null;
}
