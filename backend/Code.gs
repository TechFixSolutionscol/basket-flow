// ===== BASKET FLOW — CODE.GS (doGet / doPost dispatcher) =====

/**
 * doGet — sirve el HTML de la SPA si se accede via browser
 */
function doGet(e) {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('Basket Flow — Sistema de Control de Báscula')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * doPost — dispatcher central de la API REST
 * Body JSON: { action, payload, token }
 */
function doPost(e) {
  const headers = {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  try {
    const body    = JSON.parse(e.postData.contents || '{}');
    const action  = body.action  || '';
    const payload = body.payload || {};
    const token   = body.token   || null;

    let userInfo = null;

    // Acciones que NO requieren token
    const publicActions = ['login', 'ping'];

    if (!publicActions.includes(action)) {
      userInfo = Auth_validateToken(token);
      if (!userInfo) {
        return _jsonResponse({ ok: false, error: 'TOKEN_INVALID' }, headers);
      }
    }

    let result;

    switch (action) {
      // ── Auth ──
      case 'ping':       result = { ok: true, ts: new Date().toISOString() }; break;
      case 'login':      result = Auth_login(payload); break;
      case 'logout':     result = Auth_logout(token); break;

      // ── Dashboard ──
      case 'getDashboardKPIs':   result = Reportes_getDashboardKPIs(userInfo); break;
      case 'getChartData':       result = Reportes_getChartData(payload, userInfo); break;
      case 'getAlertas':         result = Canasillas_getAlertas(userInfo); break;

      // ── Entradas ──
      case 'crearEntrada':       result = Entradas_crear(payload, userInfo); break;
      case 'getEntradas':        result = Entradas_getList(payload, userInfo); break;
      case 'getEntrada':         result = Entradas_getOne(payload.id, userInfo); break;
      case 'getResumenCanastasEntrada': result = Entradas_getResumenCanastas(payload, userInfo); break;
      case 'editarEntrada':      result = Entradas_editar(payload, userInfo); break;
      case 'anularEntrada':      result = Entradas_anular(payload.id, userInfo); break;

      // ── Devoluciones ──
      case 'crearDevolucion':    result = Devoluciones_crear(payload, userInfo); break;
      case 'getDevoluciones':    result = Devoluciones_getList(payload, userInfo); break;
      case 'getDevolucion':      result = Devoluciones_getOne(payload.id, userInfo); break;
      case 'aprobarDevolucion':  result = Devoluciones_aprobar(payload.id, userInfo); break;
      case 'rechazarDevolucion': result = Devoluciones_rechazar(payload, userInfo); break;

      // ── Canasillas ──
      case 'getStockResumen':    result = Canasillas_getResumen(userInfo); break;
      case 'getStockDetalle':    result = Canasillas_getDetalle(userInfo); break;
      case 'getMovimientos':     result = Canasillas_getMovimientos(payload, userInfo); break;
      case 'crearAjuste':        result = Canasillas_crearAjuste(payload, userInfo); break;

      // ── Maestros ──
      case 'getMaestros':        result = Maestros_getAll(userInfo); break;
      case 'saveMaestro':        result = Maestros_save(payload, userInfo); break;
      case 'toggleActivoMaestro':result = Maestros_toggleActivo(payload, userInfo); break;
      case 'getConfig':          result = Maestros_getConfig(userInfo); break;
      case 'saveConfig':         result = Maestros_saveConfig(payload, userInfo); break;

      // ── Usuarios ──
      case 'getUsuarios':        result = Usuarios_getList(userInfo); break;
      case 'crearUsuario':       result = Usuarios_crear(payload, userInfo); break;
      case 'editarUsuario':      result = Usuarios_editar(payload, userInfo); break;
      case 'resetPassword':      result = Usuarios_resetPassword(payload.userId, userInfo); break;
      case 'toggleActivoUsuario':result = Usuarios_toggleActivo(payload.userId, userInfo); break;

      // ── Reportes ──
      case 'getReporteDiario':   result = Reportes_getDiario(payload, userInfo); break;
      case 'getReporteProveedor':result = Reportes_getProveedor(payload, userInfo); break;
      case 'getReporteCliente':  result = Reportes_getCliente(payload, userInfo); break;
      case 'getReporteProducto': result = Reportes_getProducto(payload, userInfo); break;

      // ── Log ──
      case 'getLog':             result = Log_getList(payload, userInfo); break;

      // ── Consignación ──
      case 'registrarMovimientoConsignacion':  result = Consignacion_registrarMovimiento(payload, userInfo); break;
      case 'getInventarioClienteConsignacion': result = Consignacion_getInventarioCliente(payload, userInfo); break;
      case 'getResumenConsignacion':           result = Consignacion_getResumenGeneral(userInfo); break;
      case 'getHistorialConsignacion':         result = Consignacion_getHistorial(payload, userInfo); break;
      case 'ajusteConsignacion':               result = Consignacion_ajusteManual(payload, userInfo); break;

      // ── Notificaciones ──
      case 'enviarAlertaConsignacion':         result = Notificaciones_alertaManual(userInfo); break;


      default:
        result = { ok: false, error: `Acción desconocida: ${action}` };
    }

    return _jsonResponse(result || { ok: true }, headers);

  } catch (err) {
    Logger.log('[doPost ERROR] ' + err.message + '\n' + err.stack);
    return _jsonResponse({ ok: false, error: 'Error interno del servidor.', detail: err.message }, headers);
  }
}

// ── Helper: JSON response con CORS ──────────────────────────────────────────
// Nota: Google Apps Script NO permite agregar headers arbitrarios en ContentService.
// El workaround es asegurarse que el fetch del cliente use:
//   mode: 'no-cors'  (no puede leer la respuesta) ← NO útil
// O bien, el Web App GAS debe estar publicado como "Anyone" y el cliente debe
// usar Content-Type: text/plain (sin preflight).
// GAS devuelve CORS automáticamente cuando está publicado correctamente.
function _jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// doOptions no existe en GAS, pero se deja como comentario para documentación.
// El CORS en GAS se maneja automáticamente si el Web App está publicado como
// "Anyone, even anonymous" con acceso de ejecución "Me".


// ── Helper: get sheet by name ───────────────────────────────────────────────
function _getSheet(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(name);
  if (!sheet) throw new Error(`Hoja no encontrada: ${name}. Ejecuta setupDatabase() primero.`);
  return sheet;
}

// ── Helper: sheet to objects ───────────────────────────────────────────────
function _sheetToObjects(sheet) {
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  const headers = data[0];
  return data.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = row[i]; });
    return obj;
  });
}

// ── Helper: paginate array ─────────────────────────────────────────────────
function _paginate(arr, page = 1, size = 50) {
  const p    = Math.max(1, parseInt(page, 10));
  const s    = Math.min(500, Math.max(10, parseInt(size, 10)));
  const total = arr.length;
  const pages = Math.ceil(total / s);
  const items = arr.slice((p - 1) * s, p * s);
  return { items, total, page: p, size: s, pages };
}

// ── Helper: check permission ────────────────────────────────────────────────
function _requirePermission(userInfo, perm) {
  if (!userInfo) throw new Error('No autenticado');
  if (userInfo.role === 'admin') return true;
  if (!(userInfo.permissions || []).includes(perm)) {
    throw new Error(`Sin permiso: ${perm}`);
  }
  return true;
}
