import { certificateTextRuns } from "./certificados-core.js";

function sanitizePdfText(value) {
  return String(value || "")
    .replace(/[–—]/g, "-")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'");
}

// Las fuentes /F1 y /F3 son Calibri y Calibri Bold, ya incrustadas en la
// plantilla institucional. Se reutilizan directamente para no sustituir la
// identidad tipográfica ni volver a distribuir archivos de fuente externos.
function fontMetrics(PDFLib, page, resourceName) {
  const { PDFArray, PDFDict, PDFName, PDFNumber } = PDFLib;
  const fonts = page.node.Resources().lookup(PDFName.of("Font"), PDFDict);
  const font = fonts.lookup(PDFName.of(resourceName), PDFDict);
  const firstChar = font.lookup(PDFName.of("FirstChar"), PDFNumber).asNumber();
  const widths = font.lookup(PDFName.of("Widths"), PDFArray);
  return {
    width(text, size) {
      return [...winAnsiBytes(text)].reduce((sum, code) => {
        const index = code - firstChar;
        if (index < 0 || index >= widths.size()) return sum + size * 0.5;
        const item = widths.lookup(index, PDFNumber);
        return sum + (item?.asNumber?.() || 500) * size / 1000;
      }, 0);
    },
  };
}

function winAnsiBytes(value) {
  const replacements = new Map([
    ["€", 0x80], ["‚", 0x82], ["ƒ", 0x83], ["„", 0x84], ["…", 0x85],
    ["†", 0x86], ["‡", 0x87], ["ˆ", 0x88], ["‰", 0x89], ["Š", 0x8a],
    ["‹", 0x8b], ["Œ", 0x8c], ["Ž", 0x8e], ["‘", 0x91], ["’", 0x92],
    ["“", 0x93], ["”", 0x94], ["•", 0x95], ["–", 0x96], ["—", 0x97],
    ["˜", 0x98], ["™", 0x99], ["š", 0x9a], ["›", 0x9b], ["œ", 0x9c],
    ["ž", 0x9e], ["Ÿ", 0x9f],
  ]);
  return Array.from(sanitizePdfText(value), char => {
    const code = char.charCodeAt(0);
    if (code <= 255) return code;
    return replacements.get(char) || 0x3f;
  });
}

function winAnsiHex(value) {
  return winAnsiBytes(value).map(code => code.toString(16).padStart(2, "0")).join("").toUpperCase();
}

function drawResourceText(PDFLib, page, text, { x, y, size, bold = false }) {
  const { PDFHexString, PDFName, beginText, endText, moveText, setFontAndSize, showText } = PDFLib;
  if (!text) return;
  page.pushOperators(
    beginText(),
    setFontAndSize(PDFName.of(bold ? "F3" : "F1"), size),
    moveText(x, y),
    showText(PDFHexString.of(winAnsiHex(text))),
    endText(),
  );
}

function drawRichText(PDFLib, page, runs, { x, y, width, size = 11, lineHeight = 14.4 }) {
  const regular = fontMetrics(PDFLib, page, "F1");
  const bold = fontMetrics(PDFLib, page, "F3");
  let cursorX = x;
  let cursorY = y;

  runs.forEach(run => {
    const metrics = run.bold ? bold : regular;
    sanitizePdfText(run.text).match(/\s+|[^\s]+/g)?.forEach(token => {
      const whitespace = /^\s+$/.test(token);
      const rendered = whitespace ? " " : token;
      const tokenWidth = metrics.width(rendered, size);
      if (!whitespace && cursorX > x && cursorX + tokenWidth > x + width) {
        cursorX = x;
        cursorY -= lineHeight;
      }
      if (whitespace && cursorX === x) return;
      drawResourceText(PDFLib, page, rendered, { x: cursorX, y: cursorY, size, bold: run.bold });
      cursorX += tokenWidth;
    });
  });
  return cursorY;
}

export async function createCertificatePdf(PDFLib, templateBytes, rec, config, certificateNumber) {
  const { PDFDocument, rgb } = PDFLib;
  const pdfDoc = await PDFDocument.load(templateBytes);
  const page = pdfDoc.getPages()[0];
  const white = rgb(1, 1, 1);
  const runs = certificateTextRuns(rec, config);

  page.drawRectangle({ x: 30, y: 218, width: 735, height: 150, color: white });
  page.drawRectangle({ x: 686, y: 480, width: 104, height: 30, color: white });
  drawResourceText(PDFLib, page, `N°: ${certificateNumber}`, { x: 704, y: 487, size: 8.5 });

  drawRichText(PDFLib, page, runs.body, { x: 36, y: 350, width: 720 });
  drawRichText(PDFLib, page, runs.instructor, { x: 36, y: 276, width: 720 });
  return pdfDoc.save();
}
