# mRPC/1.0 — Спецификация

**Version**: 1.0  
**Status**: Draft  
**Date**: 2026-03-29  
**Author**: Zephyr Muldash  
**Inspired by**: JSON-RPC 2.0, MCP

---

## 1. Обзор

mRPC (Matrix Remote Procedure Call) — протокол удалённого вызова процедур,
в котором все команды описаны декларативно в виде реестра.
Добавление новой команды не требует изменения серверного кода.

### 1.1 Терминология (RFC 2119)

Ключевые слова **MUST**, **MUST NOT**, **SHOULD**, **SHOULD NOT**, **MAY**
используются в соответствии с [RFC 2119](https://datatracker.ietf.org/doc/html/rfc2119):

- **MUST** / ДОЛЖЕН — обязательное требование
- **MUST NOT** / НЕ ДОЛЖЕН — абсолютный запрет
- **SHOULD** / СЛЕДУЕТ — рекомендуется, но допускаются обоснованные исключения
- **MAY** / МОЖЕТ — полностью опциональное поведение

## 2. Транспорт

### 2.1 HTTP (primary)

- **Endpoint**: сервер MUST предоставить один URL (SHOULD быть `/api`)
- **Method**: `POST` (MUST), `GET` (MAY для простых query)
- **Content-Type**: `application/json; charset=utf-8`

### 2.2 WebSocket (optional)

- **Frame format**: JSON text frame
- **Формат**: идентичен HTTP
- **Дополнительное поле**: `"id"` для корреляции запрос-ответ

### 2.3 CLI (optional)

```bash
mrpc ping
mrpc get_users --limit=10
```

## 3. Wire Format

### 3.1 Запрос

```json
{
  "cmd": "command_name",
  "param1": "value1",
  "param2": 42
}
```

| Поле | Тип | Обязательно | Описание |
|------|-----|-------------|----------|
| `cmd` | string | ✅ | Имя команды |
| `*` | any | — | Параметры команды |

GET-запрос:
```
GET /api?cmd=command_name&param1=value1&param2=42
```

### 3.2 Ответ: успех

```json
{
  "ok": true,
  "cmd": "command_name",
  "v": "mRPC/1.0",
  "ms": 2.08,
  "data": [...],
  "count": 3
}
```

### 3.3 Ответ: ошибка

```json
{
  "ok": false,
  "cmd": "command_name",
  "v": "mRPC/1.0",
  "ms": 0.01,
  "error": {
    "code": "missing_param",
    "message": "Missing required parameter: id",
    "param": "id"
  }
}
```

### 3.4 Обязательные поля ответа

Сервер MUST включить эти поля в каждый ответ:

| Поле | Тип | Описание |
|------|-----|----------|
| `ok` | boolean | Успех/неуспех |
| `cmd` | string | Имя вызванной команды |
| `v` | string | Версия протокола (`mRPC/1.0`) |
| `ms` | float | Время выполнения в миллисекундах |

### 3.5 Условные поля ответа

| Поле | Тип | Когда |
|------|-----|-------|
| `data` | array/object | query, raw — результат |
| `count` | integer | query — количество записей |
| `changes` | integer | exec — затронутые строки |
| `error` | object | при `ok: false` |
| `commands` | array | при `code: unknown_cmd` (self-doc) |

## 4. Типы команд

### 4.1 query

Возвращает массив записей.

```json
{
  "cmd": "get_products",
  "state": "active",
  "limit": 20
}
```

Response:
```json
{
  "ok": true,
  "cmd": "get_products",
  "data": [
    {"id": 1, "name": "Widget", "price": 29.99, "state": "active"},
    {"id": 2, "name": "Gadget", "price": 49.99, "state": "active"}
  ],
  "count": 2,
  "ms": 1.23,
  "v": "mRPC/1.0"
}
```

### 4.2 exec

Изменяет данные. Возвращает количество затронутых записей.

```json
{
  "cmd": "set_state",
  "id": 5,
  "state": "archived"
}
```

Response:
```json
{
  "ok": true,
  "cmd": "set_state",
  "changes": 1,
  "ms": 0.44,
  "v": "mRPC/1.0"
}
```

### 4.3 raw

Кастомная логика. Возвращает произвольные данные.

```json
{
  "cmd": "ping"
}
```

Response:
```json
{
  "ok": true,
  "cmd": "ping",
  "data": {"pong": true, "uptime": 3600},
  "ms": 0.05,
  "v": "mRPC/1.0"
}
```

## 5. Error Codes

Стандартные коды ошибок mRPC/1.0:

| Code | Описание | HTTP equiv |
|------|----------|------------|
| `unknown_cmd` | Команда не найдена в матрице | 404 |
| `missing_param` | Обязательный параметр отсутствует | 400 |
| `invalid_param` | Параметр не прошёл валидацию | 400 |
| `validation_failed` | Ошибки валидации (массив) | 422 |
| `auth_required` | Требуется аутентификация | 401 |
| `access_denied` | Нет прав на команду | 403 |
| `not_found` | Запись не найдена | 404 |
| `conflict` | Конфликт (дубликат, невозможный переход FSM) | 409 |
| `rate_limited` | Слишком много запросов | 429 |
| `internal` | Внутренняя ошибка сервера | 500 |

### 5.1 Формат ошибки

```json
{
  "code": "validation_failed",
  "message": "Validation failed for 2 fields",
  "details": [
    {"field": "name", "rule": "required", "message": "Name is required"},
    {"field": "price", "rule": "numeric", "message": "Price must be numeric"}
  ]
}
```

## 6. Реестр команд (Command Registry)

Каждая mRPC-команда ДОЛЖНА быть зарегистрирована в реестре сервера.
Реализация реестра — на усмотрение сервера (JSON, PHP, YAML, база данных, код).

### 6.1 Обязательные поля команды

| Поле | Тип | Описание |
|------|-----|----------|
| `type` | string | `query` / `exec` / `raw` |

### 6.2 Опциональные поля команды

| Поле | Тип | Описание |
|------|-----|----------|
| `params` | array&#124;object | Описание параметров (см. §6.3) |
| `validate` | object | Правила валидации полей |
| `roles` | array | Требуемые роли для доступа |
| `emit` | string | Имя события после выполнения |

### 6.3 Параметры

**Обязательные** (sequential array):
```json
"params": ["id", "state"]
```
Отсутствие → ошибка `missing_param`.

**С дефолтами** (associative object):
```json
"params": {"state": null, "limit": 100}
```
Отсутствие → подставляется дефолт.

### 6.4 Валидация

Если команда содержит `validate`, сервер MUST проверить параметры
перед выполнением. Формат правил — на усмотрение реализации.
При невалидности → ошибка `validation_failed` с `details[]`.

### 6.5 Авторизация

Если команда содержит `roles`, сервер MUST проверить роль
текущего пользователя. При отсутствии прав → ошибка `access_denied`.

### 6.6 События

Если команда содержит `emit`, сервер MUST уведомить подписчиков
(§10) после успешного выполнения.

## 7. Self-Documentation

### 7.1 Discovery

Запрос без `cmd` или с неизвестной командой:

```json
{"cmd": "help"}
```

Response:
```json
{
  "ok": true,
  "cmd": "help",
  "v": "mRPC/1.0",
  "data": {
    "commands": {
      "ping": {"type": "raw", "params": {}, "description": "Health check"},
      "get_products": {"type": "query", "params": {"state": null, "limit": 100}},
      "add_product": {"type": "exec", "params": ["name", "price"], "validate": {"name": "required|min:2"}}
    },
    "total": 3
  },
  "ms": 0.02
}
```

### 7.2 Introspection

```json
{"cmd": "describe", "command": "add_product"}
```

Response:
```json
{
  "ok": true,
  "cmd": "describe",
  "data": {
    "name": "add_product",
    "type": "exec",
    "params": ["name", "price"],
    "validate": {"name": "required|min:2", "price": "required|numeric"},
    "roles": ["admin"],
    "emit": "product.created"
  },
  "ms": 0.01,
  "v": "mRPC/1.0"
}
```

## 8. CORS

Сервер MUST поддерживать:

```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: POST, GET, OPTIONS
Access-Control-Allow-Headers: Content-Type, Authorization
```

## 9. Аутентификация

### 9.1 Token

```
Authorization: Bearer <token>
```

или в теле:
```json
{"cmd": "get_products", "token": "<token>"}
```

### 9.2 Session

Cookie-based для браузерных клиентов.

## 10. WebSocket расширение

### 10.1 Подключение

```
ws://host:port/ws
```

После подключения клиент может отправлять те же команды что и через HTTP.

### 10.2 Запрос с ID (request-response)

Каждый запрос через WS ДОЛЖЕН иметь `id` для корреляции:

```json
{"id": "req-1", "cmd": "get_products", "limit": 10}
```

Ответ:
```json
{"id": "req-1", "ok": true, "cmd": "get_products", "data": [...], "ms": 1.2, "v": "mRPC/1.0"}
```

### 10.3 Подписка на события (subscribe)

```json
{"id": "sub-1", "cmd": "subscribe", "events": ["product.created", "product.updated"]}
```

Ответ:
```json
{"id": "sub-1", "ok": true, "cmd": "subscribe", "data": {"subscribed": ["product.created", "product.updated"]}, "v": "mRPC/1.0"}
```

Wildcard подписка:
```json
{"id": "sub-2", "cmd": "subscribe", "events": ["product.*"]}
```

Подписка на всё:
```json
{"id": "sub-3", "cmd": "subscribe", "events": ["*"]}
```

### 10.4 Отписка (unsubscribe)

```json
{"id": "unsub-1", "cmd": "unsubscribe", "events": ["product.created"]}
```

Отписаться от всего:
```json
{"id": "unsub-2", "cmd": "unsubscribe", "events": ["*"]}
```

### 10.5 Server Push (события)

Когда команда с `"emit"` выполняется, сервер PUSH'ит всем подписчикам:

```json
{
  "type": "event",
  "event": "product.created",
  "data": {"id": 5, "name": "Widget", "price": 29.99},
  "ts": "2026-03-29T20:08:00+03:00",
  "v": "mRPC/1.0"
}
```

| Поле | Тип | Описание |
|------|-----|----------|
| `type` | string | Всегда `"event"` (отличает push от response) |
| `event` | string | Имя события |
| `data` | any | Данные события |
| `ts` | string | ISO 8601 timestamp |
| `v` | string | Версия протокола |

### 10.6 Каналы (channels)

Подписка на именованный канал (для изоляции данных):

```json
{"id": "ch-1", "cmd": "subscribe", "channel": "tenant:42", "events": ["*"]}
```

Push в канале:
```json
{"type": "event", "channel": "tenant:42", "event": "order.created", "data": {...}}
```

### 10.7 Heartbeat

Клиент отправляет ping каждые 30 секунд:
```json
{"cmd": "ping"}
```

Сервер отвечает:
```json
{"ok": true, "cmd": "ping", "data": {"pong": true}, "v": "mRPC/1.0"}
```

Если сервер не получает ping 60 секунд — закрывает соединение.

### 10.8 Reconnection

При потере соединения клиент ДОЛЖЕН:
1. Подождать 1 сек
2. Переподключиться
3. Повторить все `subscribe` команды
4. Экспоненциальный backoff: 1s → 2s → 4s → 8s → max 30s

### 10.9 Формат фреймов (summary)

| Направление | Тип | Как отличить |
|-------------|-----|-------------|
| Client → Server | Command | Есть `cmd` |
| Server → Client | Response | Есть `id` + `ok` |
| Server → Client | Event push | `type: "event"` |

## 11. MCP совместимость

mRPC команды конвертируются в MCP tools 1:1:

| mRPC | MCP |
|------|-----|
| `cmd` | tool `name` |
| `params` | `inputSchema.properties` |
| `type: "query"` | tool with `array` return |
| `type: "exec"` | tool with `object` return |
| матрица команд | tool definitions |

## 12. Версионирование

- Версия протокола: `mRPC/1.0`
- Всегда в поле `v` ответа
- Major version — breaking changes
- Minor version — backward-compatible additions
- Клиент ДОЛЖЕН проверять `v` если зависит от конкретной версии
