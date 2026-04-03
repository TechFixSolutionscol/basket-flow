// ===== BASKET FLOW — SETUP.GS =====
// Inicialización automática de la base de datos en Google Sheets
// Ejecutar manualmente la función setupDatabase() desde el editor de GAS
// DESPUÉS de publicar el Web App. Solo ejecutar UNA VEZ.

/**
 * Función principal de setup — Ejecutar manualmente en GAS Editor
 */
function setupDatabase() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  Logger.log('🚀 Iniciando setup de BasketFlow DB...');
  
  _setupSheet(ss, 'Usuarios', [
    'ID','Nombre','Email','PasswordHash','Rol','Activo',
    'UltimoAcceso','FechaCreacion','IntentosFallidos','BloqueadoHasta'
  ]);
  
  _setupSheet(ss, 'Sesiones', [
    'Token','UsuarioID','FechaCreacion','FechaExpiracion','KeepAlive','Activa'
  ]);
  
  _setupSheet(ss, 'Proveedores', [
    'ID','Nombre','Documento','Telefono','Email','Activo','FechaCreacion'
  ]);
  
  _setupSheet(ss, 'Clientes', [
    'ID','Nombre','Documento','Tipo','Contacto','Email','Activo','FechaCreacion'
  ]);
  
  _setupSheet(ss, 'Productos', [
    'ID','Nombre','UnidadMedida','Categoria','Activo','FechaCreacion'
  ]);
  
  _setupSheet(ss, 'TiposCanasilla', [
    'ID','Descripcion','PesoUnitario','Activo','FechaCreacion'
  ]);
  
  _setupSheet(ss, 'Entradas', [
    'Consecutivo','ProveedorID','ProveedorNombre',
    'ProductoID','ProductoNombre','ClienteID','ClienteNombre',
    'PesoBascula','PesoEstiba','PesoCanasillas','PesoLibre',
    'UsuarioID','UsuarioNombre','Estado','Comentarios',
    'FechaCreacion','FechaModificacion'
  ]);
  
  _setupSheet(ss, 'LineasCanasillasEntrada', [
    'EntradaID','TipoCanasillaID','PropietarioTipo','PropietarioID','PropietarioNombre', 'PesoUnitario', 'Cantidad'
  ]);
  
  _setupSheet(ss, 'Devoluciones', [
    'Consecutivo','EntradaRef','FechaHora','Motivo','MotivoTexto',
    'PesoDevuelto','CanasillasRetorno','UsuarioID','UsuarioNombre',
    'Estado','AprobadoPor','FechaAprobacion','Comentarios'
  ]);
  
  _setupSheet(ss, 'LineasCanasillasDevolucion', [
    'DevolucionID','TipoCanasillaID','PropietarioTipo','PropietarioID','PropietarioNombre','Cantidad'
  ]);
  
  _setupSheet(ss, 'StockCanasillas', [
    'PropietarioTipo', 'PropietarioID', 'PropietarioNombre',
    'TipoCanasillaID', 'StockActual', 'UltimaActualizacion'
  ]);
  
  _setupSheet(ss, 'MovimientosCanasillas', [
    'ID', 'FechaHora', 'Tipo', 'PropietarioTipo', 'PropietarioID', 'PropietarioNombre',
    'TipoCanasillaID', 'Cantidad', 'ReferenciaDoc', 'UsuarioID', 'UsuarioNombre', 'Notas'
  ]);
  
  _setupSheet(ss, 'LogActividad', [
    'ID','Timestamp','UsuarioID','UsuarioNombre','Rol',
    'Accion','Modulo','Referencia','Detalle','Resultado'
  ]);
  
  _setupSheet(ss, 'Configuracion', [
    'Clave','Valor','Descripcion','FechaModificacion'
  ]);
  
  _setupSheet(ss, 'MovimientosConsignacion', [
    'ID','Timestamp','Tipo','EntidadTipo','EntidadID','EntidadNombre',
    'TipoCanasillaID','TipoCanasillaNombre','Cantidad',
    'Referencia','Notas','UsuarioID','UsuarioNombre'
  ]);

  _setupSheet(ss, 'BajasCanasillas', [
    'ID','Timestamp','TipoCanasillaID','TipoCanasillaNombre','Cantidad','Motivo','Notas','UsuarioID','UsuarioNombre'
  ]);

  _setupSheet(ss, 'Estibas', [
    'ID','Nombre','Peso','Activo','FechaCreacion'
  ]);

  // Datos iniciales: Configuración
  _seedConfiguracion(ss);

  // Datos iniciales: Usuario admin
  _seedAdminUser(ss);

  // Datos iniciales: Tipos de canasilla comunes
  _seedTiposCanasilla(ss);

  // Datos iniciales: Estibas comunes
  _seedEstibas(ss);

  // Trigger diario de notificaciones Gmail
  setupTriggerNotificaciones();

  Logger.log('✅ Setup de BasketFlow DB completado exitosamente.');
  Logger.log('📧 Usuario admin creado: admin@basketflow.com / Basket2024!');
  Logger.log('⚠️  CAMBIA LA CONTRASEÑA DEL ADMIN INMEDIATAMENTE.');

}

// ── Helper: crear/limpiar hoja con headers ──────────────────────────────────
function _setupSheet(ss, nombre, headers) {
  let sheet = ss.getSheetByName(nombre);
  if (!sheet) {
    sheet = ss.insertSheet(nombre);
    Logger.log(`  ✓ Hoja creada: ${nombre}`);
  } else {
    Logger.log(`  ↩ Hoja ya existe: ${nombre}`);
  }
  
  // Sincronizar headers si son diferentes o la fila está vacía
  const existingHeaders = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  const needsUpdate = !existingHeaders[0] || JSON.stringify(existingHeaders) !== JSON.stringify(headers);

  if (needsUpdate) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 1, 1, headers.length)
      .setBackground('#0D1319')
      .setFontColor('#00D2B4')
      .setFontWeight('bold')
      .setFontFamily('Courier New')
      .setFontSize(9);
    sheet.setFrozenRows(1);
    sheet.autoResizeColumns(1, headers.length);
    Logger.log(`  ✓ Cabeceras actualizadas para: ${nombre}`);
  }
}

// ── Helper: semilla de configuración ───────────────────────────────────────
function _seedConfiguracion(ss) {
  const sheet = ss.getSheetByName('Configuracion');
  const data  = sheet.getDataRange().getValues();
  if (data.length > 1) return; // Ya tiene datos
  
  const configs = [
    ['empresa.diasAlertaCanasillas', '7',                'Días máximos antes de alerta para canasillas fuera',        new Date()],
    ['empresa.stockMinimo',          '50',               'Stock mínimo de canasillas propias de la empresa',           new Date()],
    ['empresa.nombre',               'Basket Flow',      'Nombre de la empresa para PDFs y correos',                   new Date()],
    ['empresa.turnoInicio',          '06:00',            'Hora de inicio del turno laboral',                           new Date()],
    ['empresa.turnoFin',             '22:00',            'Hora de fin del turno laboral',                              new Date()],
    // Consignación
    ['consig.diasAlerta',       '15',               'Días sin retorno para activar alerta de consignación',       new Date()],
    ['consig.umbralUnidades',   '5',                'Cantidad mínima de canasillas para generar alerta',          new Date()],
    ['consig.emailAdmin',       '',                 'Email del administrador para recibir alertas de consignación',new Date()],
    ['consig.emailCopia',       '',                 'Email en copia (CC) para alertas de consignación',           new Date()],
    // Datos de Empresa (Sprint 8)
    ['empresa.nombre',          'FRESQUERIA MYN S.A.S.', 'Nombre legal de la compañía',                      new Date()],
    ['empresa.nit',             '901420712',        'NIT / Identificación Tributaria',                        new Date()],
    ['empresa.direccion',       'CL 33 NO 41 66 BG 111', 'Dirección física principal',                        new Date()],
    ['empresa.ciudad',          'Itagüí / Antioquia', 'Ciudad y departamento',                                new Date()],
    ['empresa.pais',            'Colombia',         'País de operación',                                      new Date()],
    ['empresa.telefono',        '324 6468264',      'Teléfono fijo',                                          new Date()],
    ['empresa.movil',           '324 6468264',      'Teléfono móvil',                                         new Date()],
    ['empresa.email',           'contabilidad@fresqueria.com', 'Correo electrónico corporativo',             new Date()],
    ['empresa.web',             'https://lcmoon.com.co/', 'Sitio web corporativo',                       new Date()],
    ['empresa.moneda',          'COP',              'Moneda base del sistema',                                new Date()],
    ['empresa.logoId',          '',                 'ID de Google Drive del logo (transparente recomendado)', new Date()],
  ];

  
  configs.forEach(c => sheet.appendRow(c));
  Logger.log('  ✓ Configuración inicial insertada');
}

// ── Helper: semilla usuario admin ───────────────────────────────────────────
function _seedAdminUser(ss) {
  const sheet = ss.getSheetByName('Usuarios');
  const data  = sheet.getDataRange().getValues();
  if (data.length > 1) return; // Ya tiene usuarios
  
  // SHA-256 de 'Basket2024!' desde GAS
  const rawPw = 'Basket2024!';
  const bytes  = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    rawPw,
    Utilities.Charset.UTF_8
  );
  const hash = bytes.map(b => ('0' + (b & 0xFF).toString(16)).slice(-2)).join('');
  
  sheet.appendRow([
    'usr_admin_001',
    'Administrador',
    'admin@basketflow.com',
    hash,
    'admin',
    true,
    null,
    new Date(),
    0,
    null
  ]);
  
  Logger.log('  ✓ Usuario admin creado: admin@basketflow.com / Basket2024!');
}

// ── Helper: semilla tipos de canasilla ──────────────────────────────────────
function _seedTiposCanasilla(ss) {
  const sheet = ss.getSheetByName('TiposCanasilla');
  const data  = sheet.getDataRange().getValues();
  if (data.length > 1) return;
  
  const tipos = [
    ['can_001', 'Canasilla Pequeña',  0.5, true, new Date()],
    ['can_002', 'Canasilla Mediana',  1.0, true, new Date()],
    ['can_003', 'Canasilla Grande',   1.5, true, new Date()],
    ['can_004', 'Canasilla XL',       2.0, true, new Date()],
    ['can_005', 'Guacal Estándar',    2.5, true, new Date()],
  ];
  
  tipos.forEach(t => sheet.appendRow(t));
  Logger.log('  ✓ Tipos de canasilla insertados');
}

// ── Helper: semilla estibas ────────────────────────────────────────────────
function _seedEstibas(ss) {
  const sheet = ss.getSheetByName('Estibas');
  const data  = sheet.getDataRange().getValues();
  if (data.length > 1) return;
  
  const estibas = [
    ['est_001', 'Sin estiba',        0.0, true, new Date()],
    ['est_002', 'Estiba Pequeña',   0.5, true, new Date()],
    ['est_003', 'Estiba Mediana',   1.0, true, new Date()],
    ['est_004', 'Estiba Grande',    1.5, true, new Date()],
  ];
  
  estibas.forEach(e => sheet.appendRow(e));
  Logger.log('  ✓ Estibas insertadas');
}

/**
 * Generar consecutivo único con lock optimistic
 * prefix: 'BF' | 'DEV' | etc.
 */
function generateConsecutivo(prefix) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const props = PropertiesService.getScriptProperties();
    const key   = `consecutive_${prefix}_${new Date().getFullYear()}`;
    const curr  = parseInt(props.getProperty(key) || '0', 10);
    const next  = curr + 1;
    props.setProperty(key, String(next));
    const year  = new Date().getFullYear();
    return `${prefix}-${year}-${String(next).padStart(5, '0')}`;
  } finally {
    lock.releaseLock();
  }
}

/**
 * Fusiona los registros de stock de la empresa para corregir el desfase de IDs
 * Ejecutar esta función una sola vez desde el editor de GAS para limpiar el stock duplicado.
 */
function fix_fusionarStockEmpresa() {
  const sheet = _getSheet('StockCanasillas');
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const rows = data.slice(1);
  
  const keyTipo = headers.indexOf('PropietarioTipo');
  const keyId = headers.indexOf('PropietarioID');
  const keySt = headers.indexOf('StockActual');
  
  let totalStockVal = 0;
  let rowsToDelete = [];
  
  // 1. Recolectar todo el stock de 'Empresa'
  rows.forEach((r, i) => {
    if (r[keyTipo] === 'Empresa') {
      totalStockVal += (parseInt(r[keySt], 10) || 0);
      rowsToDelete.push(i + 2); // +2 por header (1-based index)
    }
  });
  
  if (rowsToDelete.length === 0) {
    Logger.log('No se encontraron registros de empresa para fusionar.');
    return 'No hay registros de empresa para fusionar.';
  }
  
  Logger.log('Fusionando ' + rowsToDelete.length + ' registros. Total stock: ' + totalStockVal);
  
  // 2. Eliminar filas viejas (de abajo hacia arriba para no alterar índices)
  rowsToDelete.sort((a,b) => b - a).forEach(idx => sheet.deleteRow(idx));
  
  // 3. Crear el registro único, limpio y correcto
  // Usamos 'can_003' por defecto (Grande) o el que sea dominante; 
  // Nota: en una implementación más compleja separaríamos por tipo de canasilla, 
  // pero para este caso de uso de demo unificaremos el stock principal.
  sheet.appendRow(['Empresa', 'BASKET_FLOW', 'Empresa', 'can_003', Math.max(0, totalStockVal), new Date()]);
  
  Logger.log('✓ Stock fusionado correctamente en BASKET_FLOW.');
  return 'Stock fusionado correctamente: ' + totalStockVal + ' unidades en BASKET_FLOW.';
}
