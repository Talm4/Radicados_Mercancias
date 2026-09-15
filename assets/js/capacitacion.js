// ==========================================================================
// TALMA DATA CENTER — Lógica de negocio de capacitación
// Vigencia configurable por curso, normalización de cédulas, estados de
// capacitación y reglas de UPSERT (evita duplicados por CÉDULA + CURSO).
//
// La vigencia NO está escrita de forma rígida: se define por curso y por
// defecto es 24 meses. Para agregar un curso con otra vigencia basta
// añadir una entrada en VIGENCIA_CURSOS.
// ==========================================================================
import { safeStr, normKey, parseFechaFlexible } from "./utils.js";

/* ============================ Vigencia configurable ============================ */
// Meses de vigencia por curso. El valor por defecto (24) aplica a cualquier
// curso no listado aquí. Ejemplos de cómo añadir otros:
//   "Curso Recurrente Básico": 12,
//   "Instructores Vuelo": 36,
export const VIGENCIA_DEFAULT_MESES = 24;
export const VIGENCIA_CURSOS = {
  "MERCANCÍAS PELIGROSAS": 24,
};

// Umbral para considerar un curso "PRÓXIMO A VENCER" (en meses restantes).
export const PROXIMO_A_VENCER_MESES = 2;

export function vigenciaMesesCurso(curso) {
  const clave = normKey(curso);
  if (!clave) return VIGENCIA_DEFAULT_MESES;
  for (const [nombre, meses] of Object.entries(VIGENCIA_CURSOS)) {
    if (normKey(nombre) === clave) return meses;
  }
  return VIGENCIA_DEFAULT_MESES;
}

/* ============================ Fecha (hoy local) ============================ */
export function hoyLocal() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function addMeses(iso, meses) {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00Z");
  if (isNaN(d)) return "";
  d.setUTCMonth(d.getUTCMonth() + meses);
  return d.toISOString().slice(0, 10);
}

export function diffDias(isoMayor, isoMenor) {
  if (!isoMayor || !isoMenor) return null;
  const a = new Date(isoMayor + "T00:00:00Z").getTime();
  const b = new Date(isoMenor + "T00:00:00Z").getTime();
  if (isNaN(a) || isNaN(b)) return null;
  return Math.round((a - b) / 86400000);
}

// Convierte una fecha ISO a "yyyy-mm-dd" (o "" si no es válida).
function isoFecha(value) {
  const f = parseFechaFlexible(value);
  return f.valid && !f.empty ? f.iso : "";
}

/* ============================ Normalización de cédulas ============================ */
// La cédula es un IDENTIFICADOR, no un número matemático. Estas entradas
// deben reconocerse como el mismo identificador:
//   1036961650 | 1.036.961.650 | 1 036 961 650 | "1036961650" | 1036961650.0
export function normalizarCedula(value) {
  let s = safeStr(value).trim();
  if (!s) return "";

  // Notación científica de Excel (p. ej. "1.03696E+9").
  if (/^[\d.\-]+[eE][+-]?\d+$/.test(s)) {
    const n = parseFloat(s);
    if (Number.isFinite(n) && Number.isInteger(n)) return String(n);
  }

  // Decimal de Excel (conserva exactitud solo si es entero exacto).
  s = s.replace(/\.0+$/, "");
  if (/^-?\d+(\.\d+)?$/.test(s)) {
    const n = parseFloat(s);
    if (Number.isFinite(n) && Number.isInteger(n)) return String(n);
  }

  // Separa puntos, espacios, comillas y otros separadores tipográficos.
  s = s.replace(/[.\s'\u2019"\u201C\u201D`´-]/g, "");
  return s;
}

export function cedulaValida(value) {
  const id = normalizarCedula(value);
  return /^\d{5,12}$/.test(id);
}

/* ============================ Claves de identidad ============================ */
// Clave CÉDULA + CURSO en formato normalizado para comparar "misma persona
// y mismo curso" sin importar tildes, mayúsculas ni espacios.
export function clavePersonaCurso(id, curso) {
  return `${normalizarCedula(id)}|${normKey(curso)}`;
}

export function claveCitacion(rec) {
  return [
    normalizarCedula(rec?.ID), normKey(rec?.CURSO), isoFecha(rec?.FECHA),
    normKey(rec?.GRUPO), normKey(rec?.HORA), normKey(rec?.SALON),
  ].join("|");
}

/* ============================ Estados de capacitación ============================ */
export const ESTADOS_CAPACITACION = {
  VIGENTE:      { estado: "VIGENTE",            etiqueta: "Vigente",             color: "green", icono: "fa-circle-check" },
  PROXIMO:      { estado: "PRÓXIMO A VENCER",   etiqueta: "Próximo a vencer",    color: "yellow", icono: "fa-clock" },
  VENCIDO:      { estado: "VENCIDO",            etiqueta: "Vencido",             color: "red",    icono: "fa-circle-xmark" },
  RECURRENCIA:  { estado: "REALIZÓ RECURRENCIA",etiqueta: "Realizó recurrencia", color: "blue",   icono: "fa-arrows-rotate" },
  SIN_REGISTRO: { estado: "SIN REGISTRO",       etiqueta: "Sin registro",        color: "gray",   icono: "fa-circle" },
  SIN_FECHA:    { estado: "SIN FECHA",          etiqueta: "Sin fecha",           color: "gray",   icono: "fa-circle-question" },
};

// Colores reutilizables para los chips de estado (dashboard, colaboradores).
export function coloresEstadoCapacitacion(estado) {
  const mapa = {
    "VIGENTE":            { color: "#0b7a40", soft: "soft-green" },
    "PRÓXIMO A VENCER":   { color: "#b78e12", soft: "soft-yellow" },
    "VENCIDO":            { color: "#d92d2d", soft: "soft-red" },
    "REALIZÓ RECURRENCIA":{ color: "#1c6fa8", soft: "soft-teal" },
    "SIN FECHA":          { color: "#8a94a6", soft: "soft-gray" },
  };
  return mapa[estado] || { color: "#8a94a6", soft: "soft-gray" };
}

// Estado de un registro individual según su fecha y la vigencia del curso.
// Devuelve { estado, etiqueta, color, icono, vencimiento, diasRestantes }.
export function estadoDeRegistro(rec, hoy = hoyLocal()) {
  const mes = vigenciaMesesCurso(rec.CURSO);
  const fecha = isoFecha(rec.FECHA);
  if (!fecha) {
    return {
      ...ESTADOS_CAPACITACION.SIN_FECHA,
      vencimiento: "", diasRestantes: null,
    };
  }
  const vencimiento = addMeses(fecha, mes);
  const dias = diffDias(vencimiento, hoy);
  if (dias === null) return { ...ESTADOS_CAPACITACION.SIN_FECHA, vencimiento, diasRestantes: null };
  if (dias < 0) return { ...ESTADOS_CAPACITACION.VENCIDO, vencimiento, diasRestantes: dias };
  if (dias <= PROXIMO_A_VENCER_MESES * 30) {
    return { ...ESTADOS_CAPACITACION.PROXIMO, vencimiento, diasRestantes: dias };
  }
  return { ...ESTADOS_CAPACITACION.VIGENTE, vencimiento, diasRestantes: dias };
}

/* ============================ Reglas de UPSERT ============================ */
// Busca únicamente la misma citación: persona, curso y fecha.
function candidatosDe(rec, existentes) {
  const clave = claveCitacion(rec);
  return existentes.filter(e => claveCitacion(e) === clave);
}

function mismoContenido(recA, recB) {
  const campos = ["NOMBRES", "CURSO", "PROGRAMA", "FECHA", "BASE", "GRUPO", "ASISTIO", "INSTRUCTOR", "HORA", "SALON", "CARGO", "CORREO", "NOTA"];
  for (const c of campos) {
    if (safeStr(recA[c]).trim().toUpperCase() !== safeStr(recB[c]).trim().toUpperCase()) return false;
  }
  return true;
}

// Clasifica una fila nueva frente a los registros existentes.
// Devuelve { accion: 'nuevo' | 'actualizar' | 'sin_cambios' | 'error',
//            objetivo: registroExistente|null, motivo: string }
// Una cédula puede tener varias citaciones del mismo curso. Solo se actualiza
// un documento cuando coinciden cédula + curso + fecha + grupo + hora + salón.
// Una citación diferente siempre crea otro registro y conserva el historial.
export function clasificarRegistro(rec, existentes, _hoy = hoyLocal()) {
  const id = normalizarCedula(rec.ID);

  if (!id) return { accion: "error", objetivo: null, motivo: "Cédula vacía" };

  const candidatos = candidatosDe(rec, existentes);
  if (candidatos.length === 0) {
    return { accion: "nuevo", objetivo: null, motivo: "Nueva citación o día de capacitación" };
  }
  const objetivo = candidatos[0];
  if (mismoContenido(rec, objetivo)) {
    return { accion: "sin_cambios", objetivo, motivo: "Ya existe esta misma citación" };
  }
  return { accion: "actualizar", objetivo, motivo: "Actualiza la misma citación" };
}

/* ============================ Trazabilidad ============================ */
// Agrega campos de auditoría compatibles con la estructura actual.
export function conTrazas(rec, origen, accion, anterior) {
  const marca = new Date().toISOString().replace("T", " ").slice(0, 16); // yyyy-mm-dd HH:MM
  const out = { ...rec };
  out.ultima_actualizacion = marca;
  out.fecha_actualizacion = marca;
  out.origen = origen;
  if (accion === "actualizar" && anterior && anterior.FECHA && anterior.FECHA !== rec.FECHA) {
    out.fecha_anterior = anterior.FECHA;
  }
  return out;
}

/* ============================ Estado agregado por persona ============================ */
// Agrupa los registros de una persona y devuelve el estado por curso y un
// estado global (el más urgente de todos sus cursos).
export function estadosPorPersona(registros, hoy = hoyLocal()) {
  const porCurso = new Map();
  registros.forEach(r => {
    const ck = normKey(r.CURSO);
    if (!porCurso.has(ck)) porCurso.set(ck, { curso: r.CURSO || "(Sin curso)", registros: [] });
    porCurso.get(ck).registros.push(r);
  });

  const cursos = [...porCurso.values()].map(g => {
    const ordenados = g.registros
      .map(r => ({ r, fe: isoFecha(r.FECHA) }))
      .sort((a, b) => (b.fe || "").localeCompare(a.fe || ""));
    const ultimo = ordenados[0].r;
    const est = estadoDeRegistro(ultimo, hoy);
    const recurrencia = g.registros.length > 1 && (est.estado === "VIGENTE" || est.estado === "PRÓXIMO A VENCER");
    return {
      curso: g.curso,
      registros: g.registros.length,
      fecha: isoFecha(ultimo.FECHA),
      vencimiento: est.vencimiento,
      diasRestantes: est.diasRestantes,
      estado: recurrencia ? ESTADOS_CAPACITACION.RECURRENCIA : est,
    };
  });

  // Estado global: prioridad VENCIDO > PRÓXIMO > VIGENTE > SIN FECHA.
  const prioridad = { "VENCIDO": 0, "PRÓXIMO A VENCER": 1, "VIGENTE": 2, "SIN FECHA": 3, "SIN REGISTRO": 4 };
  let global = null;
  cursos.forEach(c => {
    const p = prioridad[c.estado.estado] ?? 99;
    if (!global || p < prioridad[global.estado]) global = c;
  });

  return { cursos, global };
}
