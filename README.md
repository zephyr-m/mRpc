# mRPC — Matrix Remote Procedure Call

**Version**: 1.0  
**Author**: Zephyr Muldash  
**Status**: Draft  
**Date**: 2026-03-29  
**Inspired by**: JSON-RPC 2.0, MCP

---

Суверенный протокол для data-driven API.  
Один endpoint. Один формат. Ноль роутинга.

```bash
curl -X POST http://localhost/api \
  -d '{"cmd": "ping"}'
```

```json
{"ok": true, "cmd": "ping", "data": {"pong": true}, "ms": 0.12, "v": "mRPC/1.0"}
```

## Почему mRPC?

| Проблема REST | Решение mRPC |
|---------------|--------------|
| 50 URL маршрутов | 1 endpoint |
| GET/POST/PUT/DELETE | 1 поле `cmd` |
| Роутинг в коде | Реестр в данных |
| Документация отдельно | Self-documenting API |
| Добавить endpoint = код | Добавить команду = JSON |

## Отличия от JSON-RPC

| | JSON-RPC 2.0 | mRPC/1.0 |
|--|---|---|
| Типы команд | нет | query / exec / raw |
| Валидация | нет | встроена (validate) |
| Роли/доступ | нет | встроены (roles) |
| Self-doc | нет | help / describe |
| Events/Push | нет | subscribe / emit |
| Каналы | нет | channels |
| Timing | нет | ms в каждом ответе |

## Документация

| Файл | Назначение |
|------|-----------|
| [SPEC.md](SPEC.md) | Формальная спецификация (RFC 2119) |
| [EXAMPLES.md](EXAMPLES.md) | Примеры реализации (PHP, JS, Python) |

## SDK

| Язык | Файл | Тип |
|------|------|-----|
| JavaScript | [sdk/js/mRPC.js](sdk/js/mRPC.js) | HTTP клиент |
| JavaScript | [sdk/js/mRPCSocket.js](sdk/js/mRPCSocket.js) | WebSocket клиент |
| Python | [sdk/python/mrpc.py](sdk/python/mrpc.py) | HTTP клиент (zero deps) |
| PHP | [sdk/php/server.php](sdk/php/server.php) | HTTP сервер (reference) |
| Node.js | [sdk/node/ws-server.js](sdk/node/ws-server.js) | WebSocket сервер |

## Быстрый старт

### PHP (HTTP сервер)

```bash
cd sdk/php
php -S 0.0.0.0:8088 server.php
```

### Node.js (WebSocket сервер)

```bash
cd sdk/node
npm install ws
node ws-server.js
```

### JavaScript клиент

```javascript
const api = new mRPC('http://localhost:8088/api');

// Вызвать команду
const items = await api.call('get_items', { state: 'active' });
console.log(items.data);

// Self-doc
const help = await api.help();
console.log(help.data.commands);
```

### WebSocket клиент

```javascript
const ws = new mRPCSocket('ws://localhost:8090/ws');

// Подписаться на события
await ws.subscribe(['product.*']);
ws.on('product.created', (data) => console.log('New!', data));

// Вызвать команду через WS
const result = await ws.call('ping');
```

### Python клиент

```python
from mrpc import mRPC

api = mRPC('http://localhost:8088/api')
result = api.call('get_items', state='active')
print(result['data'])
```

## Тесты

```bash
# Полный conformance suite (42 теста)
bash tests/conformance/test.sh --self
```

## Структура

```
mRPC/
├── README.md               ← этот файл
├── SPEC.md                 ← спецификация (RFC 2119)
├── EXAMPLES.md             ← примеры реализации
├── sdk/
│   ├── js/
│   │   ├── mRPC.js         ← HTTP клиент
│   │   └── mRPCSocket.js   ← WS клиент (subscribe, reconnect)
│   ├── python/
│   │   └── mrpc.py         ← HTTP клиент (zero deps)
│   ├── php/
│   │   └── server.php      ← reference HTTP сервер
│   └── node/
│       └── ws-server.js    ← reference WS сервер
└── tests/
    └── conformance/
        ├── test.sh          ← conformance tests
        ├── commands.json    ← тестовая матрица
        └── seed.sql         ← тестовые данные
```

## Философия

1. **Один endpoint** — не 50 URL, а один
2. **Команды = данные** — добавление команд не требует кода
3. **Self-documenting** — ошибся → получил список команд
4. **Storage-agnostic** — протокол не знает про БД
5. **Model-friendly** — локальная AI модель вызывает `cmd` строкой
6. **MCP-compatible** — конвертируется в MCP tools 1:1

## Лицензия

MIT License. See [LICENSE](LICENSE).
