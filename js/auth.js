// ===== BASKET FLOW — AUTH MODULE =====

const Auth = (() => {
  const SESSION_KEY = 'bf_session';

  // ── Get current session ──────────────────────────────
  function getSession() {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      const sess = JSON.parse(raw);
      if (isExpired(sess)) { logout(); return null; }
      return sess;
    } catch { return null; }
  }

  function isExpired(sess = null) {
    const s = sess || getSession();
    if (!s) return true;
    return Date.now() > s.expires;
  }

  function isAuthenticated() {
    return !!getSession();
  }

  // ── Login ──────────────────────────────────────────────
  async function login(email, password, keepAlive = false) {
    const hash = await Utils.sha256(password.trim());
    const res  = await API.post('login', { email: email.trim().toLowerCase(), passwordHash: hash, keepAlive });

    if (!res.ok) {
      return { ok: false, error: res.error || res.message || 'Credenciales inválidas.' };
    }

    const ttl = keepAlive ? 30 * 24 * 3600 * 1000 : 8 * 3600 * 1000;
    const session = {
      token:       res.token,
      userId:      res.userId,
      name:        res.name,
      role:        res.role,
      permissions: res.permissions || [],
      expires:     Date.now() + ttl,
      keepAlive,
    };

    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    return { ok: true, session };
  }

  // ── Logout ──────────────────────────────────────────────
  async function logout() {
    const session = getSession();
    if (session?.token) {
      // fire-and-forget, no esperamos respuesta
      API.post('logout', { token: session.token }).catch(() => {});
    }
    localStorage.removeItem(SESSION_KEY);
    Utils.cacheClearAll();
    showLoginView();
  }

  // ── Session expired handler ──────────────────────────────
  function handleSessionExpired() {
    localStorage.removeItem(SESSION_KEY);
    Utils.cacheClearAll();
    Utils.showToast('Tu sesión ha expirado. Inicia sesión nuevamente.', 'warning');
    setTimeout(showLoginView, 1500);
  }

  // ── Permissions ──────────────────────────────────────────
  function hasPermission(permKey) {
    const sess = getSession();
    if (!sess) return false;
    if (sess.role === 'admin') return true; // admin tiene todo
    return (sess.permissions || []).includes(permKey);
  }

  function getRole() {
    return getSession()?.role || null;
  }

  function isAdmin()      { return getRole() === 'admin'; }
  function isSupervisor() { return ['admin','supervisor'].includes(getRole()); }

  // ── View control ──────────────────────────────────────────
  function showLoginView() {
    document.getElementById('login-view').style.display  = 'flex';
    document.getElementById('app-shell').style.display   = 'none';
  }

  function showAppShell() {
    document.getElementById('login-view').style.display  = 'none';
    document.getElementById('app-shell').style.display   = 'flex';
  }

  // ── Guard ──────────────────────────────────────────────
  function guardRoute() {
    if (!isAuthenticated()) { showLoginView(); return false; }
    return true;
  }

  return {
    getSession, isExpired, isAuthenticated,
    login, logout, handleSessionExpired,
    hasPermission, getRole, isAdmin, isSupervisor,
    showLoginView, showAppShell, guardRoute,
  };
})();
