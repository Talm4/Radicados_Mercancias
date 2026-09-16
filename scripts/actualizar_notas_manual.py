"""Actualización manual y segura de notas desde GitHub Actions.

El XLSX solo existe en el almacenamiento temporal del runner. Se procesa por
filas y se elimina al terminar. Firestore recibe escrituras únicamente sobre
el campo NOTA del registro histórico correcto.
"""

import base64
import html
import json
import os
import re
import tempfile
import urllib.parse
import urllib.request
import zipfile
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP

COURSE_INITIAL = "MERCANCIAS PELIGROSAS BASICO 8 HORAS - TALMA - INICIAL _ 2026V2"
COURSE_RECURRENT = "MERCANCIAS PELIGROSAS BASICO 4 HORAS - TALMA - RECURRENTE _ 2026V2"
ROW_END = b"</row>"
CELL_RE = re.compile(rb'<c r="([A-Z]+)\d+"[^>]*>(.*?)</c>')
TEXT_RE = re.compile(rb"<t(?:\s[^>]*)?>(.*?)</t>")
VALUE_RE = re.compile(rb"<v>(.*?)</v>")


def normalize(value):
    import unicodedata
    text = unicodedata.normalize("NFD", str(value or ""))
    text = "".join(char for char in text if unicodedata.category(char) != "Mn")
    return re.sub(r"[^A-Z0-9]+", " ", text.upper()).strip()


TARGETS = {normalize(COURSE_INITIAL): "inicial", normalize(COURSE_RECURRENT): "recurrente"}


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
    a = {token for token in normalize(left).split() if len(token) > 1}
    b = {token for token in normalize(right).split() if len(token) > 1}
    return bool(a and b) and len(a & b) / min(len(a), len(b)) >= 0.6


def date_key(value):
    text = str(value or "").strip()
    if not text:
        return "0000-00-00T00:00:00"
    try:
        serial = Decimal(text.replace(",", "."))
        if 1 <= serial <= 100000:
            return (datetime(1899, 12, 30) + timedelta(days=float(serial))).isoformat()
    except InvalidOperation:
        pass
    for pattern in ("%Y-%m-%d", "%d/%m/%Y", "%d/%m/%Y %H:%M:%S", "%Y/%m/%d", "%d-%m-%Y"):
        try:
            return datetime.strptime(text[:19], pattern).isoformat()
        except ValueError:
            continue
    return text


def column_number(letters):
    result = 0
    for char in letters:
        result = result * 26 + char - 64
    return result - 1


def row_values(row_xml):
    parsed, width = [], 0
    for match in CELL_RE.finditer(row_xml):
        column = column_number(match.group(1))
        body = match.group(2)
        texts = TEXT_RE.findall(body)
        value = b"".join(texts) if texts else (VALUE_RE.search(body).group(1) if VALUE_RE.search(body) else b"")
        parsed.append((column, html.unescape(value.decode("utf-8", errors="replace"))))
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
            complete = buffer[: end + len(ROW_END)]
            buffer = buffer[end + len(ROW_END):]
            start = complete.rfind(b"<row")
            if start >= 0:
                yield complete[start:]


def parse_report(path):
    records, headers = {}, None
    scanned = matched = invalid = 0
    with zipfile.ZipFile(path) as archive:
        if "xl/worksheets/sheet1.xml" not in archive.namelist():
            raise RuntimeError("El reporte no contiene xl/worksheets/sheet1.xml")
        with archive.open("xl/worksheets/sheet1.xml") as sheet:
            for row_number, row_xml in enumerate(iter_rows(sheet), 1):
                if row_number == 1:
                    headers = {normalize(value): index for index, value in enumerate(row_values(row_xml))}
                    required = ["CEDULA", "CURSO", "NOTA", "NOMBRE COMPLETO", "FECHA DE FINALIZACION DEL CURSO"]
                    missing = [name for name in required if name not in headers]
                    if missing:
                        raise RuntimeError("Faltan columnas: " + ", ".join(missing))
                    continue
                scanned += 1
                if b"MERCANCIAS PELIGROSAS BASICO" not in row_xml:
                    continue
                values = row_values(row_xml)
                get = lambda name: values[headers[name]] if headers[name] < len(values) else ""
                course_type = TARGETS.get(normalize(get("CURSO")))
                if not course_type:
                    continue
                matched += 1
                employee_id, grade = normalize_id(get("CEDULA")), rounded_grade(get("NOTA"))
                if not employee_id or grade is None:
                    invalid += 1
                    continue
                item = {"id": employee_id, "tipo": course_type, "nota": grade, "nombre": get("NOMBRE COMPLETO").strip(), "fecha": get("FECHA DE FINALIZACION DEL CURSO")}
                key = f"{employee_id}|{course_type}"
                previous = records.get(key)
                if previous is None or (date_key(item["fecha"]), grade) > (date_key(previous["fecha"]), previous["nota"]):
                    records[key] = item
    return list(records.values()), {"filasLeidas": scanned, "filasCurso": matched, "unicos": len(records), "notasInvalidas": invalid}


def download_report(path):
    url = os.environ.get("REPORT_URL", "https://aprende.talma.com.co/reporteglobal.xlsx")
    request = urllib.request.Request(url, headers={"User-Agent": "Talma-Notas-Manual/4.0"})
    with urllib.request.urlopen(request, timeout=180) as response, open(path, "wb") as output:
        if response.status != 200:
            raise RuntimeError(f"El reporte respondió HTTP {response.status}")
        while chunk := response.read(1024 * 1024):
            output.write(chunk)
    if not zipfile.is_zipfile(path):
        raise RuntimeError("La descarga no es un XLSX válido")


def service_token():
    from google.auth.transport.requests import Request
    from google.oauth2 import service_account

    encoded = os.environ.get("FIREBASE_SERVICE_ACCOUNT_B64", "").strip()
    if not encoded:
        raise RuntimeError("Falta el Secret FIREBASE_SERVICE_ACCOUNT_B64")
    info = json.loads(base64.b64decode(encoded).decode("utf-8"))
    credentials = service_account.Credentials.from_service_account_info(info, scopes=["https://www.googleapis.com/auth/datastore"])
    credentials.refresh(Request())
    return credentials.token


def request_json(url, token, method="GET", payload=None, timeout=180):
    data = None if payload is None else json.dumps(payload).encode("utf-8")
    headers = {"Authorization": f"Bearer {token}", "User-Agent": "Talma-Notas-Manual/4.0"}
    if data is not None:
        headers["Content-Type"] = "application/json"
    with urllib.request.urlopen(urllib.request.Request(url, data=data, method=method, headers=headers), timeout=timeout) as response:
        raw = response.read()
    return json.loads(raw) if raw else {}


def firestore_value(value):
    if not isinstance(value, dict):
        return ""
    for key in ("stringValue", "integerValue", "doubleValue", "booleanValue", "timestampValue"):
        if key in value:
            return value[key]
    return ""


def load_documents(token):
    project = os.environ.get("FIREBASE_PROJECT_ID", "talma-datacenter")
    root = f"https://firestore.googleapis.com/v1/projects/{project}/databases/(default)/documents"
    documents, page_token = [], ""
    while True:
        query = {"pageSize": "1000", "mask.fieldPaths": ["ID", "NOMBRES", "CURSO", "FECHA", "NOTA"]}
        if page_token:
            query["pageToken"] = page_token
        payload = request_json(root + "/capacitaciones?" + urllib.parse.urlencode(query, doseq=True), token)
        for document in payload.get("documents", []):
            documents.append({"name": document["name"], "updateTime": document.get("updateTime", ""), "fields": {key: firestore_value(value) for key, value in document.get("fields", {}).items()}})
        page_token = payload.get("nextPageToken", "")
        if not page_token:
            return root, documents


def build_plan(documents, report):
    groups = defaultdict(list)
    for document in documents:
        fields = document["fields"]
        employee_id, course_type = normalize_id(fields.get("ID")), platform_course_type(fields.get("CURSO"))
        if employee_id and course_type:
            groups[f"{employee_id}|{course_type}"].append(document)
    for items in groups.values():
        items.sort(key=lambda item: (date_key(item["fields"].get("FECHA")), item["updateTime"]), reverse=True)
    sources = {f"{item['id']}|{item['tipo']}": item for item in report}
    writes, stats = [], {"coincidencias": 0, "actualizadas": 0, "yaCorrectas": 0, "sinReporte": 0, "conflictosNombre": 0, "historialConservado": sum(max(0, len(items) - 1) for items in groups.values())}
    for key, candidates in groups.items():
        source = sources.get(key)
        if not source:
            stats["sinReporte"] += 1
            continue
        target = next((item for item in candidates if names_compatible(item["fields"].get("NOMBRES"), source["nombre"])), None)
        if not target:
            stats["conflictosNombre"] += 1
            continue
        stats["coincidencias"] += 1
        if rounded_grade(target["fields"].get("NOTA")) == source["nota"]:
            stats["yaCorrectas"] += 1
            continue
        write = {"update": {"name": target["name"], "fields": {"NOTA": {"stringValue": str(source["nota"])}}}, "updateMask": {"fieldPaths": ["NOTA"]}}
        if target["updateTime"]:
            write["currentDocument"] = {"updateTime": target["updateTime"]}
        writes.append(write)
    stats["actualizadas"] = len(writes)
    return writes, stats


def commit(root, writes, token):
    endpoint = root.rsplit("/documents", 1)[0] + "/documents:commit"
    for start in range(0, len(writes), 400):
        request_json(endpoint, token, method="POST", payload={"writes": writes[start:start + 400]})


def main():
    started = datetime.now(timezone.utc).isoformat()
    print(f"Inicio: {started}")
    with tempfile.TemporaryDirectory() as temp:
        report_path = os.path.join(temp, "reporteglobal.xlsx")
        print("Descargando el reporte...")
        download_report(report_path)
        report, report_stats = parse_report(report_path)
        print("Reporte validado:", json.dumps(report_stats, ensure_ascii=False))
        token = service_token()
        root, documents = load_documents(token)
        print(f"Registros Firestore leídos: {len(documents)}")
        writes, sync_stats = build_plan(documents, report)
        print("Cruce:", json.dumps(sync_stats, ensure_ascii=False))
        commit(root, writes, token)
        print(f"Notas actualizadas: {len(writes)}")
    print(f"Fin: {datetime.now(timezone.utc).isoformat()}")


if __name__ == "__main__":
    main()
