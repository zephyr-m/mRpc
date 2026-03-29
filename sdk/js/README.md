# mrpc-client

Official JavaScript/Node.js SDK for [mRPC/1.0](https://github.com/zephyr-m/mRpc) protocol.

One endpoint. Zero routing. Data-driven API.

## Why mRPC?

| Problem with REST | mRPC Solution |
|-------------------|---------------|
| 50 URL routes | 1 endpoint |
| GET/POST/PUT/DELETE | 1 field `cmd` |
| Routing in code | Registry in data |
| Separate documentation | Self-documenting API |
| Add endpoint = code | Add command = JSON |

## Install

```bash
npm install mrpc-client
```

## HTTP Client

```javascript
const mRPC = require('mrpc-client');

const api = new mRPC('http://localhost:8088');

// Call any command
const items = await api.call('get_items', { state: 'active' });
console.log(items.data);    // [{id: 1, name: "Widget"}, ...]
console.log(items.count);   // 3
console.log(items.ms);      // 0.42

// Don't know the API? Ask it
const help = await api.help();
console.log(help.data.commands);  // {ping: {type: "raw"}, get_items: {...}, ...}

// Describe a specific command
const info = await api.describe('add_item');
console.log(info.data.params);    // ["name", "price"]
console.log(info.data.validate);  // {name: "required|min:2", ...}

// Health check
const pong = await api.ping();    // {ok: true, data: {pong: true}}
```

### Auth

```javascript
const api = new mRPC('http://localhost:8088', 'your-bearer-token');

// Token is sent as Authorization: Bearer header
const secret = await api.call('admin_only');
```

## WebSocket Client

Real-time events, subscriptions, and bidirectional communication.

```javascript
const mRPCSocket = require('mrpc-client/ws');

const ws = new mRPCSocket('ws://localhost:8090/ws');
```

### Subscribe to events

```javascript
// Wildcard patterns
await ws.subscribe(['product.*']);
await ws.subscribe(['order.created', 'order.updated']);

// Listen
ws.on('product.created', (data) => {
    console.log('New product:', data.name);
});

ws.on('order.*', (data, event) => {
    console.log(`${event}:`, data);
});
```

### Channels (multi-tenancy)

```javascript
// Subscribe to events in a specific channel
await ws.subscribe(['*'], 'tenant:42');
await ws.subscribe(['chat.*'], 'room:general');
```

### Call commands over WebSocket

```javascript
// Same API as HTTP, but through persistent connection
const result = await ws.call('get_items', { state: 'active' });
console.log(result.data);
```

### Built-in resilience

- ✅ Auto-reconnect with exponential backoff
- ✅ Heartbeat every 25 seconds
- ✅ Request/response correlation via unique IDs
- ✅ Automatic re-subscription after reconnect

## Response Format

Every response follows the same structure:

```javascript
// Success (query)
{ok: true, cmd: "get_items", data: [...], count: 3, ms: 0.42, v: "mRPC/1.0"}

// Success (exec)
{ok: true, cmd: "add_item", changes: 1, ms: 1.2, v: "mRPC/1.0"}

// Error
{ok: false, cmd: "bad", error: {code: "unknown_cmd", message: "..."}, v: "mRPC/1.0"}
```

## Error Codes

| Code | Meaning |
|------|---------|
| `unknown_cmd` | Command not found |
| `missing_param` | Required parameter missing |
| `validation_failed` | Input validation failed |
| `access_denied` | Insufficient permissions |
| `not_found` | Resource not found |
| `internal` | Server error |

## Zero Dependencies

- HTTP client uses native `fetch` (Node 18+) or `XMLHttpRequest` (browser)
- WebSocket client uses native `WebSocket` (browser) or `ws` (Node)
- No build step, no bundler, no transpiler

## Links

- 📋 [Full Specification (RFC 2119)](https://github.com/zephyr-m/mRpc/blob/master/SPEC.md)
- 💡 [Implementation Examples](https://github.com/zephyr-m/mRpc/blob/master/EXAMPLES.md)
- 🐛 [Issues](https://github.com/zephyr-m/mRpc/issues)

## License

MIT © Zephyr Muldash
