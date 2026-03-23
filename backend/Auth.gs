// ===== BASKET FLOW — AUTH.GS =====

var PERMISSIONS = {
  admin: [
    'entradas.crear','entradas.ver','entradas.editar','entradas.anular',
    'devoluciones.crear','devoluciones.aprobar',
    'canasillas.ver','canasillas.mover','canasillas.ajuste',
    'reportes.completo','reportes.exportar',
    'maestros.crud','usuarios.crud','log.ver'
  ],
  supervisor: [
    'entradas.crear','entradas.ver','entradas.editar','entradas.anular',
    'devoluciones.crear','devoluciones.aprobar',
    'canasillas.ver','canasillas.mover',
    'reportes.completo','reportes.exportar','log.ver'
  ],
  operador: [
    'entradas.crear','entradas.ver.propias','entradas.editar.propias',
    'devoluciones.crear',
    'canasillas.ver','canasillas.mover',
    'reportes.diario'
  ],
  readonly: ['entradas.ver','canasillas.ver']
};

/**
 * Login: valida email + hash de contraseña, genera token de sesión
 */
function Auth_login(payload) {
  try {
    const { email, passwordHash, keepAlive } = payload;
    if (!email || !passwordHash) return { ok: false, error: 'Email y contraseña requeridos.' };

    const sheet = _getSheet('Usuarios');
    const data  = sheet.getDataRange().getValues();
    const headers = data[0];
    const rows    = data.slice(1);

    // Buscar usuario por email
    const emailIdx    = headers.indexOf('Email');
    const hashIdx     = headers.indexOf('PasswordHash');
    const activoIdx   = headers.indexOf('Activo');
    const rolIdx      = headers.indexOf('Rol');
    const nombreIdx   = headers.indexOf('Nombre');
    const idIdx       = headers.indexOf('ID');
    const intentosIdx = headers.indexOf('IntentosFallidos');
    const bloqIdx     = headers.indexOf('BloqueadoHasta');

    const userRowIdx = rows.findIndex(r => String(r[emailIdx]).toLowerCase() === email.toLowerCase());
    if (userRowIdx === -1) return { ok: false, error: 'Credenciales inválidas.' };

    const userRow = rows[userRowIdx];
    const sheetRow = userRowIdx + 2; // +1 header +1 base-1

    // Rate limiting: check bloqueo
    const bloqUntil = userRow[bloqIdx];
    if (bloqUntil && new Date(bloqUntil) > new Date()) {
      const minRest = Math.ceil((new Date(bloqUntil) - new Date()) / 60000);
      return { ok: false, error: `Cuenta bloqueada por intentos fallidos. Intenta en ${minRest} minuto(s).` };
    }

    // Check activo
    if (!userRow[activoIdx]) {
      return { ok: false, error: 'Tu cuenta está desactivada. Contacta al administrador.' };
    }

    // Verificar contraseña
    if (userRow[hashIdx] !== passwordHash) {
      const intentos = (parseInt(userRow[intentosIdx], 10) || 0) + 1;
      sheet.getRange(sheetRow, intentosIdx + 1).setValue(intentos);
      if (intentos >= 5) {
        const bloqDate = new Date(Date.now() + 15 * 60 * 1000);
        sheet.getRange(sheetRow, bloqIdx + 1).setValue(bloqDate);
        sheet.getRange(sheetRow, intentosIdx + 1).setValue(0);
        return { ok: false, error: 'Demasiados intentos. Cuenta bloqueada por 15 minutos.' };
      }
      return { ok: false, error: `Credenciales inválidas. Intento ${intentos} de 5.` };
    }

    // Login OK — resetear intentos
    sheet.getRange(sheetRow, intentosIdx + 1).setValue(0);
    sheet.getRange(sheetRow, bloqIdx + 1).setValue('');
    // Actualizar último acceso
    const lastAccIdx = headers.indexOf('UltimoAcceso');
    sheet.getRange(sheetRow, lastAccIdx + 1).setValue(new Date());

    const userId = userRow[idIdx];
    const role   = userRow[rolIdx];

    // Generar token y guardar sesión
    const token = _generateToken(userId);
    const ttl   = keepAlive ? 30 * 24 * 3600 * 1000 : 8 * 3600 * 1000;
    const expDate = new Date(Date.now() + ttl);

    const sesionSheet = _getSheet('Sesiones');
    sesionSheet.appendRow([token, userId, new Date(), expDate, keepAlive, true]);

    // Log
    Log_write({ userId, name: userRow[nombreIdx], role }, 'LOGIN', 'Auth', userId, 'Login exitoso', 'OK');

    return {
      ok: true,
      token,
      userId,
      name:        userRow[nombreIdx],
      role,
      permissions: PERMISSIONS[role] || [],
    };

  } catch (err) {
    Logger.log('[Auth_login] ' + err.message);
    return { ok: false, error: 'Error al procesar el login. Intenta de nuevo.' };
  }
}

/**
 * Validar token en cada request
 * Retorna userInfo si válido, null si inválido/expirado
 */
function Auth_validateToken(token) {
  if (!token) return null;
  try {
    const sheet   = _getSheet('Sesiones');
    const data    = sheet.getDataRange().getValues();
    const headers = data[0];
    const rows    = data.slice(1);

    const tokenIdx  = headers.indexOf('Token');
    const userIdIdx = headers.indexOf('UsuarioID');
    const expIdx    = headers.indexOf('FechaExpiracion');
    const activaIdx = headers.indexOf('Activa');
    const keepIdx   = headers.indexOf('KeepAlive');

    const rowIdx = rows.findIndex(r => r[tokenIdx] === token);
    if (rowIdx === -1) return null;

    const row = rows[rowIdx];
    if (!row[activaIdx]) return null;
    if (new Date(row[expIdx]) < new Date()) return null;

    // Refresh token (sliding expiration)
    const keepAlive = row[keepIdx];
    const ttl       = keepAlive ? 30 * 24 * 3600 * 1000 : 8 * 3600 * 1000;
    const newExp    = new Date(Date.now() + ttl);
    sheet.getRange(rowIdx + 2, expIdx + 1).setValue(newExp);

    // Get user info
    const userId = row[userIdIdx];
    return _getUserInfoById(userId);

  } catch (err) {
    Logger.log('[Auth_validateToken] ' + err.message);
    return null;
  }
}

/**
 * Logout: desactivar sesión
 */
function Auth_logout(token) {
  if (!token) return { ok: true };
  try {
    const sheet   = _getSheet('Sesiones');
    const data    = sheet.getDataRange().getValues();
    const headers = data[0];
    const tokenIdx  = headers.indexOf('Token');
    const activaIdx = headers.indexOf('Activa');
    const rowIdx = data.slice(1).findIndex(r => r[tokenIdx] === token);
    if (rowIdx !== -1) {
      sheet.getRange(rowIdx + 2, activaIdx + 1).setValue(false);
    }
    return { ok: true };
  } catch(err) {
    return { ok: true }; // Logout siempre exitoso en el cliente
  }
}

// ── Get user info by ID ─────────────────────────────────────────────────────
function _getUserInfoById(userId) {
  const sheet   = _getSheet('Usuarios');
  const data    = sheet.getDataRange().getValues();
  const headers = data[0];
  const rows    = data.slice(1);

  const idIdx     = headers.indexOf('ID');
  const row = rows.find(r => r[idIdx] === userId);
  if (!row) return null;

  const role = row[headers.indexOf('Rol')];
  return {
    userId,
    name:        row[headers.indexOf('Nombre')],
    email:       row[headers.indexOf('Email')],
    role,
    permissions: PERMISSIONS[role] || [],
    activo:      row[headers.indexOf('Activo')],
  };
}

// ── Generate token ──────────────────────────────────────────────────────────
function _generateToken(userId) {
  const ts   = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 10);
  const raw  = `bf_${userId}_${ts}_${rand}`;
  const bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    raw,
    Utilities.Charset.UTF_8
  );
  const hash = bytes.map(b => ('0' + (b & 0xFF).toString(16)).slice(-2)).join('').slice(0, 16);
  return `bf_${hash}_${ts}`;
}
