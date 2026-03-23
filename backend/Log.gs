// ===== BASKET FLOW — LOG.GS =====

/**
 * Escribir una entrada en el log de actividad
 * Llamar desde todas las funciones que modifican datos
 */
function Log_write(userInfo, accion, modulo, referencia, detalle, resultado) {
  try {
    const sheet = _getSheet('LogActividad');
    sheet.appendRow([
      `log_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,6)}`,
      new Date(),
      userInfo?.userId  || 'system',
      userInfo?.name    || 'System',
      userInfo?.role    || 'system',
      accion,
      modulo,
      referencia || '',
      detalle    || '',
      resultado  || 'OK'
    ]);
  } catch (err) {
    // Log never blocks the main operation
    Logger.log('[Log_write FAIL] ' + err.message);
  }
}

/**
 * Obtener el log (solo admin/supervisor)
 */
function Log_getList(payload, userInfo) {
  try {
    if (!userInfo || !['admin','supervisor'].includes(userInfo.role)) {
      return { ok: false, error: 'Sin permiso para ver el log.' };
    }

    const { usuario, modulo, accion, resultado, desde, hasta, busqueda, page = 1, size = 50 } = payload;
    let rows = _sheetToObjects(_getSheet('LogActividad'));

    // Filtros
    if (usuario)  rows = rows.filter(r => r.UsuarioID === usuario || r.UsuarioNombre?.toLowerCase().includes(usuario.toLowerCase()));
    if (modulo)   rows = rows.filter(r => r.Modulo  === modulo);
    if (accion)   rows = rows.filter(r => r.Accion  === accion);
    if (resultado) rows = rows.filter(r => r.Resultado === resultado);
    if (desde)    rows = rows.filter(r => new Date(r.Timestamp) >= new Date(desde));
    if (hasta)    rows = rows.filter(r => new Date(r.Timestamp) <= new Date(hasta + 'T23:59:59'));
    if (busqueda) {
      const q = busqueda.toLowerCase();
      rows = rows.filter(r =>
        String(r.Detalle).toLowerCase().includes(q) ||
        String(r.Referencia).toLowerCase().includes(q) ||
        String(r.UsuarioNombre).toLowerCase().includes(q)
      );
    }

    rows.sort((a, b) => new Date(b.Timestamp) - new Date(a.Timestamp));
    return { ok: true, ..._paginate(rows, page, size) };

  } catch (err) {
    Logger.log('[Log_getList] ' + err.message);
    return { ok: false, error: err.message };
  }
}
