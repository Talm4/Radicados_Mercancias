import { normKey } from "./utils.js";
import { normalizarCedula } from "./capacitacion.js";

export function tipoCursoPlataforma(curso) {
  const key = normKey(curso);
  if (!key.includes("BASICO")) return "";
  if (key.includes("INICIAL")) return "inicial";
  if (key.includes("REPASO") || key.includes("RECURRENTE") || key.includes("RECURRENCIA")) return "recurrente";
  return "";
}

export function nombresCompatibles(a, b) {
  const tokens = value => new Set(normKey(value).split(" ").filter(token => token.length > 1));
  const left = tokens(a);
  const right = tokens(b);
  if (!left.size || !right.size) return false;
  let comunes = 0;
  left.forEach(token => { if (right.has(token)) comunes++; });
  return comunes / Math.min(left.size, right.size) >= 0.6;
}

function notaEntera(value) {
  const numero = Number(String(value ?? "").trim().replace("%", "").replace(",", "."));
  return Number.isFinite(numero) && numero >= 0 && numero <= 100 ? Math.round(numero) : null;
}

function clave(id, tipo) { return `${normalizarCedula(id)}|${tipo}`; }

export function planificarActualizacionesNotas(documentos, reporte) {
  const grupos = new Map();
  let elegibles = 0;
  documentos.forEach(rec => {
    const id = normalizarCedula(rec.ID);
    const tipo = tipoCursoPlataforma(rec.CURSO);
    if (!id || !tipo) return;
    elegibles++;
    const key = clave(id, tipo);
    if (!grupos.has(key)) grupos.set(key, []);
    grupos.get(key).push(rec);
  });
  grupos.forEach(items => items.sort((a, b) =>
    String(b.FECHA || "").localeCompare(String(a.FECHA || "")) ||
    String(b._docId || "").localeCompare(String(a._docId || ""))));

  const fuentes = new Map(reporte.map(item => [clave(item.id, item.tipo), item]));
  const stats = {
    documentosLeidos: documentos.length, documentosElegibles: elegibles, registrosReporte: reporte.length,
    coincidencias: 0, actualizadas: 0, cargadas: 0, corregidas: 0, yaCorrectas: 0,
    sinNotaEnReporte: 0, conflictosIdentidad: 0,
    historialConservado: Math.max(0, elegibles - grupos.size),
    soloEnReporte: [...fuentes.keys()].filter(key => !grupos.has(key)).length,
  };
  const actualizaciones = [];
  grupos.forEach((candidatos, key) => {
    const fuente = fuentes.get(key);
    if (!fuente) { stats.sinNotaEnReporte++; return; }
    const objetivo = candidatos.find(rec => nombresCompatibles(rec.NOMBRES, fuente.nombre));
    if (!objetivo) { stats.conflictosIdentidad++; return; }
    stats.coincidencias++;
    const actual = notaEntera(objetivo.NOTA);
    if (actual === fuente.nota) { stats.yaCorrectas++; return; }
    if (actual === null) stats.cargadas++;
    else stats.corregidas++;
    actualizaciones.push({ docId: objetivo._docId, nota: fuente.nota, nombre: objetivo.NOMBRES, id: objetivo.ID, tipo: fuente.tipo });
  });
  stats.actualizadas = actualizaciones.length;
  stats.omitidas = stats.sinNotaEnReporte + stats.conflictosIdentidad + stats.yaCorrectas + stats.historialConservado + stats.soloEnReporte;
  return { actualizaciones, stats };
}
