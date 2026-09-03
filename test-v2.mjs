import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { aggregateRecords, buildDataModel, filterRecords } from "./assets/js/data-engine.js";
import { certificateTextRuns, certificateTexts, dateWords, puedeCertificar } from "./assets/js/certificados-core.js";

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
assert.equal(puedeCertificar({ ASISTIO: "NO" }), false);
assert.equal(puedeCertificar({ ASISTIO: "SÍ" }), true);

// Umbrales deliberadamente holgados: detectan regresiones algorítmicas
// (por ejemplo O(n²)) sin depender de una máquina concreta.
assert.ok(buildMs < 4000, `Indexación demasiado lenta: ${buildMs.toFixed(1)} ms`);
assert.ok(filterMs < 1000, `Filtro demasiado lento: ${filterMs.toFixed(1)} ms`);
assert.ok(aggregateMs < 1000, `Agregación demasiado lenta: ${aggregateMs.toFixed(1)} ms`);
console.log(JSON.stringify({ records: records.length, filtered: filtered.length, buildMs: +buildMs.toFixed(1), filterMs: +filterMs.toFixed(1), aggregateMs: +aggregateMs.toFixed(1) }));
