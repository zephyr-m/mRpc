/**
 * mRPC WebSocket Client — JavaScript SDK
 *
 * @version 1.0
 * @example
 *   const ws = new mRPCSocket('ws://localhost:8090/ws');
 *   ws.on('product.created', (data) => console.log('New!', data));
 *   await ws.subscribe(['product.*']);
 *   const result = await ws.call('ping');
 */
class mRPCSocket {
  constructor(url, options = {}) {
    this.url = url;
    this.token = options.token || null;
    this.version = 'mRPC/1.0';
    this.reconnect = options.reconnect !== false;
    this.heartbeatInterval = options.heartbeat || 25000;

    this._ws = null;
    this._id = 0;
    this._pending = new Map();       // id → {resolve, reject, timer}
    this._listeners = new Map();     // event pattern → Set<callback>
    this._subscriptions = new Set(); // active subscriptions (for reconnect)
    this._channels = new Map();      // channel → Set<events>
    this._heartbeat = null;
    this._backoff = 1000;

    this.connect();
  }

  // ── Connection ──────────────────────────────────────────────────────

  connect() {
    this._ws = new WebSocket(this.url);

    this._ws.onopen = () => {
      this._backoff = 1000;
      this._startHeartbeat();
      // Re-subscribe after reconnect
      if (this._subscriptions.size > 0) {
        this.call('subscribe', { events: [...this._subscriptions] });
      }
      for (const [ch, events] of this._channels) {
        this.call('subscribe', { channel: ch, events: [...events] });
      }
    };

    this._ws.onmessage = (e) => {
      let msg;
      try { msg = JSON.parse(e.data); } catch { return; }

      // Event push
      if (msg.type === 'event') {
        this._emit(msg.event, msg.data, msg.channel);
        return;
      }

      // Response to request
      if (msg.id && this._pending.has(msg.id)) {
        const { resolve, timer } = this._pending.get(msg.id);
        clearTimeout(timer);
        this._pending.delete(msg.id);
        resolve(msg);
      }
    };

    this._ws.onclose = () => {
      this._stopHeartbeat();
      if (this.reconnect) {
        setTimeout(() => this.connect(), this._backoff);
        this._backoff = Math.min(this._backoff * 2, 30000);
      }
    };

    this._ws.onerror = () => {};
  }

  // ── Request/Response ────────────────────────────────────────────────

  call(cmd, params = {}, timeout = 10000) {
    return new Promise((resolve, reject) => {
      const id = `req-${++this._id}`;
      const msg = { id, cmd, ...params };
      if (this.token) msg.token = this.token;

      const timer = setTimeout(() => {
        this._pending.delete(id);
        reject(new Error(`mRPC timeout: ${cmd}`));
      }, timeout);

      this._pending.set(id, { resolve, reject, timer });
      this._ws.send(JSON.stringify(msg));
    });
  }

  // ── Subscribe / Unsubscribe ─────────────────────────────────────────

  async subscribe(events, channel = null) {
    const params = { events };
    if (channel) {
      params.channel = channel;
      if (!this._channels.has(channel)) this._channels.set(channel, new Set());
      events.forEach(e => this._channels.get(channel).add(e));
    } else {
      events.forEach(e => this._subscriptions.add(e));
    }
    return this.call('subscribe', params);
  }

  async unsubscribe(events, channel = null) {
    const params = { events };
    if (channel) {
      params.channel = channel;
      const subs = this._channels.get(channel);
      if (subs) {
        if (events.includes('*')) this._channels.delete(channel);
        else events.forEach(e => subs.delete(e));
      }
    } else {
      if (events.includes('*')) this._subscriptions.clear();
      else events.forEach(e => this._subscriptions.delete(e));
    }
    return this.call('unsubscribe', params);
  }

  // ── Event listeners ─────────────────────────────────────────────────

  on(pattern, callback) {
    if (!this._listeners.has(pattern)) this._listeners.set(pattern, new Set());
    this._listeners.get(pattern).add(callback);
    return this;
  }

  off(pattern, callback) {
    const set = this._listeners.get(pattern);
    if (set) {
      if (callback) set.delete(callback);
      else this._listeners.delete(pattern);
    }
    return this;
  }

  _emit(event, data, channel) {
    for (const [pattern, callbacks] of this._listeners) {
      if (this._matchEvent(pattern, event)) {
        for (const cb of callbacks) cb(data, event, channel);
      }
    }
  }

  _matchEvent(pattern, event) {
    if (pattern === '*') return true;
    if (pattern === event) return true;
    if (pattern.endsWith('.*')) {
      return event.startsWith(pattern.slice(0, -2) + '.');
    }
    return false;
  }

  // ── Heartbeat ───────────────────────────────────────────────────────

  _startHeartbeat() {
    this._heartbeat = setInterval(() => {
      if (this._ws.readyState === 1) {
        this._ws.send(JSON.stringify({ cmd: 'ping' }));
      }
    }, this.heartbeatInterval);
  }

  _stopHeartbeat() {
    if (this._heartbeat) clearInterval(this._heartbeat);
  }

  // ── Close ───────────────────────────────────────────────────────────

  close() {
    this.reconnect = false;
    this._stopHeartbeat();
    this._ws.close();
  }

  // ── Helpers ─────────────────────────────────────────────────────────

  get connected() {
    return this._ws && this._ws.readyState === 1;
  }

  setToken(token) {
    this.token = token;
    return this;
  }
}

if (typeof module !== 'undefined') module.exports = mRPCSocket;
if (typeof window !== 'undefined') window.mRPCSocket = mRPCSocket;
