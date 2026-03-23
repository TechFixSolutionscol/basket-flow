// ===== BASKET FLOW — NOTIFICACIONES.GS =====
// Alertas automáticas por Gmail usando GmailApp.sendEmail()
// Referencia: https://developers.google.com/apps-script/reference/gmail/gmail-app

/**
 * Alerta automática de canasillas en consignación vencida
 * ────────────────────────────────────────────────────────
 * Esta función se conecta a un TRIGGER DIARIO (8:00 am).
 * Para crear el trigger ejecutar: setupTriggerNotificaciones()
 *
 * Lógica:
 *  1. Lee configuración (diasAlerta, emailAdmin, umbralUnidades)
 *  2. Calcula saldos vencidos desde MovimientosConsignacion
 *  3. Si hay alertas → envía email HTML con tabla resumen
 *  4. Registra en Log
 */
function Notificaciones_alertaCanasillas() {
  try {
    const config         = _getConfigMap();
    const emailAdmin     = config['consig.emailAdmin']     || '';
    const emailCopia     = config['consig.emailCopia']     || '';
    const diasAlerta     = parseInt(config['consig.diasAlerta']     || config['dias_alerta_canasillas'] || '15');
    const umbralUnidades = parseInt(config['consig.umbralUnidades'] || '0');
    const nombreEmpresa  = config['nombre_empresa'] || 'Basket Flow';

    if (!emailAdmin) {
      Logger.log('[Notificaciones] No hay email configurado (consig.emailAdmin). Saltando alerta.');
      return;
    }

    // Obtener resumen de consignación
    const movs = _sheetToObjects(_getSheet('MovimientosConsignacion'));
    const mapa = {};

    movs.forEach(m => {
      const k = `${m.ClienteID}||${m.TipoCanasillaID}`;
      if (!mapa[k]) mapa[k] = {
        clienteNombre: m.ClienteNombre,
        tipo: m.TipoCanasillaNombre,
        enviadas: 0, retornadas: 0,
        ultimoEnvio: null, ultimoRetorno: null,
      };
      if (m.Tipo === 'ENVIO')   { mapa[k].enviadas   += Number(m.Cantidad); mapa[k].ultimoEnvio   = m.Timestamp; }
      if (m.Tipo === 'RETORNO') { mapa[k].retornadas += Number(m.Cantidad); mapa[k].ultimoRetorno = m.Timestamp; }
      if (m.Tipo === 'AJUSTE')  { mapa[k].enviadas   -= Number(m.Cantidad); }
    });

    // Filtrar alertas: saldo > umbral Y días sin retorno >= diasAlerta
    const alertas = Object.values(mapa)
      .map(r => {
        const saldo = r.enviadas - r.retornadas;
        const ultimaActividad = r.ultimoRetorno || r.ultimoEnvio;
        const dias = ultimaActividad
          ? Math.floor((Date.now() - new Date(ultimaActividad).getTime()) / 86400000)
          : 0;
        return { ...r, saldo, dias };
      })
      .filter(r => r.saldo > umbralUnidades && r.dias >= diasAlerta)
      .sort((a, b) => b.dias - a.dias);

    if (alertas.length === 0) {
      Logger.log(`[Notificaciones] Sin alertas de consignación (umbral: ${diasAlerta} días, ${umbralUnidades} unidades).`);
      return;
    }

    // Construir email HTML
    const html = _buildEmailHtml(alertas, diasAlerta, nombreEmpresa);
    const asunto = `⚠️ ${nombreEmpresa} — ${alertas.length} alerta${alertas.length > 1 ? 's' : ''} de canasillas en consignación`;

    const opciones = { htmlBody: html };
    if (emailCopia) opciones.cc = emailCopia;

    GmailApp.sendEmail(emailAdmin, asunto, '', opciones);

    Logger.log(`[Notificaciones] Alerta enviada a ${emailAdmin}. ${alertas.length} registros con alerta.`);

    // Log en sistema
    Log_write(
      { userId: 'system', name: 'Sistema', role: 'admin' },
      'ALERTA_CONSIGNACION',
      'Notificaciones',
      'email',
      `Alerta enviada a ${emailAdmin} — ${alertas.length} clientes con canasillas vencidas`,
      'OK'
    );

  } catch (err) {
    Logger.log('[Notificaciones_alertaCanasillas ERROR] ' + err.message + '\n' + err.stack);
    // Intentar notificar el error también
    try {
      const config     = _getConfigMap();
      const emailAdmin = config['consig.emailAdmin'] || '';
      if (emailAdmin) {
        GmailApp.sendEmail(emailAdmin,
          '❌ Basket Flow — Error en alerta automática de canasillas',
          `Ocurrió un error al generar la alerta:\n\n${err.message}\n\nRevisa el Log de GAS para más detalles.`
        );
      }
    } catch (e2) { /* silencioso */ }
  }
}

/**
 * Disparo manual de alerta desde la UI (supervisores/admin)
 * Devuelve { ok, enviado, alertas, email }
 */
function Notificaciones_alertaManual(userInfo) {
  try {
    _requirePermission(userInfo, 'supervisor');
    Notificaciones_alertaCanasillas();
    const config = _getConfigMap();
    return { ok: true, enviado: true, email: config['consig.emailAdmin'] || '' };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// ── Trigger setup ─────────────────────────────────────────────────────────────

/**
 * Crear trigger diario de alertas (ejecutar UNA vez desde el editor de GAS)
 * También se llama desde setupDatabase() automáticamente
 */
function setupTriggerNotificaciones() {
  // Eliminar triggers existentes del mismo nombre para evitar duplicados
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === 'Notificaciones_alertaCanasillas') {
      ScriptApp.deleteTrigger(t);
      Logger.log('  ↩ Trigger previo eliminado.');
    }
  });

  ScriptApp.newTrigger('Notificaciones_alertaCanasillas')
    .timeBased()
    .everyDays(1)
    .atHour(8)
    .create();

  Logger.log('  ✓ Trigger diario creado: Notificaciones_alertaCanasillas @ 8:00 am');
}

// ── Builder de email HTML ─────────────────────────────────────────────────────

function _buildEmailHtml(alertas, diasAlerta, nombreEmpresa) {
  const fecha = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm');

  const filas = alertas.map(a => {
    // Semáforo de criticidad
    const color = a.dias >= diasAlerta * 2 ? '#ef4444'   // rojo: doble del umbral
                : a.dias >= diasAlerta     ? '#f59e0b'   // amarillo: en umbral
                :                            '#10b981';  // verde
    const etiqueta = a.dias >= diasAlerta * 2 ? 'CRÍTICO' : 'ALERTA';

    return `
      <tr style="border-bottom:1px solid #e5e7eb">
        <td style="padding:10px 12px;font-weight:600">${_escHtml(a.clienteNombre)}</td>
        <td style="padding:10px 12px;color:#6b7280">${_escHtml(a.tipo)}</td>
        <td style="padding:10px 12px;text-align:center;font-weight:700;font-size:1.05em">${a.saldo}</td>
        <td style="padding:10px 12px;text-align:center">${a.dias}</td>
        <td style="padding:10px 12px;text-align:center">
          <span style="background:${color};color:#fff;padding:3px 10px;border-radius:12px;font-size:0.78em;font-weight:700">${etiqueta}</span>
        </td>
      </tr>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;font-family:'Segoe UI',Arial,sans-serif;background:#f3f4f6">
  <div style="max-width:680px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.08)">

    <!-- Header -->
    <div style="background:linear-gradient(135deg,#0D1319 0%,#1a2535 100%);padding:28px 32px">
      <div style="display:flex;align-items:center;gap:14px">
        <div style="background:#00D2B4;width:42px;height:42px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:22px">🧺</div>
        <div>
          <h1 style="margin:0;color:#fff;font-size:1.3em;font-weight:700">${_escHtml(nombreEmpresa)}</h1>
          <p style="margin:2px 0 0;color:#00D2B4;font-size:0.82em">Alerta de Canasillas en Consignación</p>
        </div>
      </div>
    </div>

    <!-- Body -->
    <div style="padding:28px 32px">
      <p style="color:#374151;margin:0 0 6px">Generado el <strong>${fecha}</strong></p>
      <p style="color:#6b7280;font-size:0.9em;margin:0 0 24px">
        Los siguientes clientes tienen canasillas sin retornar hace <strong>${diasAlerta}+ días</strong>:
      </p>

      <table style="width:100%;border-collapse:collapse;font-size:0.9em">
        <thead>
          <tr style="background:#f9fafb">
            <th style="padding:10px 12px;text-align:left;color:#374151;font-weight:600;border-bottom:2px solid #e5e7eb">Cliente</th>
            <th style="padding:10px 12px;text-align:left;color:#374151;font-weight:600;border-bottom:2px solid #e5e7eb">Tipo Canasilla</th>
            <th style="padding:10px 12px;text-align:center;color:#374151;font-weight:600;border-bottom:2px solid #e5e7eb">Saldo</th>
            <th style="padding:10px 12px;text-align:center;color:#374151;font-weight:600;border-bottom:2px solid #e5e7eb">Días</th>
            <th style="padding:10px 12px;text-align:center;color:#374151;font-weight:600;border-bottom:2px solid #e5e7eb">Estado</th>
          </tr>
        </thead>
        <tbody>${filas}</tbody>
      </table>

      <div style="margin-top:24px;padding:16px;background:#fffbeb;border:1px solid #fde68a;border-radius:8px">
        <p style="margin:0;font-size:0.85em;color:#92400e">
          ⚠️ <strong>Acción requerida:</strong> Contacta a los clientes en estado CRÍTICO para gestionar el retorno.
          Las canasillas representan un activo importante de la empresa.
        </p>
      </div>
    </div>

    <!-- Footer -->
    <div style="background:#f9fafb;padding:18px 32px;border-top:1px solid #e5e7eb">
      <p style="margin:0;font-size:0.78em;color:#9ca3af;text-align:center">
        Este correo es generado automáticamente por <strong>${_escHtml(nombreEmpresa)} — Basket Flow</strong>.
        No respondas a este mensaje.
      </p>
    </div>
  </div>
</body>
</html>`;
}

function _escHtml(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
