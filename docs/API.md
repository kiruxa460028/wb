# 🔌 Справочник API

Все эндпоинты начинаются с `/api/`. Остальные пути отдаются как статика из `web/`.

**Формат ответа** — всегда JSON с полем `ok`:

```json
{ "ok": true,  "data": { } }
{ "ok": false, "error": "invalid_credentials" }
```

**Условные обозначения:** ✅ реализовано · ❌ нет (вернёт `404 not_found`)

---

## Сводная таблица

| Метод | Путь | Node | Python | Назначение |
|---|---|:---:|:---:|---|
| `GET` | `/api/auth/exists` | ✅ | ✅ | Проверить, занят ли логин |
| `POST` | `/api/auth/register` | ✅ | ✅ | Регистрация |
| `POST` | `/api/auth/login` | ✅ | ✅ | Вход |
| `GET` | `/api/user-data/all` | ✅ | ✅ | Все данные пользователя |
| `PUT` | `/api/user-data` | ✅ | ✅ | Записать одно значение |
| `POST` | `/api/user-data/sync` | ✅ | ❌ | Записать пачку значений |
| `POST` | `/api/user-data/backup` | ✅ | ❌ | Создать резервную копию |
| `GET` | `/api/user-data/backups` | ✅ | ❌ | Список копий |
| `POST` | `/api/user-data/restore` | ✅ | ❌ | Восстановить из копии |
| `POST` | `/api/migrate/local-profile` | ✅ | ❌ | Перенести профиль из localStorage |
| `POST` | `/api/wb/proxy` | ❌ | ✅ | Прокси к Wildberries API |
| `POST` | `/api/ozon/test` | ⚠️ | ❌ | Заглушка: Ozon API отключён |
| `POST` | `/api/ozon/load` | ⚠️ | ❌ | Заглушка: Ozon API отключён |

---

## 🔐 Авторизация

### `GET /api/auth/exists?username=<логин>`

```json
{ "ok": true, "exists": false }
```

### `POST /api/auth/register`

```json
{ "username": "seller", "password": "secret123" }
```

Требования: логин от 3 символов, пароль от 6.

| Код | Ответ |
|---|---|
| `200` | `{ "ok": true, "usernameKey": "seller", "username": "seller" }` |
| `400` | `invalid_credentials` — логин или пароль слишком короткие |
| `409` | `user_exists` — логин занят |

### `POST /api/auth/login`

```json
{ "username": "seller", "password": "secret123" }
```

| Код | Ответ |
|---|---|
| `200` | `{ "ok": true, "usernameKey": "seller", "username": "seller" }` |
| `401` | `invalid_password` |
| `404` | `not_found` — пользователя нет |

Пароли проверяются через PBKDF2-SHA256 (120 000 итераций) со сравнением
за постоянное время.

---

## 💾 Данные пользователя

Хранилище «ключ — значение» с областью видимости на пользователя. Ключи
обычно составные: `user_settings:seller::cabinet-1`, `api_token:seller::cabinet-1`,
`data_cache:seller::cabinet-1`.

### `GET /api/user-data/all?username=<логин>`

```json
{ "ok": true, "data": { "user_settings": { }, "api_token": "eyJ..." } }
```

### `PUT /api/user-data`

```json
{ "username": "seller", "key": "user_settings", "value": { "lowStock": 20 } }
```

Вставка или обновление по паре «пользователь + ключ».

### `POST /api/user-data/sync` · только Node

```json
{ "username": "seller", "data": { "ключ1": { }, "ключ2": [ ] } }
```

Записывает пачку значений одной транзакцией.

### `POST /api/user-data/backup` · только Node

```json
{ "username": "seller", "name": "перед-обновлением" }
```

Снимает копию всех данных пользователя. Старые копии удаляются при
превышении лимита.

### `GET /api/user-data/backups?username=<логин>` · только Node

```json
{ "ok": true, "backups": [ { "id": 7, "name": "авто", "createdAt": "2026-09-28 10:00:00" } ] }
```

### `POST /api/user-data/restore` · только Node

```json
{ "username": "seller", "backupId": 7 }
```

| Код | Ответ |
|---|---|
| `200` | `{ "ok": true, "restored": 12 }` |
| `404` | `backup_not_found` |
| `500` | `corrupt_backup` |

### `POST /api/migrate/local-profile` · только Node

Переносит профиль, ранее живший в `localStorage`, в базу.

```json
{
  "user": { "usernameKey": "seller", "salt": "…", "passwordHash": "…" },
  "userData": { "user_settings": { } }
}
```

---

## 🟣 Wildberries · только Python

### `POST /api/wb/proxy`

Серверный прокси к Statistics API — обходит CORS и позволяет использовать
белый список IP на стороне WB.

```json
{
  "url": "https://statistics-api.wildberries.ru/api/v1/supplier/stocks?dateFrom=2026-01-01",
  "token": "eyJhbGciOi…"
}
```

**Ограничения (жёстко зашиты):**

- только схема `https`;
- только домен `statistics-api.wildberries.ru`;
- только метод `GET`;
- токен обязателен.

| Ответ | Значение |
|---|---|
| `{ "ok": true, "proxy": "wb", "status": 200, "data": [ ] }` | Успех |
| `unsupported_wb_url` | Домен или схема не разрешены |
| `token_required` | Пустой токен |

> Если эндпоинт недоступен (например, запущен Node-сервер), фронтенд
> автоматически переходит на прямые запросы из браузера.

---

## 🔵 Ozon · заглушки

`POST /api/ozon/test` и `POST /api/ozon/load` отвечают, что API отключён:
данные Ozon загружаются отчётами (XLSX с остатками и CSV с заказами).
Код интеграции сохранён в `server/server.js` на случай возврата к API.

---

## CORS

Оба сервера отвечают на `OPTIONS` и выставляют:

```
Access-Control-Allow-Origin:  *
Access-Control-Allow-Methods: GET, POST, PUT, OPTIONS
Access-Control-Allow-Headers: Content-Type
```

> ⚠️ `Allow-Origin: *` рассчитан на локальный запуск. При публикации в
> интернет ограничьте источник своим доменом.
