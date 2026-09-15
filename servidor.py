#!/usr/bin/env python3
"""Servidor local de Talma con sincronización horaria del reporte de Aprende."""

import argparse
import json
import os
import threading
import time
from datetime import datetime, timezone
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

from scripts.actualizar_notas import REPORT_URL, download_report, parse_report, synchronize_public_firestore

ROOT = Path(__file__).resolve().parent
CACHE_DIR = ROOT / ".cache"
REPORT_FILE = CACHE_DIR / "reporteglobal.xlsx"
STATE_FILE = CACHE_DIR / "notas-estado.json"
sync_lock = threading.Lock()
last_attempt = 0.0


def iso_now():
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def read_state():
    try:
        return json.loads(STATE_FILE.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        return {"status": "pendiente", "message": "La primera descarga todavía no ha terminado."}


def write_state(payload):
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    temporary = STATE_FILE.with_suffix(".tmp")
    temporary.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    os.replace(temporary, STATE_FILE)


def credentials_available():
    credentials_file = ROOT / "firebase-service-account.json"
    if not os.environ.get("FIREBASE_SERVICE_ACCOUNT_FILE", "").strip() and credentials_file.exists():
        os.environ["FIREBASE_SERVICE_ACCOUNT_FILE"] = str(credentials_file)
    return bool(os.environ.get("FIREBASE_SERVICE_ACCOUNT", "").strip() or os.environ.get("FIREBASE_SERVICE_ACCOUNT_FILE", "").strip())


def refresh_report():
    global last_attempt
    if not sync_lock.acquire(blocking=False):
        return False
    last_attempt = time.time()
    temporary = ""
    try:
        write_state({"status": "procesando", "generatedAt": iso_now(), "message": "Descargando el reporte de Aprende Talma."})
        CACHE_DIR.mkdir(parents=True, exist_ok=True)
        temporary = download_report(REPORT_URL)
        # os.replace funciona también cuando ya existe el reporte anterior en
        # Windows. Así cada ejecución horaria publica el archivo nuevo de forma
        # atómica y nunca deja un Excel parcialmente escrito.
        os.replace(temporary, REPORT_FILE)
        temporary = ""
        parsed = parse_report(REPORT_FILE)
        if credentials_available():
            summary = synchronize_public_firestore(parsed)
            summary["storedReport"] = str(REPORT_FILE.name)
            summary["intervalMinutes"] = 60
            write_state(summary)
        else:
            write_state({
                "status": "reporte_listo_sin_credenciales",
                "generatedAt": iso_now(),
                "source": REPORT_URL,
                "storedReport": str(REPORT_FILE.name),
                "intervalMinutes": 60,
                "report": parsed["statistics"],
                "message": "El reporte fue descargado y validado. Falta la credencial local para escribir las notas en Firestore.",
            })
        return True
    except Exception as error:
        write_state({
            "status": "error",
            "generatedAt": iso_now(),
            "source": REPORT_URL,
            "message": str(error)[:500],
        })
        return False
    finally:
        if temporary and os.path.exists(temporary):
            os.remove(temporary)
        sync_lock.release()


def scheduler(interval_seconds):
    while True:
        try:
            age = time.time() - REPORT_FILE.stat().st_mtime
        except FileNotFoundError:
            age = interval_seconds
        elapsed_attempt = time.time() - last_attempt if last_attempt else interval_seconds
        if age >= interval_seconds and elapsed_attempt >= interval_seconds:
            refresh_report()
        time.sleep(min(60, max(5, interval_seconds // 10)))


class TalmaHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def send_json(self, payload, status=200):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        request_path = urlparse(self.path).path
        if request_path == "/api/notas/estado":
            self.send_json(read_state())
            return
        if request_path.startswith("/.cache/") or request_path in {"/.gitignore", "/firebase-service-account.json"}:
            self.send_error(404)
            return
        super().do_GET()

    def do_POST(self):
        if urlparse(self.path).path != "/api/notas/sincronizar":
            self.send_error(404)
            return
        if sync_lock.locked():
            self.send_json({"ok": True, "alreadyRunning": True}, 202)
            return
        threading.Thread(target=refresh_report, daemon=True, name="talma-sync-manual").start()
        self.send_json({"ok": True, "started": True}, 202)

    def log_message(self, format_string, *args):
        print(f"[{self.log_date_time_string()}] {format_string % args}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=4173)
    parser.add_argument("--interval", type=int, default=3600, help="Segundos entre descargas")
    args = parser.parse_args()
    if args.interval < 60:
        raise SystemExit("El intervalo mínimo es de 60 segundos.")
    threading.Thread(target=scheduler, args=(args.interval,), daemon=True, name="talma-sync-hourly").start()
    server = ThreadingHTTPServer(("127.0.0.1", args.port), TalmaHandler)
    print(f"Talma disponible en http://127.0.0.1:{args.port}/index.html")
    print(f"El reporte se revisará cada {args.interval // 60} minuto(s).")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
