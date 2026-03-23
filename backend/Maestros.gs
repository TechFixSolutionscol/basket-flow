// ===== BASKET FLOW — MAESTROS.GS =====

/**
 * Obtener todos los maestros (para cache en frontend)
 */
function Maestros_getAll(userInfo) {
  try {
    const proveedores  = _sheetToObjects(_getSheet('Proveedores')).filter(r => r.Activo);
    const clientes     = _sheetToObjects(_getSheet('Clientes')).filter(r => r.Activo);
    const productos    = _sheetToObjects(_getSheet('Productos')).filter(r => r.Activo);
    const canasillas   = _sheetToObjects(_getSheet('TiposCanasilla')).filter(r => r.Activo);
    const config       = _sheetToObjects(_getSheet('Configuracion'));
    return { ok: true, proveedores, clientes, productos, canasillas, config };
  } catch (err) {
    Logger.log('[Maestros_getAll] ' + err.message);
    return { ok: false, error: err.message };
  }
}

/**
 * Guardar (crear o actualizar) un maestro
 * payload: { tipo, data } — tipo: 'Proveedores'|'Clientes'|'Productos'|'TiposCanasilla'
 */
function Maestros_save(payload, userInfo) {
  try {
    _requirePermission(userInfo, 'maestros.crud');
    const { tipo, data } = payload;
    const allowed = ['Proveedores','Clientes','Productos','TiposCanasilla'];
    if (!allowed.includes(tipo)) throw new Error(`Tipo de maestro inválido: ${tipo}`);

    const sheet   = _getSheet(tipo);
    const allData = sheet.getDataRange().getValues();
    const headers = allData[0];
    const rows    = allData.slice(1);

    const id = data.ID;
    if (id) {
      // Actualizar
      const idIdx  = headers.indexOf('ID');
      const rowIdx = rows.findIndex(r => r[idIdx] === id);
      if (rowIdx !== -1) {
        headers.forEach((h, i) => {
          if (h !== 'ID' && h !== 'FechaCreacion' && data[h] !== undefined) {
            sheet.getRange(rowIdx + 2, i + 1).setValue(data[h]);
          }
        });
        Log_write(userInfo, 'EDITAR_MAESTRO', 'Maestros', `${tipo}/${id}`, `Editado ${tipo}`, 'OK');
        return { ok: true, action: 'updated' };
      }
    }

    // Crear
    const newId = `${tipo.slice(0,3).toLowerCase()}_${Date.now().toString(36)}`;
    const row   = headers.map(h => {
      if (h === 'ID')            return newId;
      if (h === 'Activo')        return true;
      if (h === 'FechaCreacion') return new Date();
      return data[h] || '';
    });
    sheet.appendRow(row);
    Log_write(userInfo, 'CREAR_MAESTRO', 'Maestros', `${tipo}/${newId}`, `Creado ${tipo}`, 'OK');
    return { ok: true, id: newId, action: 'created' };

  } catch (err) {
    Logger.log('[Maestros_save] ' + err.message);
    return { ok: false, error: err.message };
  }
}

/**
 * Activar o desactivar un maestro (soft delete)
 */
function Maestros_toggleActivo(payload, userInfo) {
  try {
    _requirePermission(userInfo, 'maestros.crud');
    const { tipo, id, activo } = payload;

    const sheet   = _getSheet(tipo);
    const data    = sheet.getDataRange().getValues();
    const headers = data[0];
    const rows    = data.slice(1);

    const idIdx     = headers.indexOf('ID');
    const activoIdx = headers.indexOf('Activo');
    const rowIdx    = rows.findIndex(r => r[idIdx] === id);
    if (rowIdx === -1) return { ok: false, error: 'Registro no encontrado.' };

    sheet.getRange(rowIdx + 2, activoIdx + 1).setValue(!!activo);
    Log_write(userInfo, activo ? 'ACTIVAR_MAESTRO' : 'DESACTIVAR_MAESTRO',
      'Maestros', `${tipo}/${id}`, `Toggle activo: ${activo}`, 'OK');
    return { ok: true };

  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * Obtener configuración general
 */
function Maestros_getConfig(userInfo) {
  try {
    const rows = _sheetToObjects(_getSheet('Configuracion'));
    const config = {};
    rows.forEach(r => { config[r.Clave] = r.Valor; });
    return { ok: true, config };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * Guardar configuración (solo admin)
 */
function Maestros_saveConfig(payload, userInfo) {
  try {
    _requirePermission(userInfo, 'maestros.crud');
    const sheet   = _getSheet('Configuracion');
    const data    = sheet.getDataRange().getValues();
    const headers = data[0];
    const rows    = data.slice(1);

    Object.entries(payload).forEach(([clave, valor]) => {
      const rowIdx = rows.findIndex(r => r[headers.indexOf('Clave')] === clave);
      if (rowIdx !== -1) {
        sheet.getRange(rowIdx + 2, headers.indexOf('Valor') + 1).setValue(valor);
        sheet.getRange(rowIdx + 2, headers.indexOf('FechaModificacion') + 1).setValue(new Date());
      } else {
        sheet.appendRow([clave, valor, '', new Date()]);
      }
    });

    Log_write(userInfo, 'EDITAR_CONFIG', 'Maestros', 'Configuracion', 'Config actualizada', 'OK');
    return { ok: true };

  } catch (err) {
    return { ok: false, error: err.message };
  }
}
