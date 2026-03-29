/**
 * mRPC WebSocket Server — Node.js Reference Implementation
 *
 * Features:
 *   - Request/response with id correlation
 *   - Subscribe/unsubscribe to events
 *   - Server push (broadcast to subscribers)
 *   - Channels (tenant isolation)
 *   - Heartbeat (60s timeout)
 *   - Wildcard matching (product.* matches product.created)
 *
 * Usage:
 *   npm install ws
 *   node ws-server.js [port]
 *
 * Default port: 8090
 */

const { WebSocketServer } = require('ws');
const http = require('http');

const PORT = parseInt(process.argv[2] || '8090', 10);
const VERSION = 'mRPC/1.0';
const HEARTBEAT_TIMEOUT = 60000;

// ── State ────────────────────────────────────────────────────────────────

const clients = new Map(); // ws → { subscriptions: Set, channels: Map, lastPing: Date }

// ── Helpers ──────────────────────────────────────────────────────────────

function send(ws, data) {
  if (ws.readyState === 1) {
    ws.send(JSON.stringify(data));
  }
}

function respond(ws, id, cmd, ok, extra) {
  send(ws, { id, ok, cmd, v: VERSION, ms: 0, ...extra });
}

function matchEvent(pattern, event) {
  if (pattern === '*') return true;
  if (pattern === event) return true;
  if (pattern.endsWith('.*')) {
    const prefix = pattern.slice(0, -2);
    return event.startsWith(prefix + '.');
  }
  return false;
}

// ── Broadcast event to subscribers ───────────────────────────────────────

function broadcast(event, data, channel = null) {
  const msg = {
    type: 'event',
    event,
    data,
    ts: new Date().toISOString(),
    v: VERSION,
  };
  if (channel) msg.channel = channel;

  for (const [ws, state] of clients) {
    if (ws.readyState !== 1) continue;

    // Check channel match
    if (channel) {
      const channelSubs = state.channels.get(channel);
      if (!channelSubs) continue;
      const match = [...channelSubs].some(p => matchEvent(p, event));
      if (!match) continue;
    } else {
      const match = [...state.subscriptions].some(p => matchEvent(p, event));
      if (!match) continue;
    }

    send(ws, msg);
  }
}

// ── Command handlers ─────────────────────────────────────────────────────

const builtins = {
  ping: (ws, id, params) => {
    respond(ws, id, 'ping', true, { data: { pong: true, clients: clients.size, ts: new Date().toISOString() } });
  },

  help: (ws, id, params) => {
    respond(ws, id, 'help', true, {
      data: {
        commands: {
          ping: { type: 'raw', description: 'Health check' },
          subscribe: { type: 'raw', params: { events: 'array', channel: 'string (optional)' } },
          unsubscribe: { type: 'raw', params: { events: 'array', channel: 'string (optional)' } },
          emit: { type: 'raw', params: { event: 'string', data: 'any', channel: 'string (optional)' } },
          help: { type: 'raw', description: 'List commands' },
        },
        total: 5,
      },
    });
  },

  subscribe: (ws, id, params) => {
    const state = clients.get(ws);
    const events = params.events || [];
    const channel = params.channel || null;

    if (channel) {
      if (!state.channels.has(channel)) state.channels.set(channel, new Set());
      events.forEach(e => state.channels.get(channel).add(e));
    } else {
      events.forEach(e => state.subscriptions.add(e));
    }

    respond(ws, id, 'subscribe', true, {
      data: {
        subscribed: events,
        channel: channel || undefined,
        total: channel ? state.channels.get(channel).size : state.subscriptions.size,
      },
    });
  },

  unsubscribe: (ws, id, params) => {
    const state = clients.get(ws);
    const events = params.events || [];
    const channel = params.channel || null;

    if (channel) {
      const subs = state.channels.get(channel);
      if (subs) {
        if (events.includes('*')) state.channels.delete(channel);
        else events.forEach(e => subs.delete(e));
      }
    } else {
      if (events.includes('*')) state.subscriptions.clear();
      else events.forEach(e => state.subscriptions.delete(e));
    }

    respond(ws, id, 'unsubscribe', true, { data: { unsubscribed: events } });
  },

  emit: (ws, id, params) => {
    const event = params.event;
    const data = params.data || {};
    const channel = params.channel || null;

    if (!event) {
      return respond(ws, id, 'emit', false, { error: { code: 'missing_param', message: 'event required' } });
    }

    broadcast(event, data, channel);
    respond(ws, id, 'emit', true, { data: { event, subscribers: countSubscribers(event, channel) } });
  },
};

function countSubscribers(event, channel) {
  let count = 0;
  for (const [ws, state] of clients) {
    if (ws.readyState !== 1) continue;
    if (channel) {
      const subs = state.channels.get(channel);
      if (subs && [...subs].some(p => matchEvent(p, event))) count++;
    } else {
      if ([...state.subscriptions].some(p => matchEvent(p, event))) count++;
    }
  }
  return count;
}

// ── Server ───────────────────────────────────────────────────────────────

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: true, v: VERSION, ws: `ws://localhost:${PORT}/ws` }));
});

const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws) => {
  clients.set(ws, {
    subscriptions: new Set(),
    channels: new Map(),
    lastPing: Date.now(),
  });

  console.log(`[+] Client connected (${clients.size} total)`);

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return send(ws, { ok: false, error: { code: 'invalid_json', message: 'Invalid JSON' }, v: VERSION });
    }

    const { id, cmd, ...params } = msg;
    const state = clients.get(ws);
    if (state) state.lastPing = Date.now();

    if (!cmd) {
      return builtins.help(ws, id, params);
    }

    if (builtins[cmd]) {
      builtins[cmd](ws, id, params);
    } else {
      send(ws, {
        id,
        ok: false,
        cmd,
        v: VERSION,
        error: { code: 'unknown_cmd', message: `Unknown command: ${cmd}`, commands: Object.keys(builtins) },
      });
    }
  });

  ws.on('close', () => {
    clients.delete(ws);
    console.log(`[-] Client disconnected (${clients.size} total)`);
  });

  ws.on('error', () => {
    clients.delete(ws);
  });
});

// ── Heartbeat check ──────────────────────────────────────────────────────

setInterval(() => {
  const now = Date.now();
  for (const [ws, state] of clients) {
    if (now - state.lastPing > HEARTBEAT_TIMEOUT) {
      console.log('[!] Client timed out');
      ws.terminate();
      clients.delete(ws);
    }
  }
}, 10000);

// ── Expose broadcast for external use ────────────────────────────────────

module.exports = { broadcast, server, wss };

// ── Start ────────────────────────────────────────────────────────────────

server.listen(PORT, () => {
  console.log(`mRPC/1.0 WebSocket server on ws://localhost:${PORT}/ws`);
  console.log(`HTTP info on http://localhost:${PORT}/`);
});
