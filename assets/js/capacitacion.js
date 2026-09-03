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

function diffMeses(isoMenor, isoMayor) {
  const a = new Date(isoMenor + "T00:00:00Z");
  const b = new Date(isoMayor + "T00:00:00Z");
  if (isNaN(a) || isNaN(b)) return NaN;
  return (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth());
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

export function claveExactaPersonaCursoFecha(id, curso, fecha) {
  return `${clavePersonaCurso(id, curso)}|${isoFecha(fecha)}`;
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
// Busca los registros existentes de la misma persona y curso.
function candidatosDe(rec, existentes) {
  const id = normalizarCedula(rec.ID);
  const ck = normKey(rec.CURSO);
  return existentes.filter(e =>
    normalizarCedula(e.ID) === id && normKey(e.CURSO) === ck
  );
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
// Reglas de negocio:
//   · CÉDULA + CURSO identifican a la persona dentro de su vigencia.
//   · Misma fecha exacta → sin cambios (duplicado exacto) o actualización.
//   · La nueva fecha cae en la MISMA ventana de vigencia que el registro
//     previo (distancia < vigencia en meses) → ACTUALIZAR (nunca duplicar).
//   · El registro previo sigue vigente HOY → ACTUALIZAR.
//   · La nueva fecha cae DESPUÉS del vencimiento del previo → la vigencia
//     del previo terminó → CREAR nuevo registro (nueva recurrencia), y el
//     anterior permanece como historial.
//   · Registro previo VENCIDO (hoy > vencimiento) → CREAR nuevo registro.
export function clasificarRegistro(rec, existentes, hoy = hoyLocal()) {
  const id = normalizarCedula(rec.ID);

  if (!id) return { accion: "error", objetivo: null, motivo: "Cédula vacía" };

  const candidatos = candidatosDe(rec, existentes);
  if (candidatos.length === 0) {
    return { accion: "nuevo", objetivo: null, motivo: "Sin registro previo del curso" };
  }

  const ordenados = candidatos
    .map(e => ({ e, fe: isoFecha(e.FECHA) }))
    .sort((a, b) => (b.fe || "").localeCompare(a.fe || ""));
  const mejor = ordenados[0].e;
  const mejorIso = ordenados[0].fe;
  const nuevaIso = isoFecha(rec.FECHA);

  // 1) Duplicado exacto: misma persona, curso y fecha.
  if (nuevaIso && mejorIso && nuevaIso === mejorIso) {
    if (mismoContenido(rec, mejor)) {
      return { accion: "sin_cambios", objetivo: mejor, motivo: "Ya existe registro idéntico (misma fecha)" };
    }
    return { accion: "actualizar", objetivo: mejor, motivo: "Actualiza registro existente (misma fecha)" };
  }

  // 2a) El registro previo no tiene fecha: sin referencia de vigencia.
  //      Se actualiza para no duplicar a la persona+curso.
  if (!mejorIso) {
    return { accion: "actualizar", objetivo: mejor, motivo: "Registro previo sin fecha: se actualiza para no duplicar" };
  }

  const mesesVig = vigenciaMesesCurso(rec.CURSO);
  const vencimientoPrevio = addMeses(mejorIso, mesesVig);

  const dif = nuevaIso ? diffMeses(mejorIso, nuevaIso) : NaN;
  const mismaVentana = Number.isFinite(dif) && Math.abs(dif) < mesesVig;
  const previoVigente = mejorIso && hoy && hoy <= vencimientoPrevio;

  // La nueva fecha ya superó el vencimiento del registro previo → nueva
  // recurrencia, incluso si el registro previo todavía está "vigente" hoy.
  if (nuevaIso && nuevaIso >= vencimientoPrevio) {
    return { accion: "nuevo", objetivo: null, motivo: "El registro previo venció antes de esta nueva fecha" };
  }

  // Misma ventana de vigencia o previo vigente hoy → ACTUALIZAR.
  if (mismaVentana || previoVigente) {
    return { accion: "actualizar", objetivo: mejor, motivo: "Misma persona y curso dentro de la vigencia" };
  }

  // Registro previo vencido y fecha nueva fuera de su ventana → CREAR.
  return { accion: "nuevo", objetivo: null, motivo: "Registro anterior fuera de vigencia (nueva recurrencia)" };
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