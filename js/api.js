// ===== BASKET FLOW — API CLIENT =====

const API = (() => {
  const GAS_URL = 'https://script.google.com/macros/s/AKfycbwRCqxrwMAM7gFmRbgX5eyj-osVY7cJMDJTxba_YX1CtAD0-V1hd40IY1MTYSSYISIm/exec';

  const MAX_RETRIES = 3;
  const RETRY_DELAYS = [800, 2000, 5000]; // backoff exponencial

  // Obtener sesión actual del localStorage
  function _getSession() {
    try {
      const raw = localStorage.getItem('bf_session');
      if (!raw) return null;
      return JSON.parse(raw);
    } catch { return null; }
  }

  // Refrescar expiración del token en cada request exitoso
  function _refreshSession(session) {
    if (!session) return;
    const ttl = session.keepAlive ? 30 * 24 * 3600 * 1000 : 8 * 3600 * 1000;
    session.expires = Date.now() + ttl;
    localStorage.setItem('bf_session', JSON.stringify(session));
  }

  // Request principal con retry y backoff
  async function request(action, payload = {}, retries = 0) {
    const session = _getSession();

    const body = {
      action,
      payload,
      token: session?.token ?? null,
    };

    try {
      const res = await fetch(GAS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' }, // GAS requiere text/plain para evitar preflight
        body: JSON.stringify(body),
        redirect: 'follow',
      });

      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          Auth.handleSessionExpired();
          return { ok: false, error: 'Sesión expirada' };
        }
        throw new Error(`HTTP ${res.status}`);
      }

      const data = await res.json();

      if (data.error === 'TOKEN_INVALID' || data.error === 'TOKEN_EXPIRED') {
        Auth.handleSessionExpired();
        return { ok: false, error: 'Sesión expirada' };
      }

      if (data.ok !== false) {
        _refreshSession(session);
      }

      return data;

    } catch (err) {
      if (!navigator.onLine) {
        Utils.showToast('Sin conexión. Verifica tu internet.', 'warning');
        return { ok: false, error: 'Sin conexión' };
      }
      if (retries < MAX_RETRIES - 1) {
        await new Promise(r => setTimeout(r, RETRY_DELAYS[retries]));
        return request(action, payload, retries + 1);
      }
      console.error('[API] Error:', err);
      Utils.showToast('Error de conexión con el servidor.', 'error');
      return { ok: false, error: err.message };
    }
  }

  // Shorthand helpers
  async function get(action, params = {}) {
    return request(action, params);
  }

  async function post(action, payload = {}) {
    return request(action, payload);
  }

  return { request, get, post, GAS_URL };
})();
