/*
 * Lector progresivo para el XLSX real de Aprende Talma.
 * La hoja no incluye <dimension> y su XML supera 700 MB, por eso no se usa
 * XLSX.read(): el ZIP se descomprime por bloques y cada fila se descarta
 * después de revisarla.
 */
importScripts("https://cdn.jsdelivr.net/npm/fflate@0.8.2/umd/index.js");

const SHEET = "xl/worksheets/sheet1.xml";
const CURSO_INICIAL = "MERCANCIAS PELIGROSAS BASICO 8 HORAS TALMA INICIAL 2026V2";
const CURSO_RECURRENTE = "MERCANCIAS PELIGROSAS BASICO 4 HORAS TALMA RECURRENTE 2026V2";
const FILAS_ESTIMADAS = 550000;

const norm = value => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
const tipoCurso = value => {
  const key = norm(value);
  if (key === CURSO_INICIAL) return "inicial";
  if (key === CURSO_RECURRENTE) return "recurrente";
  return "";
};
const idNormal = value => String(value ?? "").replace(/\.0+$/, "").replace(/\D/g, "");
const notaNormal = value => {
  const n = Number(String(value ?? "").trim().replace("%", "").replace(",", "."));
  return Number.isFinite(n) && n >= 0 && n <= 100 ? Math.round(n) : null;
};
const xmlText = value => String(value ?? "")
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
const fechaClave = value => {
  const raw = String(value ?? "").trim();
  if (/^\d+(?:\.\d+)?$/.test(raw)) {
    const serial = Number(raw);
    if (serial > 0 && serial < 100000) return new Date(Date.UTC(1899, 11, 30) + serial * 86400000).toISOString();
  }
  const dmy = raw.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/);
  if (dmy) return `${dmy[3]}-${String(dmy[2]).padStart(2, "0")}-${String(dmy[1]).padStart(2, "0")}`;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? "0000-00-00" : parsed.toISOString();
};

function columnaNumero(letras) {
  let numero = 0;
  for (const letra of letras) numero = numero * 26 + letra.charCodeAt(0) - 64;
  return numero - 1;
}

function valoresFila(rowXml) {
  const values = [];
  const cellRe = /<c\s+r="([A-Z]+)\d+"[^>]*>([\s\S]*?)<\/c>/g;
  let cell;
  while ((cell = cellRe.exec(rowXml))) {
    const body = cell[2];
    const texts = [...body.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map(match => match[1]).join("");
    const numeric = body.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? "";
    values[columnaNumero(cell[1])] = xmlText(texts || numeric);
  }
  return values;
}

self.onmessage = event => {
  const latest = new Map();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  let headers = null;
  let filasLeidas = 0;
  let filasCurso = 0;
  let notasInvalidas = 0;
  let hojaEncontrada = false;
  let terminado = false;

  const fail = error => {
    if (terminado) return;
    terminado = true;
    self.postMessage({ type: "error", message: error?.message || String(error) });
  };

  const processRow = rowXml => {
    if (!headers) {
      const values = valoresFila(rowXml);
      headers = new Map(values.map((value, index) => [norm(value), index]).filter(([name]) => name));
      const required = ["CEDULA", "CURSO", "NOTA", "NOMBRE COMPLETO", "FECHA DE FINALIZACION DEL CURSO"];
      const missing = required.filter(name => !headers.has(name));
      if (missing.length) throw new Error(`Faltan columnas requeridas: ${missing.join(", ")}.`);
      return;
    }
    filasLeidas++;
    if (!rowXml.includes("MERCANCIAS PELIGROSAS BASICO")) return;
    const values = valoresFila(rowXml);
    const tipo = tipoCurso(values[headers.get("CURSO")]);
    if (!tipo) return;
    filasCurso++;
    const id = idNormal(values[headers.get("CEDULA")]);
    const nota = notaNormal(values[headers.get("NOTA")]);
    if (!id || nota === null) { notasInvalidas++; return; }
    const fecha = values[headers.get("FECHA DE FINALIZACION DEL CURSO")] || "";
    const item = { id, tipo, nota, nombre: String(values[headers.get("NOMBRE COMPLETO")] || "").trim(), fecha, fechaClave: fechaClave(fecha) };
    const key = `${id}|${tipo}`;
    const previo = latest.get(key);
    if (!previo || item.fechaClave > previo.fechaClave || (item.fechaClave === previo.fechaClave && item.nota > previo.nota)) latest.set(key, item);
  };

  try {
    const unzipper = new fflate.Unzip(file => {
      if (file.name !== SHEET) { file.terminate(); return; }
      hojaEncontrada = true;
      file.ondata = (error, chunk, final) => {
        if (error) return fail(error);
        try {
          buffer += decoder.decode(chunk, { stream: !final });
          let end;
          while ((end = buffer.indexOf("</row>")) >= 0) {
            const complete = buffer.slice(0, end + 6);
            buffer = buffer.slice(end + 6);
            const start = complete.lastIndexOf("<row");
            if (start >= 0) processRow(complete.slice(start));
            if (filasLeidas > 0 && filasLeidas % 25000 === 0) self.postMessage({ type: "progress", filasLeidas, total: FILAS_ESTIMADAS });
          }
          if (final && !terminado) {
            if (!headers) throw new Error("La hoja no contiene encabezados legibles.");
            terminado = true;
            const records = [...latest.values()].map(({ fechaClave: _, ...item }) => item);
            self.postMessage({ type: "done", records, statistics: { filasLeidas, filasCurso, unicos: records.length, notasInvalidas } });
          }
        } catch (parseError) { fail(parseError); }
      };
      file.start();
    });
    unzipper.register(fflate.UnzipInflate);
    const compressed = new Uint8Array(event.data);
    const ZIP_CHUNK = 512 * 1024;
    for (let offset = 0; offset < compressed.length; offset += ZIP_CHUNK) {
      const end = Math.min(offset + ZIP_CHUNK, compressed.length);
      unzipper.push(compressed.subarray(offset, end), end === compressed.length);
    }
    queueMicrotask(() => { if (!hojaEncontrada) fail(new Error("El archivo no contiene xl/worksheets/sheet1.xml.")); });
  } catch (error) { fail(error); }
};
