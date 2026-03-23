// ===== BASKET FLOW — DEVOLUCIONES.GS =====

/**
 * Crear devolución (en estado Borrador)
 */
function Devoluciones_crear(payload, userInfo) {
  try {
    _requirePermission(userInfo, 'devoluciones.crear');
    const { entradaRef, motivo, motivoTexto, pesoDevuelto, canasillasRetorno, comentarios } = payload;

    if (!entradaRef)   throw new Error('Referencia de entrada es obligatoria.');
    if (!motivo)       throw new Error('Motivo de devolución es obligatorio.');
    if (!pesoDevuelto || parseFloat(pesoDevuelto) <= 0) throw new Error('Peso devuelto debe ser mayor a cero.');

    // Verificar que la entrada existe y está activa
    const entradas = _sheetToObjects(_getSheet('Entradas'));
    const entrada  = entradas.find(e => e.Consecutivo === entradaRef);
    if (!entrada)            throw new Error('Entrada no encontrada.');
    if (entrada.Estado === 'Anulada') throw new Error('No se puede devolver una entrada anulada.');

    // Calcular nuevo peso neto
    const nuevoPesoLibre = parseFloat(entrada.PesoLibre) - parseFloat(pesoDevuelto);
    if (nuevoPesoLibre < 0) throw new Error('El peso devuelto supera el peso neto de la entrada.');

    const consecutivo = generateConsecutivo('DEV');
    const ahora       = new Date();

    const sheet = _getSheet('Devoluciones');
    sheet.appendRow([
      consecutivo, entradaRef, ahora,
      motivo, motivoTexto || '',
      parseFloat(pesoDevuelto),
      JSON.stringify(canasillasRetorno || []),
      userInfo.userId, userInfo.name,
      'Pendiente',
      '', '', // AprobadoPor, FechaAprobacion
      comentarios || ''
    ]);

    // Guardar líneas de canasillas de retorno
    if (canasillasRetorno && canasillasRetorno.length > 0) {
      const lSheet = _getSheet('LineasCanasillasDevolucion');
      canasillasRetorno.forEach(c => {
        lSheet.appendRow([
          consecutivo,
          c.propietarioTipo || 'Empresa',
          c.propietarioID   || '',
          c.propietarioNombre || 'Empresa',
          parseInt(c.cantidad, 10) || 0,
        ]);
      });
    }

    // Actualizar estado de la entrada a 'Con devolución'
    _updateEntradaState(entradaRef, 'Con devolución');

    Log_write(userInfo, 'CREAR_DEVOLUCION', 'Devoluciones', consecutivo,
      `Dev ${consecutivo} sobre ${entradaRef}`, 'OK');

    return { ok: true, consecutivo, nuevoPesoLibre };

  } catch (err) {
    Logger.log('[Devoluciones_crear] ' + err.message);
    return { ok: false, error: err.message };
  }
}

/**
 * Listar devoluciones
 */
function Devoluciones_getList(payload, userInfo) {
  try {
    const { estado, entradaRef, desde, hasta, page = 1, size = 50 } = payload;
    let rows = _sheetToObjects(_getSheet('Devoluciones'));

    if (estado)    rows = rows.filter(r => r.Estado    === estado);
    if (entradaRef) rows = rows.filter(r => r.EntradaRef === entradaRef);
    if (desde)     rows = rows.filter(r => new Date(r.FechaHora) >= new Date(desde));
    if (hasta)     rows = rows.filter(r => new Date(r.FechaHora) <= new Date(hasta + 'T23:59:59'));

    rows.sort((a, b) => new Date(b.FechaHora) - new Date(a.FechaHora));
    return { ok: true, ..._paginate(rows, page, size) };

  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * Aprobar devolución (supervisor/admin)
 */
function Devoluciones_aprobar(id, userInfo) {
  try {
    _requirePermission(userInfo, 'devoluciones.aprobar');

    const sheet   = _getSheet('Devoluciones');
    const data    = sheet.getDataRange().getValues();
    const headers = data[0];
    const rows    = data.slice(1);

    const consIdx    = headers.indexOf('Consecutivo');
    const estadoIdx  = headers.indexOf('Estado');
    const pesoIdx    = headers.indexOf('PesoDevuelto');
    const entRefIdx  = headers.indexOf('EntradaRef');
    const aprobIdx   = headers.indexOf('AprobadoPor');
    const fechaApIdx = headers.indexOf('FechaAprobacion');
    const canasIdx   = headers.indexOf('CanasillasRetorno');

    const rowIdx = rows.findIndex(r => r[consIdx] === id);
    if (rowIdx === -1) return { ok: false, error: 'Devolución no encontrada.' };

    const row = rows[rowIdx];
    if (row[estadoIdx] !== 'Pendiente') {
      return { ok: false, error: `La devolución ya está en estado: ${row[estadoIdx]}` };
    }

    const sheetRow    = rowIdx + 2;
    const entradaRef  = row[entRefIdx];
    const pesoDevuelto = parseFloat(row[pesoIdx]);

    // Aprobar
    sheet.getRange(sheetRow, estadoIdx  + 1).setValue('Aprobada');
    sheet.getRange(sheetRow, aprobIdx   + 1).setValue(userInfo.name);
    sheet.getRange(sheetRow, fechaApIdx + 1).setValue(new Date());

    // Actualizar peso libre de la entrada original
    _ajustarPesoEntrada(entradaRef, pesoDevuelto, userInfo);

    // Retornar canasillas al stock
    try {
      const canasRetorno = JSON.parse(row[canasIdx] || '[]');
      canasRetorno.forEach(c => {
        _actualizarStock(
          c.propietarioTipo || 'Empresa',
          c.propietarioID   || '',
          c.propietarioNombre || 'Empresa',
          parseFloat(c.pesoUnitario || 0),
          -Math.abs(parseInt(c.cantidad, 10)), // NEGATIVO: sale del stock físico hacia el proveedor
          id, userInfo
        );
      });
    } catch(e) { /* no canasillas */ }

    Log_write(userInfo, 'APROBAR_DEVOLUCION', 'Devoluciones', id,
      `Dev ${id} aprobada`, 'OK');

    return { ok: true };

  } catch (err) {
    Logger.log('[Devoluciones_aprobar] ' + err.message);
    return { ok: false, error: err.message };
  }
}

/**
 * Rechazar devolución
 */
function Devoluciones_rechazar(payload, userInfo) {
  try {
    _requirePermission(userInfo, 'devoluciones.aprobar');
    const { id, motivo } = payload;

    const sheet   = _getSheet('Devoluciones');
    const data    = sheet.getDataRange().getValues();
    const headers = data[0];
    const rows    = data.slice(1);

    const rowIdx  = rows.findIndex(r => r[headers.indexOf('Consecutivo')] === id);
    if (rowIdx === -1) return { ok: false, error: 'No encontrada.' };

    const sheetRow = rowIdx + 2;
    sheet.getRange(sheetRow, headers.indexOf('Estado')        + 1).setValue('Rechazada');
    sheet.getRange(sheetRow, headers.indexOf('AprobadoPor')   + 1).setValue(userInfo.name);
    sheet.getRange(sheetRow, headers.indexOf('FechaAprobacion') + 1).setValue(new Date());
    if (motivo) {
      const cmtIdx = headers.indexOf('Comentarios');
      sheet.getRange(sheetRow, cmtIdx + 1).setValue(`RECHAZO: ${motivo}`);
    }

    // Revertir estado de la entrada a 'Activa' si no hay otras devoluciones pendientes
    const entradaRef = rows[rowIdx][headers.indexOf('EntradaRef')];
    const otrasPendientes = rows.filter(r =>
      r[headers.indexOf('EntradaRef')] === entradaRef &&
      r[headers.indexOf('Estado')] === 'Pendiente' &&
      r[headers.indexOf('Consecutivo')] !== id
    );
    if (otrasPendientes.length === 0) _updateEntradaState(entradaRef, 'Activa');

    Log_write(userInfo, 'RECHAZAR_DEVOLUCION', 'Devoluciones', id, `Dev ${id} rechazada`, 'OK');
    return { ok: true };

  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function _updateEntradaState(consecutivo, nuevoEstado) {
  const sheet   = _getSheet('Entradas');
  const data    = sheet.getDataRange().getValues();
  const headers = data[0];
  const rowIdx  = data.slice(1).findIndex(r => r[headers.indexOf('Consecutivo')] === consecutivo);
  if (rowIdx !== -1) {
    sheet.getRange(rowIdx + 2, headers.indexOf('Estado') + 1).setValue(nuevoEstado);
  }
}

function _ajustarPesoEntrada(consecutivo, pesoDevuelto, userInfo) {
  const sheet   = _getSheet('Entradas');
  const data    = sheet.getDataRange().getValues();
  const headers = data[0];
  const rows    = data.slice(1);
  const rowIdx  = rows.findIndex(r => r[headers.indexOf('Consecutivo')] === consecutivo);
  if (rowIdx === -1) return;

  const pesoLibreIdx = headers.indexOf('PesoLibre');
  const curr     = parseFloat(rows[rowIdx][pesoLibreIdx]) || 0;
  const newPeso  = Math.max(0, curr - pesoDevuelto);
  sheet.getRange(rowIdx + 2, pesoLibreIdx + 1).setValue(newPeso);
  sheet.getRange(rowIdx + 2, headers.indexOf('FechaModificacion') + 1).setValue(new Date());
}
