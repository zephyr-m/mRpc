# mRPC/1.0 — Примеры реализации

Этот документ содержит примеры реализации, не являющиеся частью спецификации.

---

## Пример 1: Матрица команд на JSON + SQL (PHP/SQLite)

```json
{
  "get_products": {
    "type": "query",
    "sql": "SELECT * FROM products WHERE (:state IS NULL OR state = :state) LIMIT :limit",
    "params": {"state": null, "limit": 100},
    "roles": ["admin", "viewer"]
  },
  "add_product": {
    "type": "exec",
    "sql": "INSERT INTO products (name, price) VALUES (:name, :price)",
    "params": ["name", "price"],
    "validate": {
      "name": "required|min:2",
      "price": "required|numeric"
    },
    "roles": ["admin"],
    "emit": "product.created"
  },
  "ping": {
    "type": "raw"
  }
}
```

## Пример 2: Матрица на PHP (с closures)

```php
return [
    'get_products' => [
        'type'   => 'query',
        'sql'    => 'SELECT * FROM products LIMIT :limit',
        'params' => ['limit' => 100],
    ],
    'stats' => [
        'type'    => 'raw',
        'handler' => fn($db, $params) => [
            'total' => $db->querySingle('SELECT COUNT(*) FROM products'),
            'ts'    => date('c'),
        ],
    ],
];
```

## Пример 3: Матрица на JavaScript (Node.js)

```javascript
module.exports = {
    get_users: {
        type: 'query',
        handler: async (db, params) => {
            return db.all('SELECT * FROM users LIMIT ?', [params.limit || 50]);
        },
        params: { limit: 50 },
    },
    create_user: {
        type: 'exec',
        handler: async (db, params) => {
            const result = await db.run(
                'INSERT INTO users (name, email) VALUES (?, ?)',
                [params.name, params.email]
            );
            return { changes: result.changes };
        },
        params: ['name', 'email'],
        validate: {
            name: 'required|min:2',
            email: 'required|email',
        },
        emit: 'user.created',
    },
};
```

## Пример 4: Матрица на Python (FastAPI)

```python
commands = {
    "get_items": {
        "type": "query",
        "handler": lambda db, params: db.execute(
            "SELECT * FROM items WHERE state = ?",
            [params.get("state", "active")]
        ).fetchall(),
        "params": {"state": "active"},
    },
    "ping": {
        "type": "raw",
        "handler": lambda db, params: {"pong": True},
    },
}
```

## Пример 5: Middleware pipeline

```
Request → Auth(roles) → Validate(rules) → Handler → Emit(event) → Response
```

```json
{
  "transfer_money": {
    "type": "exec",
    "params": ["from_id", "to_id", "amount"],
    "validate": {
      "from_id": "required|integer",
      "to_id": "required|integer",
      "amount": "required|numeric"
    },
    "roles": ["admin", "accountant"],
    "emit": "money.transferred"
  }
}
```

## Пример 6: WebSocket подписки

```javascript
// Клиент
const ws = new mRPCSocket('ws://localhost:8090/ws');

// Подписаться на события продуктов
await ws.subscribe(['product.*']);

// Подписаться на конкретный канал (тенант)
await ws.subscribe(['*'], 'tenant:42');

// Слушать события
ws.on('product.created', (data) => {
    console.log('Новый продукт:', data.name);
});

ws.on('*', (data, event) => {
    console.log(`Event: ${event}`, data);
});
```

## Пример 7: Добавление команды (0 изменений в коде)

До: 0 строк кода в сервере.

В `commands.json` добавить:
```json
"search": {
    "type": "query",
    "sql": "SELECT * FROM items WHERE name LIKE :q LIMIT 20",
    "params": ["q"]
}
```

Тест:
```bash
curl -X POST /api -d '{"cmd":"search","q":"%widget%"}'
```

Сервер **не менялся**. Только данные.
