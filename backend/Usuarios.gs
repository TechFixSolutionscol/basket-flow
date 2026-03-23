// ===== BASKET FLOW — USUARIOS.GS =====

function Usuarios_getList(userInfo) {
  try {
    _requirePermission(userInfo, 'usuarios.crud');
    const rows = _sheetToObjects(_getSheet('Usuarios')).map(u => ({
      ID: u.ID, Nombre: u.Nombre, Email: u.Email,
      Rol: u.Rol, Activo: u.Activo,
      UltimoAcceso: u.UltimoAcceso, FechaCreacion: u.FechaCreacion,
      // Nunca exponer hash
    }));
    return { ok: true, usuarios: rows };
  } catch (err) { return { ok: false, error: err.message }; }
}

function Usuarios_crear(payload, userInfo) {
  try {
    _requirePermission(userInfo, 'usuarios.crud');
    const { nombre, email, password, rol } = payload;
    if (!nombre || !email || !password || !rol) throw new Error('Todos los campos son obligatorios.');
    if (!['admin','supervisor','operador','readonly'].includes(rol)) throw new Error('Rol inválido.');

    // Verificar email único
    const existing = _sheetToObjects(_getSheet('Usuarios'));
    if (existing.find(u => u.Email?.toLowerCase() === email.toLowerCase())) {
      throw new Error('Ya existe un usuario con ese email.');
    }

    const hash = _sha256GAS(password);
    const id   = `usr_${Date.now().toString(36)}`;
    const sheet = _getSheet('Usuarios');
    sheet.appendRow([id, nombre, email.toLowerCase(), hash, rol, true, null, new Date(), 0, null]);

    Log_write(userInfo, 'CREAR_USUARIO', 'Usuarios', id, `Usuario ${email} creado`, 'OK');
    return { ok: true, id };
  } catch (err) { return { ok: false, error: err.message }; }
}

function Usuarios_editar(payload, userInfo) {
  try {
    _requirePermission(userInfo, 'usuarios.crud');
    const { id, nombre, rol } = payload;

    const sheet   = _getSheet('Usuarios');
    const data    = sheet.getDataRange().getValues();
    const headers = data[0];
    const rows    = data.slice(1);
    const rowIdx  = rows.findIndex(r => r[headers.indexOf('ID')] === id);
    if (rowIdx === -1) return { ok: false, error: 'Usuario no encontrado.' };

    const sheetRow = rowIdx + 2;
    if (nombre) sheet.getRange(sheetRow, headers.indexOf('Nombre') + 1).setValue(nombre);
    if (rol)    sheet.getRange(sheetRow, headers.indexOf('Rol')    + 1).setValue(rol);

    Log_write(userInfo, 'EDITAR_USUARIO', 'Usuarios', id, `Usuario ${id} editado`, 'OK');
    return { ok: true };
  } catch (err) { return { ok: false, error: err.message }; }
}

function Usuarios_resetPassword(userId, userInfo) {
  try {
    _requirePermission(userInfo, 'usuarios.crud');

    const sheet   = _getSheet('Usuarios');
    const data    = sheet.getDataRange().getValues();
    const headers = data[0];
    const rows    = data.slice(1);
    const rowIdx  = rows.findIndex(r => r[headers.indexOf('ID')] === userId);
    if (rowIdx === -1) return { ok: false, error: 'Usuario no encontrado.' };

    // Generar contraseña temporal
    const tempPw = 'BF_' + Math.random().toString(36).slice(2, 10).toUpperCase();
    const hash   = _sha256GAS(tempPw);
    sheet.getRange(rowIdx + 2, headers.indexOf('PasswordHash') + 1).setValue(hash);
    sheet.getRange(rowIdx + 2, headers.indexOf('IntentosFallidos') + 1).setValue(0);
    sheet.getRange(rowIdx + 2, headers.indexOf('BloqueadoHasta') + 1).setValue('');

    Log_write(userInfo, 'RESET_PASSWORD', 'Usuarios', userId, 'Contraseña reseteada', 'OK');
    // Mostrar UNA sola vez
    return { ok: true, tempPassword: tempPw, warning: 'Guarda esta contraseña, no se volverá a mostrar.' };
  } catch (err) { return { ok: false, error: err.message }; }
}

function Usuarios_toggleActivo(userId, userInfo) {
  try {
    _requirePermission(userInfo, 'usuarios.crud');
    if (userId === userInfo.userId) return { ok: false, error: 'No puedes desactivarte a ti mismo.' };

    const sheet   = _getSheet('Usuarios');
    const data    = sheet.getDataRange().getValues();
    const headers = data[0];
    const rows    = data.slice(1);
    const rowIdx  = rows.findIndex(r => r[headers.indexOf('ID')] === userId);
    if (rowIdx === -1) return { ok: false, error: 'Usuario no encontrado.' };

    const activoIdx = headers.indexOf('Activo');
    const curr      = rows[rowIdx][activoIdx];
    sheet.getRange(rowIdx + 2, activoIdx + 1).setValue(!curr);

    Log_write(userInfo, curr ? 'DESACTIVAR_USUARIO' : 'ACTIVAR_USUARIO',
      'Usuarios', userId, `Usuario ${userId} ${curr ? 'desactivado' : 'activado'}`, 'OK');
    return { ok: true, activo: !curr };
  } catch (err) { return { ok: false, error: err.message }; }
}

// ── SHA-256 en GAS ───────────────────────────────────────────────────────────
function _sha256GAS(str) {
  const bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256, str, Utilities.Charset.UTF_8
  );
  return bytes.map(b => ('0' + (b & 0xFF).toString(16)).slice(-2)).join('');
}
