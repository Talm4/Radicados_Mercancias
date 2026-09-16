import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { aggregateRecords, buildDataModel, filterRecords } from "./assets/js/data-engine.js";
import {
  categoriaCertificadoPorCargo,
  certificateTextRuns,
  certificateTexts,
  dateWords,
  instructorCertificado,
  normalizarNumeroCertificado,
  planificarSeriadosAutomaticos,
  puedeCertificar,
  secuenciaCertificado,
} from "./assets/js/certificados-core.js";
import {
  CONSOLIDADO_HEADERS, detectarFilaEncabezados, mapearEncabezados,
  normalizarFilaExcel, normalizarNombreCurso, registroAFormatoConsolidado,
} from "./assets/js/utils.js";
import { nombresCompatibles, planificarActualizacionesNotas, tipoCursoPlataforma } from "./assets/js/notas-core.js";
import {
  TAMANO_LOTE_FIRESTORE, categorizarFilasImportacion, idDeterministaRegistro,
  lotesDe, paginaPrevia,
} from "./assets/js/importacion-resiliente.js";

const bases = ["BOG", "MDE", "CTG", "CLO", "BAQ"];
const courses = ["Básico Inicial", "Básico Recurrente", "Refuerzo", "Especializado"];
const instructors = ["ANA", "LUIS", "MARÍA", "CARLOS"];
const records = Array.from({ length: 12000 }, (_, i) => ({
  _docId: `doc-${i}`,
  ID: String(100000 + (i % 4000)),
  NOMBRES: `PERSONA ${i % 4000}`,
  CURSO: courses[i % courses.length],
  PROGRAMA: "Mercancías Peligrosas",
  FECHA: `2026-${String((i % 6) + 1).padStart(2, "0")}-${String((i % 27) + 1).padStart(2, "0")}`,
  INTENSIDAD: `${4 + (i % 5)} horas`,
  BASE: bases[i % bases.length],
  HORA: "08:00",
  SALON: `S-${i % 8}`,
  GRUPO: `G-${i % 80}`,
  CARGO: "Agente",
  CORREO: `persona${i % 4000}@example.test`,
  INSTRUCTOR: instructors[i % instructors.length],
  ASISTIO: i % 9 === 0 ? "NO" : "SÍ",
  NOTA: String(60 + (i % 41)),
  OBSERVACION: "",
}));

const t0 = performance.now();
const model = buildDataModel(records, "2026-08-31");
const buildMs = performance.now() - t0;
assert.equal(model.byId.size, 12000);
assert.equal(model.options.base.length, bases.length);

const t1 = performance.now();
const filtered = filterRecords(model, { busqueda: "persona 12", desde: "", hasta: "", semestre: "todos", asistio: "", base: "BOG", grupo: "", curso: "", instructor: "", salon: "", estado: "", soloDuplicados: false, soloRevision: false });
const filterMs = performance.now() - t1;
assert.ok(filtered.length > 0);
assert.ok(filtered.every(r => r.BASE === "BOG"));

const t2 = performance.now();
const metrics = aggregateRecords(filtered);
const aggregateMs = performance.now() - t2;
assert.equal(metrics.summary.registros, filtered.length);
assert.equal(metrics.by.base.length, 1);
assert.equal("promedioNota" in metrics.summary, false);

const certificate = certificateTexts({
  NOMBRES: "Alexander Escobar Pajaro", ID: "1047446658", CURSO: "Básico Inicial",
  FECHA: "2026-07-24", INTENSIDAD: "8 horas", NOTA: "100", BASE: "ADZ",
  INSTRUCTOR: "Adriana Vanegas",
}, {
  CERT_CATEGORIA: "Cat. 8", CERT_METODOLOGIA: "PRESENCIAL", CERT_CIUDAD: "ADZ",
  CERT_TRATAMIENTO_INSTRUCTOR: "la Instructora", CERT_LICENCIA_INSTRUCTOR: "31172210",
});
assert.equal(dateWords("2026-07-24"), "24 de JULIO de 2026");
assert.match(certificate.body, /ALEXANDER ESCOBAR PAJARO/);
assert.match(certificate.body, /BÁSICO INICIAL DE MERCANCÍAS PELIGROSAS - Cat\. 8/);
assert.match(certificate.instructorText, /ADRIANA VANEGAS habilitada con licencia IET No\. 31172210/);
const richCertificate = certificateTextRuns({
  NOMBRES: "Alexander Escobar Pajaro", ID: "1047446658", CURSO: "Básico Inicial",
  FECHA: "2026-07-24", INTENSIDAD: "8 horas", NOTA: "100", BASE: "ADZ",
  INSTRUCTOR: "Adriana Vanegas",
}, {
  CERT_CATEGORIA: "Cat. 8", CERT_METODOLOGIA: "PRESENCIAL", CERT_CIUDAD: "ADZ",
  CERT_TRATAMIENTO_INSTRUCTOR: "la Instructora", CERT_LICENCIA_INSTRUCTOR: "31172210",
});
const boldBody = richCertificate.body.filter(run => run.bold).map(run => run.text).join("|");
assert.match(boldBody, /ALEXANDER ESCOBAR PAJARO/);
assert.match(boldBody, /1047446658/);
assert.match(boldBody, /PRESENCIAL/);
assert.match(boldBody, /24\|JULIO\|2026/);
assert.ok(richCertificate.instructor.some(run => run.bold && run.text === "ADRIANA VANEGAS"));
assert.equal(puedeCertificar({ ASISTIO: "NO", NOTA: "100" }), false);
assert.equal(puedeCertificar({ ASISTIO: "SÍ", NOTA: "80" }), false);
assert.equal(puedeCertificar({ ASISTIO: "SÍ", NOTA: "80,5" }), true);
assert.equal(puedeCertificar({ ASISTIO: "SÍ", NOTA: "100" }), true);
assert.deepEqual(instructorCertificado("ÁLVARO LÓPEZ"), { licencia: "94314461", tratamiento: "el Instructor" });
assert.deepEqual(instructorCertificado("JUAN ARIAS"), { licencia: "80022447", tratamiento: "el Instructor" });
assert.deepEqual(instructorCertificado("ADRIANA VANEGAS"), { licencia: "31172210", tratamiento: "la Instructora" });
const cargosCategoria9 = [
  "AGENTE DE SERVICIO AL CLIENTE",
  "AGENTE DE SERVICIOS ESPECIALES",
  "SUPERVISOR DE SERVICIO AL CLIENTE JUNIOR",
  "AGENTE DE OPERACIONES DE VUELO",
  "SUPERVISOR DE SERVICIO AL CLIENTE JUNIOR - ENCARGO",
  "AGENTE SERVICIOS ESPECIALES",
  "APRENDIZ AGENTE DE SERVICIOS ESPECIALES",
  "COORDINADOR DE SERVICIO AL CLIENTE",
  "AGENTE_ARGENTINAS_COBRO_PAX",
  "JEFE DE SERVICIO AL PASAJERO BOG",
  "ESPECIALISTA CENTRO CONTROL OPERACIONES",
  "COORDINADOR DE SERVICIO AL CLIENTE SENIOR",
];
cargosCategoria9.forEach(cargo => assert.equal(categoriaCertificadoPorCargo(cargo), "Cat. 9", cargo));
assert.equal(categoriaCertificadoPorCargo("AUXILIAR DE ASISTENCIA EN TIERRA"), "Cat. 8");
assert.equal(categoriaCertificadoPorCargo("AGENTE   OPERACIONES TERRESTRES\u00a0"), "Cat. 8");
assert.equal(categoriaCertificadoPorCargo("COORDINADOR PRM Y PUENTES DE ABORDAJE"), "Cat. 8");
const category9Certificate = certificateTexts({
  NOMBRES: "Persona Categoria Nueve", ID: "100000002", CARGO: "Agente de servicio al cliente",
  CURSO: "Básico Repaso", FECHA: "2026-09-15", INTENSIDAD: "4 horas", NOTA: "95",
  BASE: "BOG", INSTRUCTOR: "Adriana Vanegas", ASISTIO: "SÍ",
}, { CERT_CATEGORIA: "Cat. 8", CERT_CIUDAD: "BOG" });
assert.match(category9Certificate.body, /BÁSICO REPASO DE MERCANCÍAS PELIGROSAS - Cat\. 9/);
const category8Certificate = certificateTexts({
  NOMBRES: "Persona Categoria Ocho", ID: "100000003", CARGO: "AUXILIAR DE ASISTENCIA EN TIERRA",
  CURSO: "Básico Inicial", FECHA: "2026-09-15", INTENSIDAD: "8 horas", NOTA: "95",
  BASE: "BOG", INSTRUCTOR: "Adriana Vanegas", ASISTIO: "SÍ",
}, { CERT_CATEGORIA: "Cat. 9", CERT_CIUDAD: "BOG" });
assert.match(category8Certificate.body, /BÁSICO INICIAL DE MERCANCÍAS PELIGROSAS - Cat\. 8/);
const juanCertificate = certificateTexts({
  NOMBRES: "Persona Prueba", ID: "100000001", CURSO: "Básico Inicial", FECHA: "2026-07-24",
  INTENSIDAD: "8 horas", NOTA: "95", BASE: "BOG", INSTRUCTOR: "Juan Arias", ASISTIO: "SÍ",
}, { CERT_CATEGORIA: "Cat. 8", CERT_CIUDAD: "BOG", CERT_LICENCIA_INSTRUCTOR: "INCORRECTA" });
assert.match(juanCertificate.instructorText, /JUAN ARIAS habilitado con licencia IET No\. 80022447/);
assert.equal(normalizarNumeroCertificado("N°: CI-15161"), "CI-15161");
assert.equal(normalizarNumeroCertificado("15162"), "CI-15162");
assert.equal(secuenciaCertificado("CI-15162"), 15162);
const planSeriados = planificarSeriadosAutomaticos([
  { ID: "HISTORICO", CERT_NUMERO: "CI-15170" },
], [
  { ID: "NUEVO-TRES", NOMBRES: "Más reciente", FECHA: "2026-09-03", ASISTIO: "SÍ", NOTA: "95" },
  { ID: "NUEVO-UNO", NOMBRES: "Más antiguo", FECHA: "2026-09-01", ASISTIO: "SÍ", NOTA: "100" },
  { ID: "MIGRADO", NOMBRES: "Con código", FECHA: "2026-08-01", ASISTIO: "SÍ", NOTA: "90", CERT_NUMERO: "CI-15175" },
  { ID: "NUEVO-DOS", NOMBRES: "Intermedio", FECHA: "2026-09-02", ASISTIO: "SÍ", NOTA: "85" },
  { ID: "NO-ELEGIBLE", NOMBRES: "Sin aprobación", FECHA: "2026-07-01", ASISTIO: "SÍ", NOTA: "80" },
]);
assert.equal(planSeriados.numeroPorPersona.get("MIGRADO"), "CI-15175");
assert.equal(planSeriados.numeroPorPersona.get("NUEVO-UNO"), "CI-15176");
assert.equal(planSeriados.numeroPorPersona.get("NUEVO-DOS"), "CI-15177");
assert.equal(planSeriados.numeroPorPersona.get("NUEVO-TRES"), "CI-15178");
assert.equal(planSeriados.numeroPorPersona.has("NO-ELEGIBLE"), false);
assert.equal(planSeriados.siguienteNumero, "CI-15179");
const migrationHeaders = mapearEncabezados(["Cédula", "Nombres y apellidos", "N° Certificado"]);
const migrated = normalizarFilaExcel({ "Cédula": "1047446658", "Nombres y apellidos": "Alexander Escobar", "N° Certificado": "CI-15161" }, migrationHeaders);
assert.equal(migrated.CERT_NUMERO, "CI-15161");
assert.equal(normalizarNombreCurso("BASICO inicial"), "Básico Inicial");
assert.equal(normalizarNombreCurso("Básico Recurrente"), "Básico Repaso");
assert.equal(normalizarNombreCurso("básico repaso"), "Básico Repaso");
const plantillaHeaders = ["AÑO", "MES", "PROGRAMA DE ENTRENAMIENTO", "CURSO", "INTENSIDAD", "BASE", "FECHA", "HORA", "SALÓN", "GRUPO", "ID", "NOMBRES Y APELLIDOS", "CARGO", "CORREO", "INSTRUCTOR", "ASISTIÓ", "NOTA", "OBSERVACIÓN", "RADICADO", "BASE CURSO", "INCIAL", "VMP I", "RECURRENTE", "VMP R", "ME", "OB", "N° CERTIFICADO"];
assert.deepEqual(CONSOLIDADO_HEADERS, plantillaHeaders);
const detectedHeaders = detectarFilaEncabezados([
  ["Etiquetas de fila", "Cuenta de ID"],
  [],
  plantillaHeaders,
]);
assert.equal(detectedHeaders.index, 2);
assert.equal(detectedHeaders.mapa.ID, "ID");
assert.equal(detectedHeaders.mapa.NOMBRES, "NOMBRES Y APELLIDOS");
const exportedRecord = registroAFormatoConsolidado({ ...records[0], FECHA: "2026-08-31", CURSO: "Básico recurrente" });
assert.equal(exportedRecord["AÑO"], 2026);
assert.equal(exportedRecord["MES"], 8);
assert.equal(exportedRecord.CURSO, "Básico Repaso");
assert.equal(exportedRecord["N° CERTIFICADO"], "");
assert.equal(Object.keys(exportedRecord).length, CONSOLIDADO_HEADERS.length);
assert.equal(tipoCursoPlataforma("Mercancías Peligrosas BÁSICO INICIAL"), "inicial");
assert.equal(tipoCursoPlataforma("Básico recurrencia"), "recurrente");
assert.equal(nombresCompatibles("GERALDINE ROJAS GARCIA", "Geraldine Rojas García"), true);
const planNotas = planificarActualizacionesNotas([
  { _docId: "viejo", ID: "1.047.489.195", NOMBRES: "Geraldine Rojas Garcia", CURSO: "Básico repaso", FECHA: "2025-01-01", NOTA: "70" },
  { _docId: "reciente", ID: "1047489195", NOMBRES: "GERALDINE ROJAS GARCÍA", CURSO: "BÁSICO RECURRENTE", FECHA: "2026-02-02", NOTA: "75" },
], [
  { id: "1047489195", tipo: "recurrente", nombre: "Geraldine Rojas Garcia", nota: 92, fecha: "2026-02-03" },
]);
assert.deepEqual(planNotas.actualizaciones.map(item => item.docId), ["reciente"]);
assert.equal(planNotas.actualizaciones[0].nota, 92);
assert.equal(planNotas.stats.historialConservado, 1);

const filasImportacion = Array.from({ length: 5207 }, (_, i) => ({
  fila: i + 2,
  accion: i % 10 === 0 ? "actualizar" : "nuevo",
  erroresFinal: i % 97 === 0 ? ["Dato inválido"] : [],
  rec: records[i % records.length],
}));
const categoriasImportacion = categorizarFilasImportacion(filasImportacion);
assert.equal(Object.values(categoriasImportacion).reduce((n, grupo) => n + grupo.length, 0), 5207);
const ultimaPagina = paginaPrevia(categoriasImportacion.nuevos, 999, 50);
assert.ok(ultimaPagina.filas.length <= 50);
assert.equal(ultimaPagina.pagina, ultimaPagina.paginas);
const lotesImportacion = lotesDe(Array.from({ length: 5207 }, (_, i) => i), TAMANO_LOTE_FIRESTORE);
assert.equal(lotesImportacion.length, 12);
assert.ok(lotesImportacion.every(lote => lote.length <= 450));
assert.equal(idDeterministaRegistro(records[0]), idDeterministaRegistro({ ...records[0] }));
assert.notEqual(idDeterministaRegistro(records[0]), idDeterministaRegistro(records[1]));
assert.notEqual(idDeterministaRegistro(records[0]), idDeterministaRegistro({ ...records[0], GRUPO: "OTRO GRUPO" }));


// Umbrales deliberadamente holgados: detectan regresiones algorítmicas
// (por ejemplo O(n²)) sin depender de una máquina concreta.
assert.ok(buildMs < 4000, `Indexación demasiado lenta: ${buildMs.toFixed(1)} ms`);
assert.ok(filterMs < 1000, `Filtro demasiado lento: ${filterMs.toFixed(1)} ms`);
assert.ok(aggregateMs < 1000, `Agregación demasiado lenta: ${aggregateMs.toFixed(1)} ms`);
console.log(JSON.stringify({ records: records.length, filtered: filtered.length, buildMs: +buildMs.toFixed(1), filterMs: +filterMs.toFixed(1), aggregateMs: +aggregateMs.toFixed(1) }));
