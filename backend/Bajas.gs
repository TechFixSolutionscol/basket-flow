// ===== BASKET FLOW — BAJAS.GS =====
// Registro de merma, rotura o pérdida de canastillas

/**
 * Registrar una baja de canastillas
 * payload: { tipoCanasillaId, cantidad, motivo, notas }
 * motivo: 'ROTURA', 'PERDIDA', 'DAÑO_IRREPARABLE'
 */
function Bajas_registrar(payload, userInfo) {
  try {
    _requirePermission(userInfo, 'canasillas.ajuste');
    const { tipoCanasillaId, cantidad, motivo, notas } = payload;

    if (!tipoCanasillaId) throw new Error('Tipo de canasilla es obligatorio.');
    const qty = parseInt(cantidad, 10);
    if (!qty || qty <= 0) throw new Error('Cantidad debe ser mayor a 0.');
    if (!['ROTURA','PERDIDA','DAÑO_IRREPARABLE','OTRO'].includes(motivo)) {
      throw new Error('Motivo de baja inválido.');
    }

    // Obtener info de la canasilla
    const canasillas = _sheetToObjects(_getSheet('TiposCanasilla'));
    const canasilla  = canasillas.find(c => c.ID === tipoCanasillaId);
    if (!canasilla) throw new Error('Tipo de canasilla no encontrado.');

    const id = `baj_${Date.now().toString(36)}`;
    const ahora = new Date();

    // 1. Registrar en hoja de Bajas (Nueva hoja si no existe)
    _getSheet('BajasCanasillas').appendRow([
      id, ahora,
      tipoCanasillaId,
      canasilla.Descripcion,
      qty,
      motivo,
      notas || '',
      userInfo.userId,
      userInfo.name
    ]);

    // 2. Actualizar stock físico de la empresa (Decremento)
    // 2. Actualizar stock físico de la empresa (Decremento)
    _actualizarStock(
      'Empresa',
      'BASKET_FLOW',
      'Empresa',
      tipoCanasillaId,
      -qty, // SIEMPRE NEGATIVO PARA BAJAS
      id,
      userInfo
    );

    Log_write(userInfo, 'REGISTRAR_BAJA', 'Bajas', id,
      `Baja ${qty} uds (${canasilla.Descripcion}) por ${motivo}`, 'OK');

    return { ok: true, id, qty, motivo };

  } catch (err) {
    Logger.log('[Bajas_registrar] ' + err.message);
    return { ok: false, error: err.message };
  }
}

/**
 * Obtener historial de bajas
 */
function Bajas_getHistory(payload, userInfo) {
  try {
    const { desde, hasta, motivo, page = 1, size = 50 } = payload;
    let rows = _sheetToObjects(_getSheet('BajasCanasillas'));

    if (motivo) rows = rows.filter(r => r.Motivo === motivo);
    if (desde)  rows = rows.filter(r => new Date(r.Timestamp) >= new Date(desde));
    if (hasta)  rows = rows.filter(r => new Date(r.Timestamp) <= new Date(hasta + 'T23:59:59'));

    rows.sort((a, b) => new Date(b.Timestamp) - new Date(a.Timestamp));
    return { ok: true, ..._paginate(rows, page, size) };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * Estadísticas de bajas por motivo
 */
function Bajas_getStats(userInfo) {
  try {
    const rows = _sheetToObjects(_getSheet('BajasCanasillas'));
    const stats = { ROTURA: 0, PERDIDA: 0, DAÑO_IRREPARABLE: 0, OTRO: 0, total: 0 };
    
    rows.forEach(r => {
      if (stats[r.Motivo] !== undefined) stats[r.Motivo] += Number(r.Cantidad);
      else stats.OTRO += Number(r.Cantidad);
      stats.total += Number(r.Cantidad);
    });

    return { ok: true, stats };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}
