// ===== BASKET FLOW — PDF GENERATOR =====
// Requires jsPDF + jsPDF-AutoTable via CDN

const PDF = (() => {

  function _getDoc() {
    return new window.jspdf.jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  }

  // ── Shared header ──────────────────────────────────────
  function _addHeader(doc, title, subtitle = '') {
    // Cyan accent bar top
    doc.setFillColor(0, 210, 180);
    doc.rect(0, 0, 210, 8, 'F');

    // Logo + title
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(8, 12, 16);
    doc.text('BASKET FLOW', 14, 22);

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 120, 140);
    doc.text('Sistema de Gestión de Operaciones de Báscula', 14, 28);

    // Title block
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(8, 12, 16);
    doc.text(title, 14, 40);

    if (subtitle) {
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 120, 140);
      doc.text(subtitle, 14, 46);
    }

    // Divider line
    doc.setDrawColor(0, 210, 180);
    doc.setLineWidth(0.3);
    doc.line(14, 50, 196, 50);

    return 56; // y position after header
  }

  // ── Shared footer ──────────────────────────────────────
  function _addFooter(doc) {
    const pageH = doc.internal.pageSize.getHeight();
    doc.setDrawColor(200, 210, 220);
    doc.setLineWidth(0.2);
    doc.line(14, pageH - 14, 196, pageH - 14);

    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(150, 160, 170);
    doc.text(`Generado el ${Utils.formatDateTime(new Date())}`, 14, pageH - 9);
    doc.text('Basket Flow — Sistema de Control de Báscula', 196, pageH - 9, { align: 'right' });
  }

  // ── Signature block ──────────────────────────────────────
  function _addSignatureLine(doc, y, label = 'Firma del Supervisor') {
    doc.setDrawColor(180, 190, 200);
    doc.setLineWidth(0.3);
    doc.line(14, y, 90, y);
    doc.setFontSize(8);
    doc.setTextColor(120, 130, 140);
    doc.text(label, 52, y + 5, { align: 'center' });
    doc.line(120, y, 196, y);
    doc.text('Firma del Operador', 158, y + 5, { align: 'center' });
  }

  // ── Field row helper ──────────────────────────────────────
  function _addFieldRow(doc, y, label, value, mono = false) {
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(100, 120, 140);
    doc.text(label.toUpperCase(), 14, y);

    doc.setFont(mono ? 'courier' : 'helvetica', 'normal');
    doc.setTextColor(20, 30, 40);
    doc.text(String(value ?? '—'), 70, y);
    return y + 7;
  }

  // ════════════════════════════════════════
  //  PDF: Entrada Individual
  // ════════════════════════════════════════
  function generateEntradaPDF(entrada) {
    const doc = _getDoc();
    let y = _addHeader(doc,
      `Registro de Entrada — ${entrada.consecutivo || '—'}`,
      Utils.formatDateTime(entrada.fechaHora)
    );

    // Section: Identificación
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 210, 180);
    doc.text('IDENTIFICACIÓN', 14, y);
    y += 6;

    y = _addFieldRow(doc, y, 'Proveedor', entrada.proveedor);
    y = _addFieldRow(doc, y, 'Producto',  entrada.producto);
    y = _addFieldRow(doc, y, 'Cliente',   entrada.cliente || 'Sin cliente');
    if (entrada.comentarios) y = _addFieldRow(doc, y, 'Observaciones', entrada.comentarios);
    y += 4;

    // Section: Pesos
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 210, 180);
    doc.text('DESGLOSE DE PESOS', 14, y);
    y += 6;

    y = _addFieldRow(doc, y, 'Peso total báscula', Utils.formatWeight(entrada.pesoBascula), true);
    y = _addFieldRow(doc, y, 'Peso canasillas',    Utils.formatWeight(entrada.pesoCanasillas), true);
    y = _addFieldRow(doc, y, 'Peso estiba',        Utils.formatWeight(entrada.pesoEstiba), true);

    // Peso libre en grande
    y += 4;
    doc.setFillColor(240, 250, 248);
    doc.roundedRect(14, y - 2, 182, 14, 2, 2, 'F');
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 120, 100);
    doc.text('PESO LIBRE (NETO):', 16, y + 7);
    doc.setFontSize(14);
    doc.setTextColor(0, 210, 180);
    doc.text(Utils.formatWeight(entrada.pesoLibre), 130, y + 8);
    y += 20;

    // Section: Canasillas
    if (entrada.canasillas && entrada.canasillas.length > 0) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(0, 210, 180);
      doc.text('CANASILLAS', 14, y);
      y += 4;

      doc.autoTable({
        startY: y,
        head: [['Propietario', 'Peso Unit.', 'Cantidad', 'Subtotal']],
        body: entrada.canasillas.map(c => [
          c.propietario,
          Utils.formatWeight(c.pesoUnitario),
          c.cantidad,
          Utils.formatWeight(c.subtotal),
        ]),
        styles: { fontSize: 8, cellPadding: 3, textColor: [30, 40, 50] },
        headStyles: { fillColor: [0, 210, 180], textColor: [0,0,0], fontStyle: 'bold', fontSize: 7 },
        alternateRowStyles: { fillColor: [245, 250, 252] },
        margin: { left: 14, right: 14 },
        tableLineColor: [200, 210, 220],
        tableLineWidth: 0.1,
      });
      y = doc.lastAutoTable.finalY + 10;
    }

    // Section: Registrado por
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(0, 210, 180);
    doc.text('REGISTRO', 14, y);
    y += 6;
    y = _addFieldRow(doc, y, 'Registrado por', entrada.operador || '—');
    y = _addFieldRow(doc, y, 'Consecutivo',   entrada.consecutivo, true);
    y += 10;

    _addSignatureLine(doc, y);
    _addFooter(doc);

    doc.save(`${entrada.consecutivo || 'entrada'}.pdf`);
  }

  // ════════════════════════════════════════
  //  PDF: Reporte Diario
  // ════════════════════════════════════════
  function generateReportePDF(data) {
    const doc  = _getDoc();
    let y = _addHeader(doc,
      `Reporte Diario — ${Utils.formatDate(data.fecha, 'long')}`,
      `${data.totalEntradas} entradas · ${Utils.formatWeight(data.totalKg)} procesados`
    );

    // KPI summary boxes
    const kpis = [
      ['Entradas', data.totalEntradas],
      ['KG Totales', Utils.formatWeight(data.totalKg)],
      ['Proveedores', data.proveedores?.length || 0],
      ['Devoluciones', data.devoluciones || 0],
    ];
    const boxW = 42;
    kpis.forEach((k, i) => {
      const x = 14 + i * (boxW + 3);
      doc.setFillColor(12, 19, 25);
      doc.roundedRect(x, y, boxW, 18, 2, 2, 'F');
      doc.setFontSize(7);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100,150,140);
      doc.text(k[0].toUpperCase(), x + boxW/2, y + 7, { align: 'center' });
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(0, 210, 180);
      doc.text(String(k[1]), x + boxW/2, y + 15, { align: 'center' });
    });
    y += 26;

    // Entries table
    if (data.entradas && data.entradas.length > 0) {
      doc.autoTable({
        startY: y,
        head: [['Consec.', 'Hora', 'Proveedor', 'Producto', 'Cliente', 'Kg Báscula', 'Kg Neto', 'Estado']],
        body: data.entradas.map(e => [
          e.consecutivo,
          Utils.formatTime(e.fechaHora),
          e.proveedor,
          e.producto,
          e.cliente || '—',
          Utils.formatWeight(e.pesoBascula),
          Utils.formatWeight(e.pesoLibre),
          e.estado,
        ]),
        styles: { fontSize: 7.5, cellPadding: 2.5 },
        headStyles: { fillColor: [0, 210, 180], textColor: [0,0,0], fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        columnStyles: { 0: { font: 'courier' }, 1: { font: 'courier' } },
        margin: { left: 14, right: 14 },
      });
      y = doc.lastAutoTable.finalY + 6;
    }

    // Totales por producto
    if (data.totalPorProducto && data.totalPorProducto.length > 0) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(0,210,180);
      doc.text('TOTALES POR PRODUCTO', 14, y);
      y += 4;
      doc.autoTable({
        startY: y,
        head: [['Producto', 'Entregas', 'KG Totales', 'KG Promedio']],
        body: data.totalPorProducto.map(p => [
          p.producto, p.entregas,
          Utils.formatWeight(p.kgTotal),
          Utils.formatWeight(p.kgPromedio),
        ]),
        styles: { fontSize: 7.5, cellPadding: 2.5 },
        headStyles: { fillColor: [30, 40, 60], textColor: [200,220,220] },
        margin: { left: 14, right: 14 },
      });
      y = doc.lastAutoTable.finalY + 10;
    }

    _addSignatureLine(doc, y, 'Firma del Supervisor');
    _addFooter(doc);
    doc.save(`reporte_diario_${Utils.formatDate(data.fecha, 'iso')}.pdf`);
  }

  // ════════════════════════════════════════
  //  PDF: Inventario Canasillas
  // ════════════════════════════════════════
  function generateInventarioPDF(data) {
    const doc = _getDoc();
    let y = _addHeader(doc,
      'Inventario de Canasillas',
      `Al ${Utils.formatDateTime(new Date())}`
    );

    doc.autoTable({
      startY: y,
      head: [['Propietario', 'Tipo', 'Peso Unit.', 'Stock Actual', 'Últ. Actualización']],
      body: (data.stock || []).map(s => [
        s.propietario, s.tipo,
        Utils.formatWeight(s.pesoUnitario),
        s.stock,
        Utils.formatDateTime(s.ultimaActualizacion),
      ]),
      styles: { fontSize: 8, cellPadding: 3 },
      headStyles: { fillColor: [0,210,180], textColor: [0,0,0], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248,252,252] },
      margin: { left: 14, right: 14 },
    });
    y = doc.lastAutoTable.finalY + 10;

    // Alertas
    const alertas = (data.alertas || []);
    if (alertas.length > 0) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(255,77,106);
      doc.text(`⚠ CANASILLAS EN ALERTA (${alertas.length})`, 14, y);
      y += 4;
      doc.autoTable({
        startY: y,
        head: [['Propietario', 'Cliente/Proveedor', 'Cantidad', 'Días Fuera', 'Ref. Entrada']],
        body: alertas.map(a => [a.propietario, a.ubicacion, a.cantidad, a.dias, a.referencia]),
        styles: { fontSize: 8, cellPadding: 3, textColor: [200,50,70] },
        headStyles: { fillColor: [255,77,106], textColor: [255,255,255], fontStyle: 'bold' },
        margin: { left: 14, right: 14 },
      });
    }

    _addFooter(doc);
    doc.save(`inventario_canasillas_${Utils.formatDate(new Date(), 'iso')}.pdf`);
  }

  // ════════════════════════════════════════
  //  PDF: Devolución
  // ════════════════════════════════════════
  function generateDevolucionPDF(dev) {
    const doc = _getDoc();
    let y = _addHeader(doc,
      `Devolución — ${dev.consecutivo || '—'}`,
      `Ref. entrada: ${dev.entradaRef} · ${Utils.formatDateTime(dev.fechaHora)}`
    );

    y = _addFieldRow(doc, y, 'Motivo',          dev.motivo);
    y = _addFieldRow(doc, y, 'Peso devuelto',   Utils.formatWeight(dev.pesoDevuelto), true);
    y = _addFieldRow(doc, y, 'Nuevo peso neto', Utils.formatWeight(dev.nuevoPesoNeto), true);
    y = _addFieldRow(doc, y, 'Aprobado por',    dev.aprobadoPor || 'Pendiente');
    y = _addFieldRow(doc, y, 'Estado',          dev.estado);
    y += 10;

    _addSignatureLine(doc, y, 'Firma del Supervisor');
    _addFooter(doc);
    doc.save(`${dev.consecutivo || 'devolucion'}.pdf`);
  }

  return {
    generateEntradaPDF,
    generateReportePDF,
    generateInventarioPDF,
    generateDevolucionPDF,
  };
})();
