// ===== BASKET FLOW — APP.JS (SPA Router & Init) =====

const App = (() => {
  let _clockInterval = null;
  let _pollingInterval = null;
  let _masters = null;

  const VIEWS = ['dashboard','nueva-entrada','entradas','devoluciones','canasillas','consignacion','bajas','reportes','log','maestros','usuarios','configuracion'];

  // ── Initialize ─────────────────────────────────────────────────────────
  async function init() {
    Utils.initOfflineDetection();

    const session = Auth.getSession();
    if (!session) {
      Auth.showLoginView();
      _initLoginForm();
      return;
    }

    Auth.showAppShell();
    _renderTopbarUser(session);
    _applySecurity(session);
    _startClock();
    await _loadMasters();
    _updateCompanyBranding();
    await navigate('dashboard');
    _startPolling();
  }

  function _updateCompanyBranding() {
     const empNombre = (getMasters().config || []).find(r => r.Clave === 'empresa.nombre')?.Valor || 'BASKET FLOW';
     const logoEl = document.querySelector('.topbar-logo');
     if (logoEl) {
        logoEl.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg> ${empNombre}`;
     }
     _updateBreadcrumb(document.querySelector('.nav-item.active')?.dataset.view || 'dashboard');
  }

  // ── SPA Navigation ─────────────────────────────────────────────────────
  async function navigate(view) {
    if (!Auth.guardRoute()) return;

    // Hide all views
    VIEWS.forEach(v => {
      const el = document.getElementById(`view-${v}`);
      if (el) el.style.display = 'none';
    });

    const target = document.getElementById(`view-${view}`);
    if (!target) { console.warn(`View not found: view-${view}`); return; }

    target.style.display = 'block';
    _updateBreadcrumb(view);
    _updateSidebarActive(view);

    // Lazy-init each module
    switch (view) {
      case 'dashboard':      await Dashboard.init(); break;
      case 'nueva-entrada':  Entradas.initForm();   break;
      case 'entradas':       await Entradas.initGrid(); break;
      case 'devoluciones':   await Devoluciones.init(); break;
      case 'canasillas':     await Canasillas.init(); break;
      case 'consignacion':   await Consignacion.init(); break;
      case 'bajas':          await Bajas.init(); break;
      case 'reportes':       Reportes.init();        break;
      case 'log':            await Log.init();        break;
      case 'maestros':       await Maestros.init();   break;
      case 'usuarios':       await Usuarios.init();   break;
      case 'configuracion':  await Configuracion.init(); break;
    }
  }

  // ── Masters cache ─────────────────────────────────────────────────────
  async function _loadMasters() {
    const cached = Utils.cacheGet('masters');
    if (cached) { _masters = cached; return; }

    const res = await API.get('getMaestros');
    if (res.ok) {
      _masters = res;
      Utils.cacheSet('masters', res, 4);
    }
  }

  function getMasters() { return _masters || {}; }

  function invalidateMasters() {
    Utils.cacheClear('masters');
    _masters = null;
  }

  // ── Clock ─────────────────────────────────────────────────────────────
  function _startClock() {
    const el = document.getElementById('topbar-clock');
    if (!el) return;
    const update = () => {
      const now = new Date();
      el.textContent = now.toLocaleTimeString('es-CO', { hour12: false });
    };
    update();
    _clockInterval = setInterval(update, 1000);
  }

  // ── Polling (alerts every 2 min) ──────────────────────────────────────
  function _startPolling() {
    const poll = async () => {
      if (!Auth.isAuthenticated()) return;
      const res = await API.get('getAlertas');
      if (res.ok) {
        const count = (res.alertas || []).length;
        const badge = document.getElementById('notif-badge');
        if (badge) {
          badge.textContent = count;
          badge.style.display = count > 0 ? 'block' : 'none';
        }
        // Sidebar badge
        const sbBadge = document.getElementById('sidebar-canasillas-badge');
        if (sbBadge) {
          sbBadge.textContent = count;
          sbBadge.style.display = count > 0 ? 'inline-block' : 'none';
        }
      }
    };
    poll();
    _pollingInterval = setInterval(poll, 120_000); // 2 min
  }

  // ── Topbar user render ─────────────────────────────────────────────────
  function _renderTopbarUser(session) {
    const el = document.getElementById('topbar-user-name');
    if (el) el.textContent = session.name;
    const av = document.getElementById('topbar-avatar');
    if (av) {
      av.textContent = session.name.charAt(0).toUpperCase();
      av.onclick = _toggleUserMenu;
    }
    const roleEl = document.getElementById('topbar-user-role');
    if (roleEl) roleEl.textContent = session.role;
  }

  function _toggleUserMenu() {
    const menu = document.getElementById('user-menu');
    if (menu) menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
  }

  // ── Access Control & Sidebar ──────────────────────────────────────────
  function _applySecurity(session) {
    const isAdmin = Auth.isAdmin();
    const isSup   = Auth.isSupervisor();

    // 1. Ocultar elementos según data-role en TODO el documento
    document.querySelectorAll('[data-role]').forEach(el => {
      const roleReq = el.dataset.role;
      if (roleReq === 'admin' && !isAdmin)      el.style.display = 'none';
      else if (roleReq === 'supervisor' && !isSup) el.style.display = 'none';
    });

    // 2. Activar navegación en el sidebar
    document.querySelectorAll('.nav-item[data-view]').forEach(item => {
      item.addEventListener('click', () => navigate(item.dataset.view));
    });
  }

  function _updateSidebarActive(view) {
    document.querySelectorAll('.nav-item[data-view]').forEach(item => {
      item.classList.toggle('active', item.dataset.view === view);
    });
  }

  // ── Breadcrumb ───────────────────────────────────────────────────────
  const VIEW_NAMES = {
    'dashboard':    'Dashboard',
    'nueva-entrada':'Nueva Entrada',
    'entradas':     'Registro de Entradas',
    'devoluciones': 'Devoluciones',
    'canasillas':   'Control de Canasillas',
    'consignacion': 'Canasillas en Consignación',
    'bajas':        'Bajas (Fugas/Daño)',
    'reportes':     'Reportes',
    'log':          'Log de Actividad',
    'maestros':     'Maestros',
    'usuarios':     'Gestión de Usuarios',
    'configuracion':'Configuración de Empresa',
  };

  function _updateBreadcrumb(view) {
    const el = document.getElementById('topbar-breadcrumb');
    const empNombre = (getMasters().config || []).find(r => r.Clave === 'empresa.nombre')?.Valor || 'Basket Flow';
    if (el) el.innerHTML = `<span>${empNombre}</span> / ${VIEW_NAMES[view] || view}`;
  }

  // ── Logout ───────────────────────────────────────────────────────────
  async function logout() {
    clearInterval(_clockInterval);
    clearInterval(_pollingInterval);
    await Auth.logout();
  }

  return { init, navigate, getMasters, invalidateMasters, logout };
})();

// ═══════════════════════════════════════════════════════════════════════════
//  LOGIN FORM HANDLER
// ═══════════════════════════════════════════════════════════════════════════
function _initLoginForm() {
  const form     = document.getElementById('login-form');
  const emailIn  = document.getElementById('login-email');
  const passIn   = document.getElementById('login-password');
  const keepIn   = document.getElementById('login-keep');
  const btnLogin = document.getElementById('login-btn');
  const errorEl  = document.getElementById('login-error');
  const togglePw = document.getElementById('toggle-password');

  if (!form) return;

  // Toggle password visibility
  if (togglePw) {
    togglePw.addEventListener('click', () => {
      const isPass = passIn.type === 'password';
      passIn.type  = isPass ? 'text' : 'password';
      togglePw.innerHTML = isPass
        ? '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>'
        : '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
    });
  }

  // Email real-time validation
  emailIn?.addEventListener('input', () => {
    emailIn.classList.toggle('valid',   Utils.validateEmail(emailIn.value));
    emailIn.classList.toggle('invalid', emailIn.value.length > 3 && !Utils.validateEmail(emailIn.value));
  });

  // Form submit
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const card = document.getElementById('login-form-card');

    btnLogin.classList.add('btn-loading');
    btnLogin.innerHTML = '<span class="btn-spinner"></span> AUTENTICANDO...';
    errorEl.style.display = 'none';

    const res = await Auth.login(emailIn.value, passIn.value, keepIn?.checked || false);

    btnLogin.classList.remove('btn-loading');
    btnLogin.innerHTML = 'INICIAR SESIÓN';

    if (!res.ok) {
      errorEl.textContent = res.error;
      errorEl.style.display = 'flex';
      card?.classList.add('animate-shake');
      setTimeout(() => card?.classList.remove('animate-shake'), 500);
      return;
    }

    App.init();
  });
}

// ═══════════════════════════════════════════════════════════════════════════
//  BOOT
// ═══════════════════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', App.init);

// Close user menu on outside click
document.addEventListener('click', (e) => {
  const menu   = document.getElementById('user-menu');
  const avatar = document.getElementById('topbar-avatar');
  if (menu && !avatar?.contains(e.target) && !menu.contains(e.target)) {
    menu.style.display = 'none';
  }
});

// ═══════════════════════════════════════════════════════════════════════════
//  TECHNICAL SUPPORT (Techfix)
// ═══════════════════════════════════════════════════════════════════════════
function toggleSupportChat() {
  const chat = document.getElementById('support-chat');
  if (!chat) return;
  chat.classList.toggle('hidden');
}

function redirectToWhatsApp() {
  const phone = "573043910549";
  const msg   = encodeURIComponent("Hola Soporte Techfix, requiero ayuda con la aplicación Basket Flow.");
  window.open(`https://wa.me/${phone}?text=${msg}`, '_blank');
}

// Support toggle initial listener
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('support-toggle')?.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleSupportChat();
  });

  // Close chat when clicking outside
  document.addEventListener('click', (e) => {
    const chat = document.getElementById('support-chat');
    const toggle = document.getElementById('support-toggle');
    if (chat && !chat.classList.contains('hidden') && !chat.contains(e.target) && !toggle.contains(e.target)) {
      chat.classList.add('hidden');
    }
  });
});
