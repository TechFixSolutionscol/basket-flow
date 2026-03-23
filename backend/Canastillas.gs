// ===== BASKET FLOW — CANASILLAS.GS =====

/**
 * Resumen KPIs de canasillas
 */
function Canasillas_getResumen(userInfo) {
  try {
    const stock  = _sheetToObjects(_getSheet('StockCanasillas'));
    const config = _getConfigValue('dias_alerta_canasillas', 7);

    let totalStock      = 0;
    let alertas         = 0;
    const resumen = { empresa: 0, clientes: 0, proveedores: 0 };

    stock.forEach(s => {
      const q = parseInt(s.StockActual, 10) || 0;
      totalStock += q;
      if (s.PropietarioTipo === 'Empresa') resumen.empresa     += q;
      if (s.PropietarioTipo === 'Cliente') resumen.clientes    += q;
      if (s.PropietarioTipo === 'Proveedor') resumen.proveedores += q;
    });

    // Alertas: movimientos tipo Salida > N días sin retorno
    const alertaItems = _getAlertaItems(parseInt(config, 10) || 7);
    alertas = alertaItems.length;

    return {
      ok: true,
      totalStock,
      empresa:      resumen.empresa,
      conClientes:  resumen.clientes,
      conProveedores: resumen.proveedores,
      alertas,
    };

  } catch (err) {
    Logger.log('[Canasillas_getResumen] ' + err.message);
    return { ok: false, error: err.message };
  }
}

/**
 * Detalle de stock por propietario
 */
function Canasillas_getDetalle(userInfo) {
  try {
    const stock = _sheetToObjects(_getSheet('StockCanasillas'));
    return { ok: true, stock };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * Log de movimientos de canasillas (con filtros y paginación)
 */
function Canasillas_getMovimientos(payload, userInfo) {
  try {
    const { propietario, tipo, desde, hasta, page = 1, size = 50 } = payload;
    let rows = _sheetToObjects(_getSheet('MovimientosCanasillas'));

    if (propietario) rows = rows.filter(r => r.PropietarioID === propietario || r.PropietarioNombre?.toLowerCase().includes(propietario.toLowerCase()));
    if (tipo)        rows = rows.filter(r => r.Tipo === tipo);
    if (desde)       rows = rows.filter(r => new Date(r.FechaHora) >= new Date(desde));
    if (hasta)       rows = rows.filter(r => new Date(r.FechaHora) <= new Date(hasta + 'T23:59:59'));

    rows.sort((a, b) => new Date(b.FechaHora) - new Date(a.FechaHora));
    return { ok: true, ..._paginate(rows, page, size) };

  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * Crear ajuste manual de inventario (solo admin)
 */
function Canasillas_crearAjuste(payload, userInfo) {
  try {
    _requirePermission(userInfo, 'canasillas.ajuste');
    const { propietarioTipo, propietarioID, propietarioNombre,
            pesoUnitario, cantidad, motivo } = payload;
    if (!motivo) throw new Error('El motivo del ajuste es obligatorio.');

    const delta = parseInt(cantidad, 10);
    _actualizarStock(propietarioTipo, propietarioID, propietarioNombre,
                     parseFloat(pesoUnitario), delta, `AJUSTE-${userInfo.userId}`, userInfo);

    // Cambiar tipo del movimiento a 'Ajuste'
    const mSheet = _getSheet('MovimientosCanasillas');
    const data   = mSheet.getDataRange().getValues();
    const lastRow = data.length;
    mSheet.getRange(lastRow, 3).setValue('Ajuste');
    mSheet.getRange(lastRow, 11).setValue(motivo);

    Log_write(userInfo, 'AJUSTE_CANASILLA', 'Canasillas', propietarioID,
      `Ajuste ${delta > 0 ? '+' : ''}${delta} uds — ${motivo}`, 'OK');

    return { ok: true };

  } catch (err) {
    Logger.log('[Canasillas_crearAjuste] ' + err.message);
    return { ok: false, error: err.message };
  }
}

/**
 * Alertas de canasillas fuera > N días
 */
function Canasillas_getAlertas(userInfo) {
  try {
    const config = _getConfigValue('dias_alerta_canasillas', 7);
    const items  = _getAlertaItems(parseInt(config, 10) || 7);
    return { ok: true, alertas: items };
  } catch (err) {
    return { ok: false, alertas: [] };
  }
}

// ── Helper: items en alerta ──────────────────────────────────────────────────
function _getAlertaItems(diasMax) {
  const movs = _sheetToObjects(_getSheet('MovimientosCanasillas'));
  const ahora = new Date();
  const alertas = [];

  // Agrupar salidas sin retorno correspondiente
  const salidas = movs.filter(m => m.Tipo === 'Salida');
  salidas.forEach(s => {
    const dias = Math.floor((ahora - new Date(s.FechaHora)) / (1000 * 60 * 60 * 24));
    if (dias >= diasMax) {
      alertas.push({
        propietario: s.PropietarioNombre,
        propietarioTipo: s.PropietarioTipo,
        cantidad: s.Cantidad,
        dias,
        referencia: s.ReferenciaDoc,
        ubicacion: s.Notas || 'En campo',
        fechaSalida: s.FechaHora,
      });
    }
  });

  return alertas;
}

// ── Helper: obtener valor de configuración ───────────────────────────────────
function _getConfigValue(clave, defaultVal) {
  try {
    const sheet = _getSheet('Configuracion');
    const rows  = _sheetToObjects(sheet);
    const row   = rows.find(r => r.Clave === clave);
    return row ? row.Valor : defaultVal;
  } catch { return defaultVal; }
}
