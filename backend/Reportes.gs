// ===== BASKET FLOW — REPORTES.GS =====

function Reportes_getDashboardKPIs(userInfo) {
  try {
    const hoy     = new Date();
    const inicio  = new Date(hoy.setHours(0,0,0,0));
    const fin     = new Date(hoy.setHours(23,59,59,999));

    const entradas = _sheetToObjects(_getSheet('Entradas'));
    const hoyEntradas = entradas.filter(e => {
      const f = new Date(e.FechaHora);
      return f >= inicio && f <= fin && e.Estado !== 'Anulada';
    });

    const totalKg         = hoyEntradas.reduce((s, e) => s + (parseFloat(e.PesoLibre) || 0), 0);
    const stockRes        = Canasillas_getResumen(userInfo);
    const alertas         = stockRes.alertas || 0;

    // Por hora (últimas 8 horas)
    const hourBuckets = {};
    for (let i = 7; i >= 0; i--) {
      const h = new Date(); h.setHours(h.getHours() - i, 0, 0, 0);
      const label = `${String(h.getHours()).padStart(2,'0')}:00`;
      hourBuckets[label] = 0;
    }
    hoyEntradas.forEach(e => {
      const f = new Date(e.FechaHora);
      const label = `${String(f.getHours()).padStart(2,'0')}:00`;
      if (hourBuckets[label] !== undefined) hourBuckets[label]++;
    });

    // Últimas 5 entradas
    const ultimas = hoyEntradas
      .sort((a,b) => new Date(b.FechaHora) - new Date(a.FechaHora))
      .slice(0, 5);

    return {
      ok: true,
      entradasHoy:     hoyEntradas.length,
      kgHoy:           totalKg,
      stockCanasillas: stockRes.empresa || 0,
      alertas,
      porHora:         hourBuckets,
      ultimasEntradas: ultimas,
    };

  } catch (err) {
    Logger.log('[Reportes_getDashboardKPIs] ' + err.message);
    return { ok: false, error: err.message };
  }
}

function Reportes_getDiario(payload, userInfo) {
  try {
    const { fecha } = payload;
    const día  = fecha ? new Date(fecha) : new Date();
    const inicio = new Date(día); inicio.setHours(0,0,0,0);
    const fin    = new Date(día); fin.setHours(23,59,59,999);

    const entradas = _sheetToObjects(_getSheet('Entradas')).filter(e => {
      const f = new Date(e.FechaHora);
      return f >= inicio && f <= fin && e.Estado !== 'Anulada';
    });

    const totalKg  = entradas.reduce((s, e) => s + (parseFloat(e.PesoLibre) || 0), 0);

    // Por producto
    const byProducto = {};
    entradas.forEach(e => {
      if (!byProducto[e.ProductoNombre]) byProducto[e.ProductoNombre] = { producto: e.ProductoNombre, entregas: 0, kgTotal: 0 };
      byProducto[e.ProductoNombre].entregas++;
      byProducto[e.ProductoNombre].kgTotal += parseFloat(e.PesoLibre) || 0;
    });

    const totalPorProducto = Object.values(byProducto).map(p => ({
      ...p,
      kgPromedio: p.kgTotal / p.entregas,
    }));

    const devs = _sheetToObjects(_getSheet('Devoluciones')).filter(d => {
      const f = new Date(d.FechaHora);
      return f >= inicio && f <= fin;
    });

    Log_write(userInfo, 'EXPORTAR_REPORTE', 'Reportes', `Diario-${fecha}`, '', 'OK');

    return {
      ok: true,
      fecha: payload.fecha || new Date().toISOString().slice(0,10),
      totalEntradas: entradas.length,
      totalKg,
      proveedores:   [...new Set(entradas.map(e => e.ProveedorNombre))],
      devoluciones:  devs.length,
      entradas,
      totalPorProducto,
    };

  } catch (err) { return { ok: false, error: err.message }; }
}

function Reportes_getProveedor(payload, userInfo) {
  try {
    const { proveedorId, desde, hasta } = payload;
    const entradas = _sheetToObjects(_getSheet('Entradas')).filter(e => {
      if (e.ProveedorID !== proveedorId) return false;
      if (e.Estado === 'Anulada') return false;
      const f = new Date(e.FechaHora);
      if (desde && f < new Date(desde)) return false;
      if (hasta && f > new Date(hasta + 'T23:59:59')) return false;
      return true;
    });

    const totalKg      = entradas.reduce((s, e) => s + (parseFloat(e.PesoLibre) || 0), 0);
    const promedioKg   = entradas.length > 0 ? totalKg / entradas.length : 0;
    const proveedor    = entradas[0]?.ProveedorNombre || proveedorId;

    return { ok: true, proveedor, entradas, totalKg, promedioKg, totalEntregas: entradas.length };
  } catch (err) { return { ok: false, error: err.message }; }
}

function Reportes_getCliente(payload, userInfo) {
  try {
    const { clienteId, desde, hasta } = payload;
    const entradas = _sheetToObjects(_getSheet('Entradas')).filter(e => {
      if (e.ClienteID !== clienteId) return false;
      if (e.Estado === 'Anulada') return false;
      const f = new Date(e.FechaHora);
      if (desde && f < new Date(desde)) return false;
      if (hasta && f > new Date(hasta + 'T23:59:59')) return false;
      return true;
    });
    const totalKg  = entradas.reduce((s, e) => s + (parseFloat(e.PesoLibre) || 0), 0);
    const cliente  = entradas[0]?.ClienteNombre || clienteId;
    return { ok: true, cliente, entradas, totalKg, totalEntregas: entradas.length };
  } catch (err) { return { ok: false, error: err.message }; }
}

function Reportes_getProducto(payload, userInfo) {
  try {
    const { productoId, desde, hasta } = payload;
    const entradas = _sheetToObjects(_getSheet('Entradas')).filter(e => {
      if (e.ProductoID !== productoId) return false;
      if (e.Estado === 'Anulada') return false;
      const f = new Date(e.FechaHora);
      if (desde && f < new Date(desde)) return false;
      if (hasta && f > new Date(hasta + 'T23:59:59')) return false;
      return true;
    });
    const totalKg   = entradas.reduce((s, e) => s + (parseFloat(e.PesoLibre) || 0), 0);
    const producto  = entradas[0]?.ProductoNombre || productoId;

    // Por semana
    const porSemana = {};
    entradas.forEach(e => {
      const f = new Date(e.FechaHora);
      const semana = `${f.getFullYear()}-W${String(Math.ceil(f.getDate()/7)).padStart(2,'0')}`;
      if (!porSemana[semana]) porSemana[semana] = { semana, kg: 0, entregas: 0 };
      porSemana[semana].kg += parseFloat(e.PesoLibre) || 0;
      porSemana[semana].entregas++;
    });

    return { ok: true, producto, entradas, totalKg, totalEntregas: entradas.length, porSemana: Object.values(porSemana) };
  } catch (err) { return { ok: false, error: err.message }; }
}

function Reportes_getChartData(payload, userInfo) {
  try {
    const dias = parseInt(payload.dias || 15, 10);
    const entradas = _sheetToObjects(_getSheet('Entradas')).filter(e => e.Estado !== 'Anulada');
    const labels = [];
    const porDia = [];

    for (let i = dias - 1; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const label = Utils_formatDateGAS(d);
      labels.push(label);
      const dayStr = d.toDateString();
      const kg = entradas
        .filter(e => new Date(e.FechaHora).toDateString() === dayStr)
        .reduce((s, e) => s + (parseFloat(e.PesoLibre) || 0), 0);
      porDia.push(parseFloat(kg.toFixed(1)));
    }

    return { ok: true, labels, porDia };
  } catch (err) { return { ok: false, error: err.message }; }
}

function Utils_formatDateGAS(d) {
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}`;
}
