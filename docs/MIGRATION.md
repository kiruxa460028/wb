# 🔄 Карта переноса файлов

До реорганизации все 16 файлов лежали в корне репозитория. Ниже — куда
переехал каждый и что при этом изменилось в коде.

---

## Таблица переносов

| Было (корень) | Стало | Комментарий |
|---|---|---|
| `index.html` | `web/index.html` | Ссылка на стили обновлена на `css/styles.css` |
| `styles.css` | `web/css/styles.css` | Полностью переоформлен |
| `app.js` | `web/js/app.js` | **Фронтенд.** `index.html` и раньше подключал `js/app.js` |
| `app (1).js` | `server/server.js` | **Бэкенд на Node.** Имя с пробелом и `(1)` вводило в заблуждение |
| `server.py` | `server/server.py` | Бэкенд на Python |
| `wb_supply_calculator.py` | `desktop/wb_supply_calculator.py` | Десктопный калькулятор на tkinter |
| `build_exe.ps1` | `scripts/build_exe.ps1` | Пути внутри обновлены под новую структуру |
| `test_ip.js` | `scripts/check_outgoing_ip.js` | Переименован по смыслу |
| `example_import.csv` | `samples/example_import.csv` | |
| `sample-sales-report.xlsx` | `samples/sample-sales-report.xlsx` | |
| `download` | `deploy/.envrc` | Файл без расширения оказался `.envrc` хостинга — имя потерялось при загрузке |
| `restart.txt` | `deploy/tmp/restart.txt` | Триггер перезапуска Passenger |
| `app.db` | `data/app.db` | **Убран из Git** — содержит хэши паролей и токены |
| `2edf1a23b6e8.hosting.myjino.ru.zip` | `archive/` | **Убран из Git** — резервная копия хостинга на 869 КБ |
| `README.md` | `README.md` | Переписан |
| `requirements.txt` | `requirements.txt` | Остался в корне (стандарт Python) |
| — | `app.js` | **Новый:** заглушка-точка входа для хостинга |

---

## 🐞 Что было сломано и починено

### `index.html` не находил скрипт

```html
<script src="js/app.js"></script>
```

Разметка ссылалась на `js/app.js`, но файл лежал в корне как `app.js` —
папки `js/` не существовало. **Фронтенд не загружался вообще.** После
переноса в `web/js/app.js` путь совпал.

### Два разных файла с именем `app.js`

- `app.js` (185 КБ) — браузерный код, IIFE, работа с DOM;
- `app (1).js` (98 КБ) — серверный код на Node с `require("http")`.

Теперь это `web/js/app.js` и `server/server.js`.

---

## 🔧 Изменения в коде

### `server/server.js`

```js
// было
const HOST = "127.0.0.1";
const PORT = 5500;
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, "data");

// стало
const HOST = process.env.HOST || "127.0.0.1";
const PORT = Number(process.env.PORT) || 5500;
const PROJECT_ROOT = path.resolve(__dirname, "..");
const WEB_DIR = path.join(PROJECT_ROOT, "web");
const DATA_DIR = process.env.WBSP_DATA_DIR || path.join(PROJECT_ROOT, "data");
```

`serveStatic` теперь отдаёт файлы из `WEB_DIR` и проверяет выход за его пределы.

### `server/server.py`

- Корень проекта вычисляется как родитель папки `server/`;
- статика отдаётся из `web/` (`directory=WEB_DIR`);
- база — в `data/app.db`, со совместимостью со старым расположением;
- `HOST` и `PORT` читаются из окружения.

### `scripts/build_exe.ps1`

```powershell
# было
--add-data "index.html;."  --add-data "app.js;."  --add-data "styles.css;."  server.py

# стало
--add-data "$Root\web;web"  "$Root\server\server.py"
```

### `web/js/app.js`

Добавлена подсветка активного раздела в меню:

```js
function switchPage(page) {
  // …
  highlightActiveNav(page);
}
```

---

## ⚠️ Что нужно сделать вручную

### 1. Отозвать токен Wildberries API

Файл `app.db` был закоммичен в **публичный** репозиторий. В нём лежал
токен WB API (срок истёк 9 сентября 2026) и PBKDF2-хэш пароля пользователя.

Из рабочей копии база убрана, но **она остаётся в истории Git**. Рекомендуется:

1. Выпустить новый токен в личном кабинете WB, старый отозвать.
2. Сменить пароль пользователя в приложении.
3. При необходимости почистить историю:
   ```bash
   git filter-repo --path app.db --path 2edf1a23b6e8.hosting.myjino.ru.zip --invert-paths
   git push --force origin <ветка>
   ```

### 2. Обновить деплой на хостинге

Структура папок изменилась. Скопируйте `deploy/.envrc` и `deploy/tmp/restart.txt`
в корень приложения на сервере — подробности в [DEPLOY.md](DEPLOY.md).

### 3. Локальные файлы вне Git

Остались на диске, но больше не отслеживаются:

- `data/app.db` — рабочая база;
- `archive/2edf1a23b6e8.hosting.myjino.ru.zip` — копия хостинга.
