import { parseHorasNumero } from "./utils.js";

export function puedeCertificar(rec) {
  return String(rec?.ASISTIO || "SÍ").trim().toUpperCase() !== "NO";
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
  const treatment = config.CERT_TRATAMIENTO_INSTRUCTOR || "la Instructora";
  const license = config.CERT_LICENCIA_INSTRUCTOR || "SIN REGISTRAR";
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
