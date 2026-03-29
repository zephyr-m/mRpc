/**
 * mRPC Client — JavaScript SDK
 * 
 * @version 1.0
 * @example
 *   const api = new mRPC('http://localhost:8088/api.php');
 *   const products = await api.call('get_products', { state: 'active' });
 *   console.log(products.data);
 */
class mRPC {
  constructor(endpoint, options = {}) {
    this.endpoint = endpoint;
    this.token = options.token || null;
    this.timeout = options.timeout || 30000;
    this.version = 'mRPC/1.0';
    this.onError = options.onError || null;
  }

  /**
   * Вызвать команду
   * @param {string} cmd — имя команды
   * @param {object} params — параметры
   * @returns {Promise<object>} — ответ сервера
   */
  async call(cmd, params = {}) {
    const body = { cmd, ...params };
    const headers = { 'Content-Type': 'application/json' };
    if (this.token) headers['Authorization'] = `Bearer ${this.token}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);

    try {
      const res = await fetch(this.endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      const json = await res.json();

      if (!json.ok && this.onError) {
        this.onError(json.error, cmd, params);
      }

      return json;
    } catch (err) {
      const error = { ok: false, cmd, error: { code: 'network', message: err.message }, v: this.version };
      if (this.onError) this.onError(error.error, cmd, params);
      return error;
    } finally {
      clearTimeout(timer);
    }
  }

  /** Получить список команд */
  async help() {
    return this.call('help');
  }

  /** Описание конкретной команды */
  async describe(command) {
    return this.call('describe', { command });
  }

  /** Health check */
  async ping() {
    return this.call('ping');
  }

  /** Авторизация */
  async login(email, password) {
    const res = await this.call('auth_login', { email, password });
    if (res.ok && res.data?.token) {
      this.token = res.data.token;
    }
    return res;
  }

  /** Установить токен */
  setToken(token) {
    this.token = token;
    return this;
  }
}

// Node.js / CommonJS
if (typeof module !== 'undefined') module.exports = mRPC;

// ES Module
if (typeof window !== 'undefined') window.mRPC = mRPC;
