#!/usr/bin/env python3
"""Audita en modo de solo lectura las notas de los dos cursos autorizados.

El reporte completo supera 50 MB. Este script lo procesa en streaming fuera
del navegador. La actualización operativa la ejecuta este mismo archivo.
"""

import argparse
import html
import json
import os
import re
import tempfile
import unicodedata
import urllib.request
import urllib.parse
import zipfile
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP

REPORT_URL = "https://aprende.talma.com.co/reporteglobal.xlsx"
FIREBASE_API_KEY = "AIzaSyD4KlXPtSo-V4LqaBqc1HlRY3-KvK9RJDo"
FIRESTORE_ROOT = "https://firestore.googleapis.com/v1/projects/talma-datacenter/databases/(default)/documents"
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


def names_compatible(left, right):
    tokens_left = {token for token in normalize(left).split() if len(token) > 1}
    tokens_right = {token for token in normalize(right).split() if len(token) > 1}
    if not tokens_left or not tokens_right:
        return True
    return len(tokens_left & tokens_right) / min(len(tokens_left), len(tokens_right)) >= 0.6


def firestore_scalar(value):
    if not isinstance(value, dict):
        return ""
    for key in ("stringValue", "integerValue", "doubleValue", "booleanValue", "timestampValue"):
        if key in value:
            return value[key]
    return ""


def audit_public_firestore(parsed):
    """Auditoría de solo lectura usando la misma API pública que consume la web."""
    base_url = FIRESTORE_ROOT + "/capacitaciones"
    page_token = ""
    documents = []
    while True:
        query = {"pageSize": "1000", "key": FIREBASE_API_KEY}
        if page_token:
            query["pageToken"] = page_token
        request = urllib.request.Request(base_url + "?" + urllib.parse.urlencode(query), headers={"User-Agent": "Talma-Notas-Audit/3.0"})
        with urllib.request.urlopen(request, timeout=90) as response:
            payload = json.load(response)
        documents.extend(payload.get("documents", []))
        page_token = payload.get("nextPageToken", "")
        if not page_token:
            break

    latest = {}
    for document in documents:
        fields = {key: firestore_scalar(value) for key, value in document.get("fields", {}).items()}
        employee_id = normalize_id(fields.get("ID"))
        course_type = platform_course_type(fields.get("CURSO"))
        if not employee_id or not course_type:
            continue
        key = f"{employee_id}|{course_type}"
        item = {"fields": fields, "date": str(fields.get("FECHA") or ""), "name": document.get("name", "")}
        previous = latest.get(key)
        if previous is None or (item["date"], item["name"]) > (previous["date"], previous["name"]):
            latest[key] = item

    report_index = {f"{item['id']}|{item['tipo']}": item for item in parsed["records"]}
    result = {"platformRecords": len(latest), "matched": 0, "missing": 0, "incorrect": 0, "correct": 0, "notFound": 0, "identityConflicts": 0}
    for key, item in latest.items():
        source = report_index.get(key)
        if source is None:
            result["notFound"] += 1
            continue
        if not names_compatible(item["fields"].get("NOMBRES"), source.get("nombre")):
            result["identityConflicts"] += 1
            continue
        result["matched"] += 1
        current = rounded_grade(item["fields"].get("NOTA"))
        if current is None:
            result["missing"] += 1
        elif current != source["nota"]:
            result["incorrect"] += 1
        else:
            result["correct"] += 1
    return result


def encode_firestore_value(value):
    if value is None:
        return {"nullValue": None}
    if isinstance(value, bool):
        return {"booleanValue": value}
    if isinstance(value, int):
        return {"integerValue": str(value)}
    if isinstance(value, float):
        return {"doubleValue": value}
    if isinstance(value, dict):
        return {"mapValue": {"fields": {key: encode_firestore_value(item) for key, item in value.items()}}}
    if isinstance(value, (list, tuple)):
        return {"arrayValue": {"values": [encode_firestore_value(item) for item in value]}}
    return {"stringValue": str(value)}


def request_json(url, method="GET", payload=None, timeout=120, bearer_token=""):
    data = None if payload is None else json.dumps(payload, ensure_ascii=False).encode("utf-8")
    headers = {"User-Agent": "Talma-Notas-Sync/3.1"}
    if data is not None:
        headers["Content-Type"] = "application/json; charset=utf-8"
    if bearer_token:
        headers["Authorization"] = "Bearer " + bearer_token
    request = urllib.request.Request(url, data=data, method=method, headers=headers)
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return json.load(response) if response.length != 0 else {}


def load_firestore_documents(bearer_token=""):
    page_token = ""
    documents = []
    while True:
        query = {"pageSize": "1000", "key": FIREBASE_API_KEY}
        if page_token:
            query["pageToken"] = page_token
        payload = request_json(FIRESTORE_ROOT + "/capacitaciones?" + urllib.parse.urlencode(query), bearer_token=bearer_token)
        documents.extend(payload.get("documents", []))
        page_token = payload.get("nextPageToken", "")
        if not page_token:
            return documents


def batch_write(writes, bearer_token):
    endpoint = FIRESTORE_ROOT.rsplit("/documents", 1)[0] + "/documents:batchWrite?" + urllib.parse.urlencode({"key": FIREBASE_API_KEY})
    for start in range(0, len(writes), 400):
        request_json(endpoint, method="POST", payload={"writes": writes[start:start + 400]}, timeout=180, bearer_token=bearer_token)


def save_summary(summary, bearer_token):
    endpoint = FIRESTORE_ROOT + "/sincronizaciones/notasAprende?" + urllib.parse.urlencode({"key": FIREBASE_API_KEY})
    fields = {key: encode_firestore_value(value) for key, value in summary.items()}
    request_json(endpoint, method="PATCH", payload={"fields": fields}, bearer_token=bearer_token)


def service_account_token():
    try:
        from google.auth.transport.requests import Request
        from google.oauth2 import service_account
    except ImportError as error:
        raise RuntimeError("Falta google-auth. Ejecuta: pip install google-auth") from error

    raw = os.environ.get("FIREBASE_SERVICE_ACCOUNT", "").strip()
    credentials_file = os.environ.get("FIREBASE_SERVICE_ACCOUNT_FILE", "").strip()
    if raw:
        info = json.loads(raw)
        credentials = service_account.Credentials.from_service_account_info(
            info, scopes=["https://www.googleapis.com/auth/datastore"]
        )
    elif credentials_file:
        credentials = service_account.Credentials.from_service_account_file(
            credentials_file, scopes=["https://www.googleapis.com/auth/datastore"]
        )
    else:
        raise RuntimeError(
            "Falta la credencial local de Firebase. Guarda el JSON como "
            "firebase-service-account.json junto a servidor.py o indica su ruta "
            "en FIREBASE_SERVICE_ACCOUNT_FILE."
        )
    credentials.refresh(Request())
    return credentials.token


def synchronize_public_firestore(parsed, bearer_token=""):
    """Escribe mediante REST autenticado; Firestore continúa en el plan normal."""
    bearer_token = bearer_token or service_account_token()
    documents = load_firestore_documents(bearer_token)
    latest = {}
    history_ignored = 0
    for document in documents:
        fields = {key: firestore_scalar(value) for key, value in document.get("fields", {}).items()}
        employee_id = normalize_id(fields.get("ID"))
        course_type = platform_course_type(fields.get("CURSO"))
        if not employee_id or not course_type:
            continue
        key = f"{employee_id}|{course_type}"
        item = {"fields": fields, "date": str(fields.get("FECHA") or ""), "name": document.get("name", "")}
        previous = latest.get(key)
        if previous:
            history_ignored += 1
        if previous is None or (item["date"], item["name"]) > (previous["date"], previous["name"]):
            latest[key] = item

    report_index = {f"{item['id']}|{item['tipo']}": item for item in parsed["records"]}
    counts = {"platformRecords": len(latest), "matched": 0, "loaded": 0, "corrected": 0, "confirmed": 0, "notFound": 0, "identityConflicts": 0, "historyIgnored": history_ignored}
    writes = []
    verified_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    field_paths = ["NOTA", "NOTA_ORIGEN", "NOTA_FECHA_REPORTE", "NOTA_VERIFICADA_EN", "ultima_actualizacion", "fecha_actualizacion", "origen"]

    for key, item in latest.items():
        source = report_index.get(key)
        if source is None:
            counts["notFound"] += 1
            continue
        if not names_compatible(item["fields"].get("NOMBRES"), source.get("nombre")):
            counts["identityConflicts"] += 1
            continue
        counts["matched"] += 1
        current = rounded_grade(item["fields"].get("NOTA"))
        if current is None:
            counts["loaded"] += 1
        elif current != source["nota"]:
            counts["corrected"] += 1
        else:
            counts["confirmed"] += 1

        trace_current = (
            current == source["nota"]
            and item["fields"].get("NOTA_ORIGEN") == "Reporte Aprende Talma"
            and str(item["fields"].get("NOTA_FECHA_REPORTE") or "") == str(source.get("fecha") or "")
        )
        if trace_current:
            continue
        update = {
            "NOTA": str(source["nota"]),
            "NOTA_ORIGEN": "Reporte Aprende Talma",
            "NOTA_FECHA_REPORTE": str(source.get("fecha") or ""),
            "NOTA_VERIFICADA_EN": verified_at,
            "ultima_actualizacion": verified_at[:16].replace("T", " "),
            "fecha_actualizacion": verified_at[:16].replace("T", " "),
            "origen": "Reporte Aprende Talma",
        }
        writes.append({
            "update": {"name": item["name"], "fields": {name: encode_firestore_value(value) for name, value in update.items()}},
            "updateMask": {"fieldPaths": field_paths},
        })

    batch_write(writes, bearer_token)
    counts["writeOperations"] = len(writes)
    counts["onlyInReport"] = len(set(report_index) - set(latest))
    summary = {
        "status": "completado",
        "generatedAt": verified_at,
        "source": REPORT_URL,
        "executor": "Código del repositorio (sin Firebase Functions)",
        "courses": {"inicial": COURSE_INITIAL, "recurrente": COURSE_RECURRENT},
        "report": parsed["statistics"],
        "synchronization": counts,
    }
    save_summary(summary, bearer_token)
    return summary


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", default=REPORT_URL)
    parser.add_argument("--audit-public", action="store_true")
    parser.add_argument("--sync-public", action="store_true")
    args = parser.parse_args()

    bearer_token = service_account_token() if args.sync_public else ""

    temporary = False
    source_path = args.source
    if re.match(r"^https?://", source_path, flags=re.I):
        source_path = download_report(source_path)
        temporary = True

    try:
        parsed = parse_report(source_path)
        if args.audit_public:
            print(json.dumps({"report": parsed["statistics"], "audit": audit_public_firestore(parsed)}, ensure_ascii=False))
            return
        if args.sync_public:
            print(json.dumps(synchronize_public_firestore(parsed, bearer_token), ensure_ascii=False))
            return
        print(json.dumps({"report": parsed["statistics"]}, ensure_ascii=False))
    finally:
        if temporary and os.path.exists(source_path):
            os.remove(source_path)


if __name__ == "__main__":
    main()
