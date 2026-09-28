#!/usr/bin/env bash
# ============================================================
#  WB Supply Planner — локальный запуск (macOS / Linux)
# ------------------------------------------------------------
#  Запуск:  ./start.sh
#  Порт:    PORT=8080 ./start.sh
# ============================================================

set -u
cd "$(dirname "$0")"

PORT="${PORT:-5500}"
HOST="${HOST:-127.0.0.1}"
export PORT HOST

echo ""
echo "  WB Supply Planner"
echo "  ─────────────────────────────────────────"

# ── Папка для базы ───────────────────────────────────────────
mkdir -p data
if [ ! -f data/app.db ]; then
  echo "  База data/app.db не найдена — будет создана пустая."
  echo "  Свою базу положите в data/app.db и перезапустите."
fi

# ── Выбор сервера: сначала Node 22+, иначе Python 3 ──────────
NODE_MAJOR=0
if command -v node >/dev/null 2>&1; then
  NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
fi

if [ "$NODE_MAJOR" -ge 22 ] 2>/dev/null; then
  echo "  Сервер: Node $(node -v)"
  echo "  Адрес:  http://127.0.0.1:${PORT}"
  echo "  ─────────────────────────────────────────"
  echo "  Остановить: Ctrl+C"
  echo ""
  exec node server/server.js
fi

if command -v python3 >/dev/null 2>&1; then
  if [ "$NODE_MAJOR" -gt 0 ]; then
    echo "  Node $(node -v) слишком старый (нужен 22+), беру Python."
  fi
  echo "  Сервер: $(python3 --version)"
  echo "  Адрес:  http://127.0.0.1:${PORT}"
  echo "  ─────────────────────────────────────────"
  echo "  Остановить: Ctrl+C"
  echo ""
  exec python3 server/server.py
fi

echo ""
echo "  Не найден ни Node.js 22+, ни Python 3."
echo "  Установите одно из двух:"
echo "    Node.js  — https://nodejs.org  (версия 22 или новее)"
echo "    Python 3 — https://python.org  (версия 3.10 или новее)"
echo ""
exit 1
