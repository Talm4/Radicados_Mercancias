#!/usr/bin/env python3
"""Actualiza en Firebase las notas de los dos cursos autorizados.

El reporte completo supera 50 MB. Este script lo procesa en streaming fuera
del navegador. Las cédulas y notas nunca se publican como un archivo web.
"""

import argparse
import html
import json
import os
import re
import tempfile
import unicodedata
import urllib.request
import zipfile
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP

REPORT_URL = "https://aprende.talma.com.co/reporteglobal.xlsx"
COURSE_INITIAL = "MERCANCIAS PELIGROSAS BASICO 8 HORAS - TALMA - INICIAL _ 2026V2"
COURSE_RECURRENT = "MERCANCIAS PELIGROSAS BASICO 4 HORAS - TALMA - RECURRENTE _ 2026V2"
ROW_END = b"</row>"
CELL_RE = re.compile(rb'<c r="([A-Z]+)\d+"[^>]*>(.*?)</c>')
TEXT_RE = re.compile(rb"<t(?:\s[^>]*)?>(.*?)</t>")
VALUE_RE = re.compile(rb"<v>(.*?)</v>")


def normalize(value):
    text = unicodedata.normalize("NFD", str(value or ""))
    text = "".join(char for char in text if unicodedata.category(char) != "Mn")
    return re.sub(r"[^A-Z0-9]+", " ", text.upper()).strip()


TARGETS = {
    normalize(COURSE_INITIAL): "inicial",
    normalize(COURSE_RECURRENT): "recurrente",
}


def normalize_id(value):
    text = str(value or "").strip()
    if re.fullmatch(r"\d+\.0+", text):
        text = text.split(".", 1)[0]
    return re.sub(r"\D", "", text)


def rounded_grade(value):
    text = str(value or "").strip().replace("%", "").replace(",", ".")
    try:
        number = Decimal(text)
    except InvalidOperation:
        return None
    if number < 0 or number > 100:
        return None
    return int(number.quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def column_number(letters):
    result = 0
    for char in letters:
        result = result * 26 + char - 64
    return result - 1


def row_values(row_xml):
    parsed = []
    width = 0
    for match in CELL_RE.finditer(row_xml):
        column = column_number(match.group(1))
        body = match.group(2)
        text_nodes = TEXT_RE.findall(body)
        raw_value = b"".join(text_nodes) if text_nodes else (VALUE_RE.search(body).group(1) if VALUE_RE.search(body) else b"")
        value = html.unescape(raw_value.decode("utf-8", errors="replace"))
        parsed.append((column, value))
        width = max(width, column + 1)
    values = [""] * width
    for column, value in parsed:
        values[column] = value
    return values


def iter_rows(sheet, chunk_size=1024 * 1024):
    buffer = b""
    while True:
        chunk = sheet.read(chunk_size)
        if not chunk:
            break
        buffer += chunk
        while True:
            end = buffer.find(ROW_END)
            if end < 0:
                break
            row = buffer[: end + len(ROW_END)]
            buffer = buffer[end + len(ROW_END) :]
            start = row.rfind(b"<row")
            if start >= 0:
                yield row[start:]


def download_report(url):
    handle, path = tempfile.mkstemp(suffix=".xlsx")
    os.close(handle)
    request = urllib.request.Request(url, headers={"User-Agent": "Talma-Notas-Sync/2.0"})
    try:
        with urllib.request.urlopen(request, timeout=180) as response, open(path, "wb") as output:
            while True:
                chunk = response.read(1024 * 1024)
                if not chunk:
                    break
                output.write(chunk)
    except Exception:
        if os.path.exists(path):
            os.remove(path)
        raise
    return path


def parse_report(path):
    records = {}
    headers = {}
    rows_scanned = 0
    matching_rows = 0
    invalid_grades = 0

    with zipfile.ZipFile(path) as archive, archive.open("xl/worksheets/sheet1.xml") as sheet:
        for row_number, row_xml in enumerate(iter_rows(sheet), start=1):
            if row_number == 1:
                values = row_values(row_xml)
                headers = {normalize(value): index for index, value in enumerate(values)}
                required = ["CEDULA", "CURSO", "NOTA", "NOMBRE COMPLETO", "FECHA DE FINALIZACION DEL CURSO"]
                missing = [name for name in required if name not in headers]
                if missing:
                    raise RuntimeError("Faltan columnas requeridas: " + ", ".join(missing))
                continue

            rows_scanned += 1
            if b"MERCANCIAS PELIGROSAS BASICO" not in row_xml:
                continue
            values = row_values(row_xml)
            course = values[headers["CURSO"]] if headers["CURSO"] < len(values) else ""
            course_type = TARGETS.get(normalize(course))
            if not course_type:
                continue

            matching_rows += 1
            employee_id = normalize_id(values[headers["CEDULA"]] if headers["CEDULA"] < len(values) else "")
            grade = rounded_grade(values[headers["NOTA"]] if headers["NOTA"] < len(values) else "")
            if not employee_id or grade is None:
                invalid_grades += 1
                continue

            name = values[headers["NOMBRE COMPLETO"]] if headers["NOMBRE COMPLETO"] < len(values) else ""
            completed = values[headers["FECHA DE FINALIZACION DEL CURSO"]] if headers["FECHA DE FINALIZACION DEL CURSO"] < len(values) else ""
            item = {
                "id": employee_id,
                "tipo": course_type,
                "nota": grade,
                "fecha": str(completed or ""),
                "nombre": str(name or "").strip(),
            }
            key = f"{employee_id}|{course_type}"
            previous = records.get(key)
            if previous is None or (item["fecha"], item["nota"]) > (previous["fecha"], previous["nota"]):
                records[key] = item

    return {
        "records": sorted(records.values(), key=lambda item: (item["id"], item["tipo"])),
        "statistics": {
            "rowsScanned": rows_scanned,
            "matchingRows": matching_rows,
            "uniquePeopleCourses": len(records),
            "invalidGrades": invalid_grades,
        },
    }


def platform_course_type(course):
    key = normalize(course)
    if "BASICO" not in key:
        return None
    if "INICIAL" in key:
        return "inicial"
    if "REPASO" in key or "RECURRENTE" in key or "RECURRENCIA" in key:
        return "recurrente"
    return None


def synchronize_firestore(parsed):
    try:
        from google.cloud import firestore
        from google.oauth2 import service_account
    except ImportError as error:
        raise RuntimeError("Instala google-cloud-firestore antes de sincronizar") from error

    raw_credentials = os.environ.get("FIREBASE_SERVICE_ACCOUNT", "").strip()
    if not raw_credentials:
        raise RuntimeError("Falta el secreto FIREBASE_SERVICE_ACCOUNT")
    info = json.loads(raw_credentials)
    credentials = service_account.Credentials.from_service_account_info(info)
    client = firestore.Client(project=info["project_id"], credentials=credentials)

    latest = {}
    history_ignored = 0
    for snapshot in client.collection("capacitaciones").stream():
        data = snapshot.to_dict() or {}
        employee_id = normalize_id(data.get("ID"))
        course_type = platform_course_type(data.get("CURSO"))
        if not employee_id or not course_type:
            continue
        key = f"{employee_id}|{course_type}"
        item = {"snapshot": snapshot, "data": data, "fecha": str(data.get("FECHA") or "")}
        previous = latest.get(key)
        if previous:
            history_ignored += 1
        if previous is None or (item["fecha"], snapshot.id) > (previous["fecha"], previous["snapshot"].id):
            latest[key] = item

    report_index = {f"{item['id']}|{item['tipo']}": item for item in parsed["records"]}
    changes = []
    unchanged = 0
    not_found = 0
    for key, item in latest.items():
        source = report_index.get(key)
        if source is None:
            not_found += 1
            continue
        current_grade = rounded_grade(item["data"].get("NOTA"))
        if current_grade == source["nota"]:
            unchanged += 1
            continue
        changes.append((item["snapshot"].reference, source))

    stamp = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    updated = 0
    for start in range(0, len(changes), 400):
        batch = client.batch()
        block = changes[start : start + 400]
        for reference, source in block:
            batch.update(reference, {
                "NOTA": str(source["nota"]),
                "NOTA_ORIGEN": "Reporte Aprende Talma",
                "NOTA_FECHA_REPORTE": source.get("fecha", ""),
                "NOTA_VERIFICADA_EN": stamp,
                "ultima_actualizacion": stamp[:16].replace("T", " "),
                "fecha_actualizacion": stamp[:16].replace("T", " "),
                "origen": "Reporte Aprende Talma",
            })
        batch.commit()
        updated += len(block)

    summary = {
        "status": "completado",
        "generatedAt": stamp,
        "source": REPORT_URL,
        "courses": {"inicial": COURSE_INITIAL, "recurrente": COURSE_RECURRENT},
        "report": parsed["statistics"],
        "synchronization": {
            "platformRecords": len(latest),
            "updated": updated,
            "unchanged": unchanged,
            "notFound": not_found,
            "historyIgnored": history_ignored,
            "onlyInReport": len(set(report_index) - set(latest)),
        },
    }
    client.collection("sincronizaciones").document("notasAprende").set(summary)
    return summary


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", default=REPORT_URL)
    parser.add_argument("--summary-output", default="assets/data/notas-resumen.json")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    temporary = False
    source_path = args.source
    if re.match(r"^https?://", source_path, flags=re.I):
        source_path = download_report(source_path)
        temporary = True

    try:
        parsed = parse_report(source_path)
        if args.dry_run:
            payload = {
                "status": "pendiente_configuracion",
                "generatedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
                "source": REPORT_URL,
                "courses": {"inicial": COURSE_INITIAL, "recurrente": COURSE_RECURRENT},
                "report": parsed["statistics"],
                "synchronization": None,
            }
        else:
            payload = synchronize_firestore(parsed)
        public_summary = {
            key: value for key, value in payload.items()
            if key in {"status", "generatedAt", "source", "courses", "report", "synchronization"}
        }
        os.makedirs(os.path.dirname(args.summary_output) or ".", exist_ok=True)
        with open(args.summary_output, "w", encoding="utf-8") as output:
            json.dump(public_summary, output, ensure_ascii=False, separators=(",", ":"))
            output.write("\n")
        print(json.dumps({
            "report": parsed["statistics"],
            "synchronization": payload.get("synchronization"),
        }, ensure_ascii=False))
    finally:
        if temporary and os.path.exists(source_path):
            os.remove(source_path)


if __name__ == "__main__":
    main()
