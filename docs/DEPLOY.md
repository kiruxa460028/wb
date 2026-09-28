# 🚀 Развёртывание

Три сценария: локальный запуск, хостинг с Node и десктопный EXE.

---

## 1. Локальный запуск

### Node (полный набор функций)

```bash
node server/server.js
```

### Python (с прокси к WB API)

```bash
python3 server/server.py
```

Оба поднимаются на `http://127.0.0.1:5500`. Python-версия дополнительно
открывает браузер — отключается переменной `WBSP_NO_BROWSER=1`.

### Доступ с других устройств в сети

```bash
HOST=0.0.0.0 PORT=8080 node server/server.js
```

> ⚠️ У приложения нет HTTPS и серверных сессий. Не выставляйте его в интернет
> без обратного прокси с TLS и ограничения доступа.

---

## 2. Хостинг с Node (Passenger, myjino и аналоги)

### Требования

- Node.js **22 и выше** — нужен встроенный модуль `node:sqlite`;
- права на запись в папку `data/`.

### Что положить на сервер

```
<корень приложения>/
├── app.js              ← точка входа, ищется хостингом
├── server/server.js
├── web/                ← статика
├── data/               ← база, права на запись
├── .envrc              ← из deploy/.envrc
└── tmp/restart.txt     ← из deploy/tmp/restart.txt
```

Файлы из `deploy/` нужно скопировать **в корень приложения на сервере** —
в репозитории они лежат отдельно, чтобы не мешать локальной разработке:

```bash
cp deploy/.envrc            ./.envrc
mkdir -p tmp && cp deploy/tmp/restart.txt ./tmp/restart.txt
```

### Точка входа

Корневой `app.js` — трёхстрочная заглушка:

```js
module.exports = require("./server/server.js");
```

Она нужна панелям управления, которые жёстко ожидают `app.js` в корне.
Если хостинг позволяет указать путь вручную, укажите `server/server.js`
напрямую — заглушку можно не использовать.

### Перезапуск

```bash
touch tmp/restart.txt
```

### Проверка исходящего IP

Wildberries может требовать белый список IP. Узнать адрес сервера:

```bash
node scripts/check_outgoing_ip.js
# Outgoing IP: 203.0.113.42
```

---

## 3. Сборка EXE для Windows

```powershell
powershell -ExecutionPolicy Bypass -File scripts\build_exe.ps1
```

Скрипт ставит `pyinstaller` из `requirements.txt` и собирает однофайловый
`dist\WB_Supply_Calculator.exe`. Папка `web/` целиком упаковывается внутрь,
база создаётся в `data\` рядом с исполняемым файлом.

Собрать вручную:

```powershell
python -m PyInstaller --onefile --windowed `
  --name "WB_Supply_Calculator" `
  --add-data "web;web" `
  server\server.py
```

---

## Чек-лист перед публикацией

- [ ] `data/app.db` **не** попал в Git — проверьте `git ls-files | grep app.db`
- [ ] Токены WB API не лежат в коде и в репозитории
- [ ] Настроен HTTPS (обратный прокси)
- [ ] `Access-Control-Allow-Origin` сужен с `*` до своего домена
- [ ] Папка `data/` в бэкапе
- [ ] Версия Node на сервере — 22 или выше
