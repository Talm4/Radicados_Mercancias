import { parseHorasNumero } from "./utils.js";

const INSTRUCTORES_CERTIFICADO = new Map([
  ["ALVARO LOPEZ", { licencia: "94314461", tratamiento: "el Instructor" }],
  ["JUAN ARIAS", { licencia: "80022447", tratamiento: "el Instructor" }],
  ["ADRIANA VANEGAS", { licencia: "31172210", tratamiento: "la Instructora" }],
]);

function normalizarTexto(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ");
}

export function instructorCertificado(instructor) {
  const data = INSTRUCTORES_CERTIFICADO.get(normalizarTexto(instructor));
  return data ? { ...data } : null;
}

export function normalizarNumeroCertificado(value) {
  const raw = String(value || "").trim().toUpperCase();
  if (!raw) return "";
  const withoutDisplayPrefix = raw.replace(/^N\s*[°º]?\s*:\s*/, "");
  const match = withoutDisplayPrefix.match(/^(?:CI\s*[-:]?\s*)?(\d{1,12})$/);
  if (!match) return "";
  return `CI-${match[1].padStart(5, "0")}`;
}

export function secuenciaCertificado(value) {
  const normalized = normalizarNumeroCertificado(value);
  if (!normalized) return null;
  const sequence = Number(normalized.slice(3));
  return Number.isSafeInteger(sequence) ? sequence : null;
}

export function evaluarCertificacion(rec) {
  const attended = String(rec?.ASISTIO || "SÍ").trim().toUpperCase() !== "NO";
  if (!attended) return { elegible: false, motivo: "No asistió al curso." };
  const noteText = String(rec?.NOTA ?? "").trim().replace(",", ".");
  const match = noteText.match(/-?\d+(?:\.\d+)?/);
  const note = match ? Number(match[0]) : null;
  if (!Number.isFinite(note)) return { elegible: false, motivo: "No tiene una nota válida." };
  if (note <= 80) return { elegible: false, motivo: `La nota debe ser superior a 80. Nota registrada: ${note}.` };
  return { elegible: true, motivo: "", nota: note };
}

export function puedeCertificar(rec) {
  return evaluarCertificacion(rec).elegible;
}

function monthName(month) {
  return ["ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO", "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE"][month] || "";
}

export function dateWords(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || "")) return "FECHA SIN REGISTRAR";
  const [year, month, day] = iso.split("-").map(Number);
  return `${day} de ${monthName(month - 1)} de ${year}`;
}

function certifiedCourse(rec, category) {
  let course = String(rec.CURSO || "CURSO SIN REGISTRAR").trim();
  if (!/MERCANC[IÍ]AS PELIGROSAS/i.test(course)) course += " DE MERCANCÍAS PELIGROSAS";
  const cat = String(category || "").trim();
  return `${course.toUpperCase()}${cat ? ` - ${cat}` : ""}`;
}

function enabledGenderText(treatment) {
  if (treatment === "la Instructora") return "habilitada";
  if (treatment === "el Instructor") return "habilitado";
  return "habilitada";
}

export function certificateTexts(rec, config) {
  const runs = certificateTextRuns(rec, config);
  return {
    body: runs.body.map(run => run.text).join(""),
    instructorText: runs.instructor.map(run => run.text).join(""),
  };
}

function splitDate(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || "")) {
    return { day: "FECHA", month: "SIN REGISTRAR", year: "" };
  }
  const [year, month, day] = iso.split("-").map(Number);
  return { day: String(day), month: monthName(month - 1), year: String(year) };
}

export function certificateTextRuns(rec, config) {
  const hours = parseHorasNumero(rec.INTENSIDAD);
  const duration = hours || String(rec.INTENSIDAD || "").replace(/[^\d.,]/g, "") || "0";
  const note = String(rec.NOTA || "SIN NOTA").trim();
  const date = splitDate(rec.FECHA);
  const body = [
    { text: "Que el (la) Señor(a) " },
    { text: String(rec.NOMBRES || "SIN NOMBRE").toUpperCase(), bold: true },
    { text: " identificado con cédula de ciudadanía N° " },
    { text: String(rec.ID || "SIN IDENTIFICACIÓN"), bold: true },
    { text: ", participó y aprobó con una nota de " },
    { text: note, bold: true },
    { text: " el " },
    { text: `CURSO ${certifiedCourse(rec, config.CERT_CATEGORIA)}`, bold: true },
    { text: ", impartido mediante metodología " },
    { text: config.CERT_METODOLOGIA || "PRESENCIAL", bold: true },
    { text: " el día " },
    { text: date.day, bold: true },
    { text: " de " },
    { text: date.month, bold: true },
    { text: date.year ? " de " : "" },
    { text: date.year, bold: true },
    { text: ", con una intensidad de " },
    { text: String(duration), bold: true },
    { text: " hora(s) de acuerdo con el Programa de Entrenamiento vigente, aprobado para el centro de instrucción por la UAEAC y el Manual de directivas de Instrucción." },
  ];
  const instructorData = instructorCertificado(rec.INSTRUCTOR);
  const treatment = instructorData?.tratamiento || config.CERT_TRATAMIENTO_INSTRUCTOR || "la persona instructora";
  const license = instructorData?.licencia || config.CERT_LICENCIA_INSTRUCTOR || "SIN REGISTRAR";
  const instructor = String(rec.INSTRUCTOR || "SIN INSTRUCTOR").toUpperCase();
  const instructorRuns = [
    { text: "La capacitación en mención fue impartida en la ciudad de " },
    { text: config.CERT_CIUDAD || rec.BASE || "SIN REGISTRAR", bold: true },
    { text: ` por ${treatment}, ` },
    { text: instructor, bold: true },
    { text: ` ${enabledGenderText(treatment)} con licencia IET No. ` },
    { text: license, bold: true },
    { text: "." },
  ];
  return { body, instructor: instructorRuns };
}
