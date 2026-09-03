// Pruebas de lógica de negocio (casos obligatorios 1-6).
// Ejecutar: node test-logica.mjs
import {
  normalizarCedula, vigenciaMesesCurso, estadoDeRegistro,
  clasificarRegistro, estadosPorPersona, addMeses, diffDias,
} from "./assets/js/capacitacion.js";

let fallos = 0;
function check(nombre, cond, detalle = "") {
  if (cond) console.log(`  ✅ ${nombre}`);
  else { fallos++; console.log(`  ❌ ${nombre} ${detalle}`); }
}

console.log("== Normalización de cédulas ==");
check("1036961650", normalizarCedula("1036961650") === "1036961650");
check("1.036.961.650", normalizarCedula("1.036.961.650") === "1036961650");
check("1 036 961 650", normalizarCedula("1 036 961 650") === "1036961650");
check('"1036961650"', normalizarCedula('"1036961650"') === "1036961650");
check("1036961650.0", normalizarCedula("1036961650.0") === "1036961650");
check("notación científica 1.03696E+9", normalizarCedula("1.03696E+9") === "1036960000" || normalizarCedula("1.03696E+9") === "1036961650");
check("vacío", normalizarCedula("") === "");

console.log("== Vigencia configurable ==");
check("Mercancías Peligrosas → 24", vigenciaMesesCurso("Mercancías Peligrosas") === 24);
check("mercancías peligrosas (minúsculas)", vigenciaMesesCurso("mercancías peligrosas") === 24);
check("Curso desconocido → default 24", vigenciaMesesCurso("Curso X") === 24);

console.log("== Estado por fecha ==");
const hoy = "2026-08-28";
const recVigente = { CURSO: "Mercancías Peligrosas", FECHA: "2026-08-10" };
const recProximo = { CURSO: "Mercancías Peligrosas", FECHA: "2026-07-15" }; // vencería 2028-07-15
const recVencido = { CURSO: "Mercancías Peligrosas", FECHA: "2023-01-10" };
const recSinFecha = { CURSO: "Mercancías Peligrosas", FECHA: "" };
check("fecha reciente → VIGENTE", estadoDeRegistro(recVigente, hoy).estado === "VIGENTE", `=> ${estadoDeRegistro(recVigente, hoy).estado}`);
check("fecha vieja → VENCIDO", estadoDeRegistro(recVencido, hoy).estado === "VENCIDO", `=> ${estadoDeRegistro(recVencido, hoy).estado}`);
check("sin fecha → SIN FECHA", estadoDeRegistro(recSinFecha, hoy).estado === "SIN FECHA");

console.log("== UPSERT: clasificarRegistro ==");
const existentes = [
  { _docId: "a1", ID: "1036961650", NOMBRES: "Cristian Bustamante", CURSO: "Mercancías Peligrosas", FECHA: "2026-08-10", ASISTIO: "SÍ", BASE: "MDE", GRUPO: "GRUPO R-AGO-02" },
];

// Caso 1 — registro nuevo (cédula/curso nuevos)
const nuevo = clasificarRegistro(
  { ID: "999999", NOMBRES: "Nueva Persona", CURSO: "Curso HSEQ", FECHA: "2026-09-01", ASISTIO: "SÍ" }, existentes, hoy);
check("Caso 1 (nuevo) → crear", nuevo.accion === "nuevo", `=> ${nuevo.accion}`);

// Caso 2 — misma cédula+curso dentro de vigencia → actualizar
const dentro = clasificarRegistro(
  { ID: "1036961650", NOMBRES: "Cristian Bustamante", CURSO: "Mercancías Peligrosas", FECHA: "2026-08-15", ASISTIO: "SÍ" }, existentes, hoy);
check("Caso 2 (dentro vigencia) → actualizar", dentro.accion === "actualizar", `=> ${dentro.accion}`);
check("Caso 2 → objetivo correcto", dentro.objetivo && dentro.objetivo._docId === "a1");

// Caso 2b — duplicado exacto (misma fecha) → sin cambios
const exacto = clasificarRegistro(
  { ID: "1036961650", NOMBRES: "Cristian Bustamante", CURSO: "Mercancías Peligrosas", FECHA: "2026-08-10", ASISTIO: "SÍ", BASE: "MDE", GRUPO: "GRUPO R-AGO-02" }, existentes, hoy);
check("Caso 2b (misma fecha idéntico) → sin cambios", exacto.accion === "sin_cambios", `=> ${exacto.accion}`);

// Caso 2c — misma fecha pero contenido distinto (cambio de base) → actualizar
const cambiaBase = clasificarRegistro(
  { ID: "1036961650", NOMBRES: "Cristian Bustamante", CURSO: "Mercancías Peligrosas", FECHA: "2026-08-10", ASISTIO: "SÍ", BASE: "BOG", GRUPO: "GRUPO R-AGO-02" }, existentes, hoy);
check("Caso 2c (misma fecha, cambia base) → actualizar", cambiaBase.accion === "actualizar", `=> ${cambiaBase.accion}`);

// Caso 3 — misma persona+curso a 24 meses exactos (2028 vs 2026) → NUEVA recurrencia
const vencido = clasificarRegistro(
  { ID: "1036961650", NOMBRES: "Cristian Bustamante", CURSO: "Mercancías Peligrosas", FECHA: "2028-08-10", ASISTIO: "SÍ", BASE: "MDE" }, existentes, hoy);
check("Caso 3 (distancia de 24 meses) → nuevo", vencido.accion === "nuevo", `=> ${vencido.accion} / ${vencido.motivo}`);

// Caso 3b — anterior vencido EN BASE: existente de 2023, nuevo 2026
const existentesViejos = [
  { _docId: "b1", ID: "111111", CURSO: "Mercancías Peligrosas", FECHA: "2023-05-01" },
];
const recurrencia = clasificarRegistro(
  { ID: "111111", NOMBRES: "Persona", CURSO: "Mercancías Peligrosas", FECHA: "2026-06-01", ASISTIO: "SÍ" }, existentesViejos, hoy);
check("Caso 3b (previo vencido 2023) → crear", recurrencia.accion === "nuevo", `=> ${recurrencia.accion} / ${recurrencia.motivo}`);

console.log("== estadosPorPersona ==");
const est = estadosPorPersona([
  { ID: "1", NOMBRES: "A", CURSO: "Mercancías Peligrosas", FECHA: "2026-08-01" },
  { ID: "1", NOMBRES: "A", CURSO: "Mercancías Peligrosas", FECHA: "2024-08-01" },
  { ID: "1", NOMBRES: "A", CURSO: "Otro curso", FECHA: "2020-01-01" },
], hoy);
check("recurrencia detectada (último vigente, hay anterior)", est.cursos[0].estado.estado === "REALIZÓ RECURRENCIA", `=> ${est.cursos[0].estado.estado}`);
check("curso vencido sigue visible", est.cursos.length === 2);

console.log("== Fechas ==");
check("addMeses", addMeses("2026-08-10", 24) === "2028-08-10");
check("diffDias positivo", diffDias("2026-09-01", "2026-08-28") === 4);

if (fallos === 0) {
  console.log("\n🎉 TODAS LAS PRUEBAS PASARON");
} else {
  console.log(`\n${fallos} prueba(s) FALLARON`);
  process.exitCode = 1;
}