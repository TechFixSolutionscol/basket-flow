// ===== BASKET FLOW — CONSIGNACION.GS =====
// Control de canasillas en consignación en poder de clientes
// Saldo = SUM(ENVIOS) - SUM(RETORNOS) por ClienteID + TipoCanasillaID

// ── Hoja: MovimientosConsignacion ────────────────────────────────────────────
// ID | Timestamp | Tipo | ClienteID | ClienteNombre | TipoCanasillaID
// TipoCanasillaNombre | Cantidad | Referencia | Notas | UsuarioID | UsuarioNombre

/**
 * Registrar un movimiento de consignación (ENVIO o RETORNO)
 * payload: { tipo, entidadTipo, entidadId, tipoCanasillaId, cantidad, referencia, notas }
 * entidadTipo: 'Cliente' | 'Proveedor'
 */
function Consignacion_registrarMovimiento(payload, userInfo) {
  try {
    _requirePermission(userInfo, 'operador');
    const { tipo, entidadTipo = 'Cliente', entidadId, tipoCanasillaId, cantidad, referencia, notas } = payload;

    // Validaciones
    if (!['ENVIO','RETORNO','AJUSTE'].includes(tipo)) throw new Error('Tipo de movimiento inválido.');
    if (!entidadId)   throw new Error('Entidad (ID) requerida.');
    if (!tipoCanasillaId) throw new Error('Tipo de canasilla requerido.');
    const qty = parseInt(cantidad);
    if (!qty || qty <= 0) throw new Error('Cantidad debe ser mayor a 0.');

    // Validar que al retornar no se devuelva más de lo prestado
    if (tipo === 'RETORNO') {
      const saldoActual = _getSaldoEntidadTipo(entidadTipo, entidadId, tipoCanasillaId);
      if (qty > saldoActual.saldo) {
        throw new Error(`No se pueden retornar ${qty} canasillas. Saldo actual de ${entidadTipo}: ${saldoActual.saldo}.`);
      }
    }

    // Obtener nombres desde maestros
    const maestroSheet = entidadTipo === 'Cliente' ? 'Clientes' : 'Proveedores';
    const entidades = _sheetToObjects(_getSheet(maestroSheet));
    const canasillas = _sheetToObjects(_getSheet('TiposCanasilla'));
    
    const entidad   = entidades.find(e => e.ID === entidadId);
    const canasilla = canasillas.find(c => c.ID === tipoCanasillaId);
    
    if (!entidad)   throw new Error(`${entidadTipo} no encontrado.`);
    if (!canasilla) throw new Error('Tipo de canasilla no encontrado.');

    const id = `con_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,5)}`;
    _getSheet('MovimientosConsignacion').appendRow([
      id,
      new Date(),
      tipo,
      entidadTipo,
      entidadId,
      entidad.Nombre,
      tipoCanasillaId,
      canasilla.Descripcion,
      qty,
      referencia || '',
      notas      || '',
      userInfo.userId,
      userInfo.name,
    ]);

    // Sincronizar con Stock Físico de la Empresa
    const deltaStock = (tipo === 'RETORNO') ? qty : -qty;
    _actualizarStock('Empresa', 'BASKET_FLOW', 'Empresa', tipoCanasillaId, deltaStock, id, userInfo);

    Log_write(userInfo, `CONSIGNACION_${tipo}`, 'Consignacion', id,
      `${tipo} ${qty} ${canasilla.Descripcion} → ${entidad.Nombre} (${entidadTipo})`, 'OK');

    return { ok: true, id, tipo, cantidad: qty, entidad: entidad.Nombre };

  } catch (err) {
    Logger.log('[Consignacion_registrarMovimiento] ' + err.message);
    return { ok: false, error: err.message };
  }
}

/**
 * Obtener inventario actual de UNA entidad (saldo por tipo de canasilla)
 * payload: { entidadId, entidadTipo }
 */
function Consignacion_getInventarioEntidad(payload, userInfo) {
  try {
    _requirePermission(userInfo, 'operador');
    const { entidadId, entidadTipo = 'Cliente' } = payload;
    if (!entidadId) throw new Error('entidadId requerido.');

    const movs = _sheetToObjects(_getSheet('MovimientosConsignacion'))
      .filter(m => m.EntidadID === entidadId && m.EntidadTipo === entidadTipo);

    // Agrupar por tipo
    const mapa = {};
    movs.forEach(m => {
      const k = m.TipoCanasillaID;
      if (!mapa[k]) mapa[k] = { tipoCanasillaId: k, tipo: m.TipoCanasillaNombre, enviadas: 0, retornadas: 0, ultimoMovimiento: null };
      if (m.Tipo === 'ENVIO')   mapa[k].enviadas   += Number(m.Cantidad);
      if (m.Tipo === 'RETORNO') mapa[k].retornadas += Number(m.Cantidad);
      if (m.Tipo === 'AJUSTE')  mapa[k].enviadas   -= Number(m.Cantidad); // ajuste reduce deuda
      const ts = new Date(m.Timestamp);
      if (!mapa[k].ultimoMovimiento || ts > new Date(mapa[k].ultimoMovimiento)) {
        mapa[k].ultimoMovimiento = m.Timestamp;
      }
    });

    const saldos = Object.values(mapa).map(r => ({
      ...r,
      saldo: r.enviadas - r.retornadas,
      diasSinRetorno: _diasDesde(r.ultimoMovimiento),
    })).filter(r => r.saldo > 0);

    // Info entidad
    const maestroSheet = entidadTipo === 'Cliente' ? 'Clientes' : 'Proveedores';
    const entidades = _sheetToObjects(_getSheet(maestroSheet));
    const entidad   = entidades.find(e => e.ID === entidadId);

    return { ok: true, entidad: entidad?.Nombre || entidadId, entidadId, entidadTipo, saldos };

  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * Resumen general: todos los clientes con saldo > 0
 */
function Consignacion_getResumenGeneral(userInfo) {
  try {
    _requirePermission(userInfo, 'operador');
    const movs  = _sheetToObjects(_getSheet('MovimientosConsignacion'));
    const config = _getConfigMap();
    const diasAlerta   = parseInt(config['consig.diasAlerta'] || config['dias_alerta_canasillas'] || '15');
    const umbralUnidades = parseInt(config['consig.umbralUnidades'] || '0');

    // Agrupar por entidad + tipo
    const mapa = {};
    movs.forEach(m => {
      const k = `${m.EntidadID}||${m.TipoCanasillaID}`;
      if (!mapa[k]) mapa[k] = {
        entidadId: m.EntidadID, entidadNombre: m.EntidadNombre, entidadTipo: m.EntidadTipo,
        tipoCanasillaId: m.TipoCanasillaID, tipo: m.TipoCanasillaNombre,
        enviadas: 0, retornadas: 0, ultimoEnvio: null, ultimoRetorno: null,
      };
      if (m.Tipo === 'ENVIO')   { mapa[k].enviadas   += Number(m.Cantidad); mapa[k].ultimoEnvio   = m.Timestamp; }
      if (m.Tipo === 'RETORNO') { mapa[k].retornadas += Number(m.Cantidad); mapa[k].ultimoRetorno = m.Timestamp; }
      if (m.Tipo === 'AJUSTE')  { mapa[k].enviadas   -= Number(m.Cantidad); }
    });

    const resumen = Object.values(mapa)
      .map(r => {
        const saldo = r.enviadas - r.retornadas;
        const diasSinRetorno = r.ultimoRetorno
          ? _diasDesde(r.ultimoRetorno)
          : (r.ultimoEnvio ? _diasDesde(r.ultimoEnvio) : 0);
        const alerta = saldo > umbralUnidades && diasSinRetorno >= diasAlerta;
        return { ...r, saldo, diasSinRetorno, alerta };
      })
      .filter(r => r.saldo > 0)
      .sort((a, b) => b.diasSinRetorno - a.diasSinRetorno);

    return { ok: true, resumen, diasAlerta, umbralUnidades };

  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * Historial de movimientos de consignación filtrable
 * payload: { clienteId?, desde?, hasta?, tipo?, page, size }
 */
function Consignacion_getHistorial(payload, userInfo) {
  try {
    _requirePermission(userInfo, 'operador');
    const { entidadId, entidadTipo, desde, hasta, tipo, page = 1, size = 50 } = payload;
    let movs = _sheetToObjects(_getSheet('MovimientosConsignacion'));

    if (entidadId)   movs = movs.filter(m => m.EntidadID === entidadId);
    if (entidadTipo) movs = movs.filter(m => m.EntidadTipo === entidadTipo);
    if (tipo)        movs = movs.filter(m => m.Tipo === tipo);
    if (desde)     movs = movs.filter(m => new Date(m.Timestamp) >= new Date(desde));
    if (hasta)     movs = movs.filter(m => new Date(m.Timestamp) <= new Date(hasta + 'T23:59:59'));

    movs.sort((a, b) => new Date(b.Timestamp) - new Date(a.Timestamp));
    return { ok: true, ..._paginate(movs, page, size) };

  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * Ajuste manual (solo supervisor) — corrige saldo sin generar movimiento normal
 * payload: { clienteId, tipoCanasillaId, cantidad, notas }
 */
function Consignacion_ajusteManual(payload, userInfo) {
  try {
    _requirePermission(userInfo, 'supervisor');
    payload.tipo = 'AJUSTE';
    return Consignacion_registrarMovimiento(payload, userInfo);
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// ── Helpers internos ─────────────────────────────────────────────────────────

function _getSaldoEntidadTipo(entidadTipo, entidadId, tipoCanasillaId) {
  const movs = _sheetToObjects(_getSheet('MovimientosConsignacion'))
    .filter(m => m.EntidadID === entidadId && m.EntidadTipo === entidadTipo && m.TipoCanasillaID === tipoCanasillaId);
  let enviadas = 0, retornadas = 0;
  movs.forEach(m => {
    if (m.Tipo === 'ENVIO')   enviadas   += Number(m.Cantidad);
    if (m.Tipo === 'RETORNO') retornadas += Number(m.Cantidad);
    if (m.Tipo === 'AJUSTE')  enviadas   -= Number(m.Cantidad);
  });
  return { saldo: enviadas - retornadas, enviadas, retornadas };
}

function _diasDesde(fecha) {
  if (!fecha) return 0;
  const ms = Date.now() - new Date(fecha).getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

function _getConfigMap() {
  try {
    const rows = _sheetToObjects(_getSheet('Configuracion'));
    const map  = {};
    rows.forEach(r => { map[r.Clave] = r.Valor; });
    return map;
  } catch (e) { return {}; }
}
