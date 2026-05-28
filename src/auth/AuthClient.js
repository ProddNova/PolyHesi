const TOKEN_KEY = "polyhesi.authToken.v1";

export class AuthClient {
  constructor() {
    this.token = window.localStorage.getItem(TOKEN_KEY) ?? "";
  }

  hasToken() {
    return Boolean(this.token);
  }

  async login(username, password) {
    const session = await this.request("/api/auth/login", {
      method: "POST",
      auth: false,
      body: { username, password },
    });
    this.setToken(session.token);
    return session;
  }

  async restoreSession() {
    if (!this.hasToken()) {
      return null;
    }

    try {
      return await this.request("/api/auth/me");
    } catch {
      this.logout();
      return null;
    }
  }

  async saveGameState(progress, { keepalive = false } = {}) {
    return this.request("/api/save", {
      method: "PUT",
      body: { progress },
      keepalive,
    });
  }

  setToken(token) {
    this.token = token ?? "";
    if (this.token) {
      window.localStorage.setItem(TOKEN_KEY, this.token);
    } else {
      window.localStorage.removeItem(TOKEN_KEY);
    }
  }

  logout() {
    this.setToken("");
  }

  async request(path, options = {}) {
    const headers = {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    };

    if (options.auth !== false && this.token) {
      headers.Authorization = `Bearer ${this.token}`;
    }

    const response = await fetch(path, {
      method: options.method ?? "GET",
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
      keepalive: Boolean(options.keepalive),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error ?? "Errore di rete.");
    }
    return payload;
  }
}
