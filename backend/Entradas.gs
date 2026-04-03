// ===== BASKET FLOW — ENTRADAS.GS =====

/**
 * Crear nueva entrada de mercancía
 */
function Entradas_crear(payload, userInfo) {
  try {
    _requirePermission(userInfo, 'entradas.crear');

    const { proveedorID, proveedorNombre, productoID, productoNombre,
            clienteID, clienteNombre, pesoBascula, pesoEstiba,
            canasillas, referencia, comentarios } = payload;

    // Validaciones básicas
    if (!proveedorID) throw new Error('Proveedor es obligatorio.');
    if (!productoID)  throw new Error('Producto es obligatorio.');
    if (!pesoBascula || parseFloat(pesoBascula) <= 0) throw new Error('Peso báscula debe ser mayor a cero.');

    // Calcular peso de canasillas
    let pesoCanasillasTotal = 0;
    const lineasCanasillas  = canasillas || [];
    lineasCanasillas.forEach(c => {
      const subtotal = parseFloat(c.pesoUnitario || 0) * parseInt(c.cantidad || 0, 10);
      c.subtotal     = subtotal;
      pesoCanasillasTotal += subtotal;
    });

    const pesoLibre = parseFloat(pesoBascula) - parseFloat(pesoEstiba || 0) - pesoCanasillasTotal;
    if (pesoLibre < 0) throw new Error('El peso libre no puede ser negativo. Revisa los datos ingresados.');

    // Generar consecutivo
    const consecutivo = generateConsecutivo('BF');
    const ahora       = new Date();

    // Guardar en hoja Entradas
    const sheet = _getSheet('Entradas');
    sheet.appendRow([
      consecutivo,
      proveedorID, proveedorNombre,
      productoID,  productoNombre,
      clienteID || '', clienteNombre || 'Sin cliente',
      parseFloat(pesoBascula),
      parseFloat(pesoEstiba || 0),
      pesoCanasillasTotal,
      pesoLibre,
      userInfo.userId, userInfo.name,
      'Activa',
      comentarios || '',
      ahora, ahora // FechaCreacion, FechaModificacion
    ]);

    // Guardar líneas de canasillas
    const lSheet = _getSheet('LineasCanasillasEntrada');
    lineasCanasillas.filter(c => parseInt(c.cantidad, 10) > 0).forEach(c => {
      lSheet.appendRow([
        consecutivo,
        c.tipoCanasillaID || '',
        c.propietarioTipo || 'Empresa',
        c.propietarioID   || '',
        c.propietarioNombre || 'Empresa',
        parseFloat(c.pesoUnitario || 0),
        parseInt(c.cantidad, 10),
      ]);

      // 1. Actualizar stock físico de canasillas (Incremento en bodega)
      // Nota: delta positivo porque están entrando físicamente a la empresa
      _actualizarStock(
        c.propietarioTipo || 'Empresa',
        c.propietarioID   || 'BASKET_FLOW',
        c.propietarioNombre || 'Empresa',
        c.tipoCanasillaID || 'OTRO',
        parseInt(c.cantidad, 10), 
        consecutivo, userInfo
      );

      // 2. Liquidación Automática de Deuda de Consignación
      // Si las canasillas son de la Empresa y el proveedor tiene deuda, se liquida.
      if ((c.propietarioTipo === 'Empresa' || !c.propietarioTipo) && proveedorID && c.tipoCanasillaID) {
        try {
          const saldoPrevio = _getSaldoEntidadTipo('Proveedor', proveedorID, c.tipoCanasillaID);
          if (saldoPrevio.saldo > 0) {
            const aLiquidar = Math.min(saldoPrevio.saldo, parseInt(c.cantidad, 10));
            if (aLiquidar > 0) {
              Consignacion_registrarMovimiento({
                tipo: 'RETORNO',
                entidadTipo: 'Proveedor',
                entidadId: proveedorID,
                tipoCanasillaId: c.tipoCanasillaID,
                cantidad: aLiquidar,
                referencia: `AUTO-ENTRADA-${consecutivo}`,
                notas: 'Liquidación automática al recibir canastas de empresa con mercancía.'
              }, userInfo);
            }
          }
        } catch(e) {
          Logger.log('Error en liquidación automática: ' + e.message);
        }
      }
    });

    // Log
    Log_write(userInfo, 'CREAR_ENTRADA', 'Entradas', consecutivo,
      `Entrada ${consecutivo}: ${pesoLibre.toFixed(1)} kg netos`, 'OK');

    return { ok: true, consecutivo, pesoLibre };

  } catch (err) {
    Logger.log('[Entradas_crear] ' + err.message);
    Log_write(userInfo, 'CREAR_ENTRADA', 'Entradas', null, err.message, 'ERROR');
    return { ok: false, error: err.message };
  }
}

/**
 * Listar entradas con filtros y paginación
 */
function Entradas_getList(payload, userInfo) {
  try {
    const { busqueda, proveedor, producto, cliente, estado,
            desde, hasta, page = 1, size = 50 } = payload;

    const sheet = _getSheet('Entradas');
    let rows    = _sheetToObjects(sheet);

    // Filtro por rol: operador solo ve sus propias entradas
    if (userInfo.role === 'operador') {
      rows = rows.filter(r => r.UsuarioID === userInfo.userId);
    }

    // Filtros
    if (busqueda) {
      const q = busqueda.toLowerCase();
      rows = rows.filter(r =>
        String(r.Consecutivo).toLowerCase().includes(q) ||
        String(r.ProveedorNombre).toLowerCase().includes(q) ||
        String(r.ProductoNombre).toLowerCase().includes(q) ||
        String(r.ClienteNombre).toLowerCase().includes(q)
      );
    }
    if (proveedor) rows = rows.filter(r => r.ProveedorID === proveedor);
    if (producto)  rows = rows.filter(r => r.ProductoID  === producto);
    if (cliente)   rows = rows.filter(r => r.ClienteID   === cliente);
    if (estado)    rows = rows.filter(r => r.Estado       === estado);
    if (desde)     rows = rows.filter(r => new Date(r.FechaCreacion) >= new Date(desde));
    if (hasta)     rows = rows.filter(r => new Date(r.FechaCreacion) <= new Date(hasta + 'T23:59:59'));

    // Ordenar más reciente primero
    rows.sort((a, b) => new Date(b.FechaCreacion) - new Date(a.FechaCreacion));

    return { ok: true, ..._paginate(rows, page, size) };

  } catch (err) {
    Logger.log('[Entradas_getList] ' + err.message);
    return { ok: false, error: err.message };
  }
}

/**
 * Obtener una entrada con sus líneas de canasillas
 */
function Entradas_getOne(id, userInfo) {
  try {
    const sheet  = _getSheet('Entradas');
    const rows   = _sheetToObjects(sheet);
    const entrada = rows.find(r => r.Consecutivo === id);
    if (!entrada) return { ok: false, error: 'Entrada no encontrada.' };

    // Líneas de canasillas
    const lSheet = _getSheet('LineasCanasillasEntrada');
    const lineas  = _sheetToObjects(lSheet).filter(l => l.EntradaID === id);

    return { ok: true, entrada: { ...entrada, canasillas: lineas } };

  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * Editar entrada (solo mismo día, mismo usuario o supervisor+)
 */
function Entradas_editar(payload, userInfo) {
  try {
    const { id } = payload;
    const sheet   = _getSheet('Entradas');
    const data    = sheet.getDataRange().getValues();
    const headers = data[0];
    const rows    = data.slice(1);

    const rowIdx = rows.findIndex(r => r[headers.indexOf('Consecutivo')] === id);
    if (rowIdx === -1) return { ok: false, error: 'Entrada no encontrada.' };

    const row      = rows[rowIdx];
    const fechaHK  = new Date(row[headers.indexOf('FechaCreacion')]);
    const today     = new Date();
    const mismodia  = fechaHK.toDateString() === today.toDateString();
    const mismoUser = row[headers.indexOf('UsuarioID')] === userInfo.userId;

    if (!mismodia)  return { ok: false, error: 'Solo puedes editar entradas del día actual.' };
    if (!mismoUser && userInfo.role === 'operador') {
      return { ok: false, error: 'Solo puedes editar tus propias entradas.' };
    }
    if (row[headers.indexOf('Estado')] === 'Anulada') {
      return { ok: false, error: 'No se puede editar una entrada anulada.' };
    }

    // Actualizar campos permitidos
    const comentariosIdx = headers.indexOf('Comentarios');
    const modifIdx       = headers.indexOf('FechaModificacion');
    sheet.getRange(rowIdx + 2, comentariosIdx + 1).setValue(payload.comentarios || '');
    sheet.getRange(rowIdx + 2, modifIdx + 1).setValue(new Date());

    Log_write(userInfo, 'EDITAR_ENTRADA', 'Entradas', id, `Entrada ${id} editada`, 'OK');
    return { ok: true };

  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * Anular entrada (supervisor/admin)
 */
function Entradas_anular(id, userInfo) {
  try {
    _requirePermission(userInfo, 'entradas.anular');
    const sheet   = _getSheet('Entradas');
    const data    = sheet.getDataRange().getValues();
    const headers = data[0];
    const rows    = data.slice(1);
    const rowIdx  = rows.findIndex(r => r[headers.indexOf('Consecutivo')] === id);
    if (rowIdx === -1) return { ok: false, error: 'Entrada no encontrada.' };

    const estadoIdx = headers.indexOf('Estado');
    if (rows[rowIdx][estadoIdx] === 'Anulada') return { ok: false, error: 'Ya está anulada.' };

    sheet.getRange(rowIdx + 2, estadoIdx + 1).setValue('Anulada');
    sheet.getRange(rowIdx + 2, headers.indexOf('FechaModificacion') + 1).setValue(new Date());

    Log_write(userInfo, 'ANULAR_ENTRADA', 'Entradas', id, `Entrada ${id} anulada`, 'OK');
    return { ok: true };

  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// ── Actualizar stock de canasillas (por Tipo y Propietario) ──────────────────
function _actualizarStock(propTipo, propId, propNombre, tipoCanId, delta, refDoc, userInfo) {
  const sheet   = _getSheet('StockCanasillas');
  const data    = sheet.getDataRange().getValues();
  const headers = data[0];
  const rows    = data.slice(1);

  const keyTipo   = headers.indexOf('PropietarioTipo');
  const keyId     = headers.indexOf('PropietarioID');
  const keyTipoId = headers.indexOf('TipoCanasillaID');
  const keySt     = headers.indexOf('StockActual');
  const keyDate   = headers.indexOf('UltimaActualizacion');

  // Estandarizar ID de la empresa para evitar desincronización
  if (propTipo === 'Empresa') {
    propId = 'BASKET_FLOW';
    propNombre = 'Empresa';
  }

  const rowIdx = rows.findIndex(r =>
    r[keyTipo] === propTipo && r[keyId] === propId && r[keyTipoId] === tipoCanId
  );

  if (rowIdx === -1) {
    sheet.appendRow([propTipo, propId, propNombre, tipoCanId, Math.max(0, delta), new Date()]);
  } else {
    const curr   = parseInt(rows[rowIdx][keySt], 10) || 0;
    const newVal = Math.max(0, curr + delta);
    sheet.getRange(rowIdx + 2, keySt   + 1).setValue(newVal);
    sheet.getRange(rowIdx + 2, keyDate + 1).setValue(new Date());
  }

  // Registrar movimiento
  const mSheet = _getSheet('MovimientosCanasillas');
  const tipo   = delta > 0 ? 'Retorno' : 'Salida';
  mSheet.appendRow([
    `mov_${Date.now()}`,
    new Date(), tipo,
    propTipo, propId, propNombre,
    tipoCanId, Math.abs(delta),
    refDoc,
    userInfo.userId, userInfo.name,
    ''
  ]);
}

/**
 * Obtener resumen de canasillas agrupado por tipo para un conjunto de filtros
 * (Se usa para la vista consolidada)
 */
function Entradas_getResumenCanastas(payload, userInfo) {
  try {
    const { proveedor, producto, desde, hasta } = payload;
    const eSheet = _getSheet('Entradas');
    const lSheet = _getSheet('LineasCanasillasEntrada');
    
    let entries = _sheetToObjects(eSheet).filter(e => e.Estado !== 'Anulada');
    if (proveedor) entries = entries.filter(e => e.ProveedorID === proveedor);
    if (producto)  entries = entries.filter(e => e.ProductoID === producto);
    if (desde)     entries = entries.filter(e => new Date(e.FechaCreacion) >= new Date(desde));
    if (hasta)     entries = entries.filter(e => new Date(e.FechaCreacion) <= new Date(hasta + 'T23:59:59'));
    
    const validIds = entries.map(e => e.Consecutivo);
    const lineas   = _sheetToObjects(lSheet).filter(l => validIds.includes(l.EntradaID));
    
    const resumen = {};
    lineas.forEach(l => {
      const key = l.TipoCanasillaID || 'OTRO';
      if (!resumen[key]) {
        resumen[key] = { nombre: l.TipoCanasillaID ? _getTipoNombre(l.TipoCanasillaID) : 'Otras', cantidad: 0 };
      }
      resumen[key].cantidad += parseInt(l.Cantidad || 0, 10);
    });
    
    return { ok: true, resumen };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

function _getTipoNombre(id) {
  try {
    const tipos = _sheetToObjects(_getSheet('TiposCanasilla'));
    const t = tipos.find(x => x.ID === id);
    return t ? t.Descripcion : id;
  } catch(e) { return id; }
}
