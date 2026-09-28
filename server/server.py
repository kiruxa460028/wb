import json
import os
import sqlite3
import hashlib
import hmac
import secrets
import sys
import threading
import urllib.error
import urllib.request
import webbrowser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse


# ── Пути проекта ────────────────────────────────────────────────────────────
# Обычный запуск:  server/server.py  ->  корень проекта на уровень выше.
# PyInstaller EXE: файлы распакованы в sys._MEIPASS, статика лежит в web/.
BASE_DIR = getattr(sys, "_MEIPASS", os.path.dirname(os.path.abspath(__file__)))

if getattr(sys, "frozen", False):
    PROJECT_ROOT = BASE_DIR                        # распакованный бандл
    APP_DIR = os.path.dirname(sys.executable)      # папка рядом с .exe (туда пишем данные)
else:
    PROJECT_ROOT = os.path.dirname(BASE_DIR)       # <корень>/server -> <корень>
    APP_DIR = PROJECT_ROOT

WEB_DIR = os.path.join(PROJECT_ROOT, "web")        # index.html, css/, js/
DATA_DIR = os.path.join(APP_DIR, "data")           # app.db и прочие локальные данные

LEGACY_DB_PATH = os.path.join(APP_DIR, "app.db")   # старое расположение БД (до реорганизации)
DATA_DB_PATH = os.path.join(DATA_DIR, "app.db")
DB_PATH = os.path.abspath(
    os.environ.get("WBSP_DB_PATH")
    or (LEGACY_DB_PATH if os.path.exists(LEGACY_DB_PATH) else DATA_DB_PATH)
)

HOST = os.environ.get("HOST", "127.0.0.1")
PORT = int(os.environ.get("PORT", "5500"))


def ensure_db():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username_key TEXT UNIQUE NOT NULL,
          username_display TEXT NOT NULL,
          salt TEXT NOT NULL,
          password_hash TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
        """
    )
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS user_data (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username_key TEXT NOT NULL,
          data_key TEXT NOT NULL,
          value_json TEXT NOT NULL,
          updated_at TEXT NOT NULL DEFAULT (datetime('now')),
          UNIQUE(username_key, data_key)
        )
        """
    )
    conn.commit()
    conn.close()


def normalize_username(value: str) -> str:
    return (value or "").strip().lower()


def hash_password(password: str, salt_hex: str) -> str:
    salt = bytes.fromhex(salt_hex)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 120000)
    return digest.hex()


def wb_proxy_get(api_url: str, token: str):
    parsed = urlparse(api_url or "")
    if parsed.scheme != "https" or parsed.netloc != "statistics-api.wildberries.ru":
        return {"ok": False, "status": "-", "detail": "unsupported_wb_url"}
    if not token:
        return {"ok": False, "status": "-", "detail": "token_required"}

    req = urllib.request.Request(
        api_url,
        method="GET",
        headers={
            "Authorization": token,
            "User-Agent": "WB-Supply-Planner/1.0",
            "Accept": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=25) as resp:
            text = resp.read().decode("utf-8", errors="replace")
            try:
                payload = json.loads(text) if text else None
            except Exception:
                payload = None
            return {"ok": 200 <= resp.status < 300, "status": resp.status, "payload": payload, "detail": text[:180]}
    except urllib.error.HTTPError as error:
        text = error.read().decode("utf-8", errors="replace")
        try:
            payload = json.loads(text) if text else None
        except Exception:
            payload = None
        detail = ""
        if isinstance(payload, dict):
            detail = str(payload.get("message") or payload.get("error") or payload.get("detail") or "")
        return {"ok": False, "status": error.code, "payload": payload, "detail": detail or text[:180] or f"HTTP {error.code}"}
    except Exception as error:
        return {"ok": False, "status": "-", "detail": str(error) or "proxy_error"}


class AppHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=WEB_DIR, **kwargs)

    def _send_cors_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def _send_json(self, status: int, payload):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self._send_cors_headers()
        self.end_headers()
        self.wfile.write(body)

    def _read_json(self):
        length = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(length) if length > 0 else b"{}"
        try:
            return json.loads(raw.decode("utf-8"))
        except Exception:
            return {}

    def do_OPTIONS(self):
        self.send_response(204)
        self._send_cors_headers()
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/auth/exists":
            query = parse_qs(parsed.query)
            username_key = normalize_username((query.get("username") or [""])[0])
            conn = sqlite3.connect(DB_PATH)
            cur = conn.cursor()
            cur.execute("SELECT 1 FROM users WHERE username_key = ?", (username_key,))
            exists = cur.fetchone() is not None
            conn.close()
            return self._send_json(200, {"ok": True, "exists": exists})

        if parsed.path == "/api/user-data/all":
            query = parse_qs(parsed.query)
            username_key = normalize_username((query.get("username") or [""])[0])
            if not username_key:
                return self._send_json(400, {"ok": False, "error": "username_required"})
            conn = sqlite3.connect(DB_PATH)
            cur = conn.cursor()
            cur.execute("SELECT data_key, value_json FROM user_data WHERE username_key = ?", (username_key,))
            rows = cur.fetchall()
            conn.close()
            out = {}
            for key, value_json in rows:
                try:
                    out[key] = json.loads(value_json)
                except Exception:
                    out[key] = None
            return self._send_json(200, {"ok": True, "data": out})

        return super().do_GET()

    def do_POST(self):
        parsed = urlparse(self.path)
        payload = self._read_json()

        if parsed.path == "/api/auth/register":
            username_raw = (payload.get("username") or "").strip()
            password = payload.get("password") or ""
            username_key = normalize_username(username_raw)
            if len(username_key) < 3 or len(password) < 6:
                return self._send_json(400, {"ok": False, "error": "invalid_credentials"})

            conn = sqlite3.connect(DB_PATH)
            cur = conn.cursor()
            cur.execute("SELECT 1 FROM users WHERE username_key = ?", (username_key,))
            if cur.fetchone():
                conn.close()
                return self._send_json(409, {"ok": False, "error": "user_exists"})

            salt_hex = secrets.token_hex(16)
            pw_hash = hash_password(password, salt_hex)
            cur.execute(
                "INSERT INTO users (username_key, username_display, salt, password_hash) VALUES (?, ?, ?, ?)",
                (username_key, username_raw, salt_hex, pw_hash),
            )
            conn.commit()
            conn.close()
            return self._send_json(200, {"ok": True, "usernameKey": username_key, "username": username_raw})

        if parsed.path == "/api/auth/login":
            username = normalize_username(payload.get("username") or "")
            password = payload.get("password") or ""
            conn = sqlite3.connect(DB_PATH)
            cur = conn.cursor()
            cur.execute(
                "SELECT username_key, username_display, salt, password_hash FROM users WHERE username_key = ?",
                (username,),
            )
            row = cur.fetchone()
            conn.close()
            if not row:
                return self._send_json(404, {"ok": False, "error": "not_found"})
            username_key, username_display, salt_hex, stored_hash = row
            given_hash = hash_password(password, salt_hex)
            if not hmac.compare_digest(given_hash, stored_hash):
                return self._send_json(401, {"ok": False, "error": "invalid_password"})
            return self._send_json(200, {"ok": True, "usernameKey": username_key, "username": username_display})

        if parsed.path == "/api/wb/proxy":
            result = wb_proxy_get(str(payload.get("url") or ""), str(payload.get("token") or ""))
            return self._send_json(200, {"ok": bool(result.get("ok")), "proxy": "wb", **result})

        return self._send_json(404, {"ok": False, "error": "not_found"})

    def do_PUT(self):
        parsed = urlparse(self.path)
        if parsed.path != "/api/user-data":
            return self._send_json(404, {"ok": False, "error": "not_found"})
        payload = self._read_json()
        username_key = normalize_username(payload.get("username") or "")
        data_key = (payload.get("key") or "").strip()
        if not username_key or not data_key:
            return self._send_json(400, {"ok": False, "error": "invalid_payload"})
        value_json = json.dumps(payload.get("value"), ensure_ascii=False)
        conn = sqlite3.connect(DB_PATH)
        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO user_data (username_key, data_key, value_json, updated_at)
            VALUES (?, ?, ?, datetime('now'))
            ON CONFLICT(username_key, data_key)
            DO UPDATE SET value_json = excluded.value_json, updated_at = datetime('now')
            """,
            (username_key, data_key, value_json),
        )
        conn.commit()
        conn.close()
        return self._send_json(200, {"ok": True})


def run():
    ensure_db()
    httpd = ThreadingHTTPServer((HOST, PORT), AppHandler)
    url = f"http://{'127.0.0.1' if HOST in ('0.0.0.0', '') else HOST}:{PORT}"
    print(f"WB server started: {url}")
    print(f"  статика: {WEB_DIR}")
    print(f"  база:    {DB_PATH}")
    if os.environ.get("WBSP_NO_BROWSER") != "1":
        threading.Timer(0.5, lambda: webbrowser.open(url)).start()
    httpd.serve_forever()


if __name__ == "__main__":
    run()
