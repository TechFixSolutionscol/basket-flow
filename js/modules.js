// ===== BASKET FLOW — DASHBOARD MODULE =====
const Dashboard = (() => {
  let _chartHoras = null;

  async function init() {
    const container = document.getElementById('view-dashboard');
    if (!container) return;

    // Show skeletons while loading
    container.querySelectorAll('.kpi-value').forEach(el => {
      el.innerHTML = '<div class="skeleton skeleton-text w-50"></div>';
    });

    const res = await API.get('getDashboardKPIs');
    if (!res.ok) { Utils.showToast('Error al cargar el dashboard.', 'error'); return; }

    // KPIs
    _setKPI('kpi-entradas-hoy',     res.entradasHoy);
    _setKPI('kpi-kg-hoy',           Utils.formatWeight(res.kgHoy));
    _setKPI('kpi-stock-canasillas', res.stockCanasillas);
    _setKPI('kpi-alertas',          res.alertas, res.alertas > 0 ? 'danger' : '');

    // Últimas entradas
    _renderUltimasEntradas(res.ultimasEntradas || []);

    // Chart por hora
    _renderChartHoras(res.porHora || {});

    container.querySelector('.stagger-in')?.classList.add('stagger-in');
  }

  function _setKPI(id, value, cls = '') {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = value;
    if (cls) el.className = `kpi-value ${cls}`;
  }

  function _renderUltimasEntradas(entradas) {
    const tbody = document.getElementById('ultimas-entradas-body');
    if (!tbody) return;
    tbody.innerHTML = entradas.length === 0
      ? '<tr><td colspan="5" style="text-align:center;color:var(--clr-text-muted);padding:var(--sp-5)">Sin entradas hoy</td></tr>'
      : entradas.map(e => `
          <tr onclick="navigate('entradas')" style="cursor:pointer">
            <td class="mono">${Utils.sanitize(e.Consecutivo)}</td>
            <td>${Utils.sanitize(e.ProveedorNombre)}</td>
            <td>${Utils.sanitize(e.ProductoNombre)}</td>
            <td class="mono">${Utils.formatWeight(e.PesoLibre)}</td>
            <td>${_estadoBadge(e.Estado)}</td>
          </tr>`
        ).join('');
  }

  function _estadoBadge(estado) {
    const map = {
      'Activa':         'badge-active',
      'Con devolución': 'badge-warning',
      'Anulada':        'badge-danger',
      'Pendiente':      'badge-pending',
    };
    return `<span class="badge ${map[estado] || 'badge-inactive'}"><span class="badge-dot"></span>${Utils.sanitize(estado)}</span>`;
  }

  function _renderChartHoras(porHora) {
    const canvas = document.getElementById('chart-horas');
    if (!canvas || !window.Chart) return;
    if (_chartHoras) _chartHoras.destroy();

    const labels = Object.keys(porHora);
    const data   = Object.values(porHora);

    _chartHoras = new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Entradas',
          data,
          backgroundColor: 'rgba(0,210,180,0.25)',
          borderColor:     '#00D2B4',
          borderWidth: 1.5,
          borderRadius: 3,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { color: 'rgba(0,210,180,0.06)' }, ticks: { color: '#4A5A6A', font: { family: 'DM Mono', size: 10 } } },
          y: { grid: { color: 'rgba(0,210,180,0.06)' }, ticks: { color: '#4A5A6A', font: { family: 'DM Mono', size: 10 }, stepSize: 1 }, beginAtZero: true },
        }
      }
    });
  }

  return { init };
})();

// ===== BASKET FLOW — ENTRADAS MODULE =====
const Entradas = (() => {
  let _canasillasCount = 0;
  let _currentPage = 1;

  // ── NEW ENTRY FORM ────────────────────────────────────────────────────────
  function initForm() {
    const masters = App.getMasters();
    _populateSelect('entrada-proveedor', masters.proveedores || [], 'ID', 'Nombre');
    _populateSelect('entrada-producto',  masters.productos   || [], 'ID', 'Nombre');
    _populateSelect('entrada-cliente',   masters.clientes    || [], 'ID', 'Nombre', true);

    // Auto-fill consecutive and datetime
    document.getElementById('entrada-consecutivo').value = 'BF-' + new Date().getFullYear() + '-XXXXX';
    _updateDateTime();
    setInterval(_updateDateTime, 1000);

    // Init canasilla lines
    _canasillasCount = 0;
    document.getElementById('canasillas-container').innerHTML = '';
    _addCanasilla();

    // Real-time scale calculation
    ['entrada-peso-bascula','entrada-peso-estiba'].forEach(id => {
      document.getElementById(id)?.addEventListener('input', _calcularPeso);
    });

    document.getElementById('add-canasilla-btn')?.addEventListener('click', _addCanasilla);
    document.getElementById('entrada-form')?.addEventListener('submit', _submitEntrada);
    document.getElementById('entrada-limpiar')?.addEventListener('click', initForm);
  }

  function _updateDateTime() {
    const el = document.getElementById('entrada-datetime');
    if (el) el.value = Utils.formatDateTime(new Date());
  }

  function _populateSelect(id, items, valKey, labelKey, includeEmpty = false) {
    const sel = document.getElementById(id);
    if (!sel) return;
    sel.innerHTML = (includeEmpty ? '<option value="">Sin cliente</option>' : '<option value="">Seleccionar...</option>') +
      items.filter(i => i.Activo !== false).map(i =>
        `<option value="${Utils.sanitize(i[valKey])}" data-nombre="${Utils.sanitize(i[labelKey])}">${Utils.sanitize(i[labelKey])}</option>`
      ).join('');
  }

  function _addCanasilla() {
    const masters = App.getMasters();
    const tipos   = masters.canasillas || [];
    const idx     = _canasillasCount++;
    const container = document.getElementById('canasillas-container');

    const row = document.createElement('div');
    row.className = 'canasilla-line stagger-in';
    row.id        = `canasilla-row-${idx}`;
    row.innerHTML = `
      <select class="form-select can-owner" onchange="Entradas._calcularPeso()">
        <option value="empresa">Empresa</option>
        ${(masters.proveedores||[]).map(p => `<option value="${p.ID}">${p.Nombre}</option>`).join('')}
      </select>
      <select class="form-select can-peso" onchange="Entradas._calcularPeso()">
        ${tipos.map(t => `<option value="${t.PesoUnitario}">${t.Descripcion} (${t.PesoUnitario} kg)</option>`).join('')}
      </select>
      <input type="number" class="form-input can-cantidad" min="0" value="0" placeholder="0" oninput="Entradas._calcularPeso()">
      <span class="subtotal mono" id="sub-${idx}">0.0 kg</span>
      <button type="button" class="canasilla-remove" onclick="Entradas._removeCanasilla('canasilla-row-${idx}')">×</button>
    `;
    container.appendChild(row);
    _calcularPeso();
  }

  function _removeCanasilla(rowId) {
    document.getElementById(rowId)?.remove();
    _calcularPeso();
  }

  function _calcularPeso() {
    const pesoBascula = parseFloat(document.getElementById('entrada-peso-bascula')?.value) || 0;
    const pesoEstiba  = parseFloat(document.getElementById('entrada-peso-estiba')?.value)  || 0;

    let pesoCanasillas = 0;
    let totalUnidades  = 0;

    document.querySelectorAll('.canasilla-line').forEach((row, i) => {
      const peso     = parseFloat(row.querySelector('.can-peso')?.value)     || 0;
      const cantidad = parseInt(row.querySelector('.can-cantidad')?.value, 10) || 0;
      const subtotal = peso * cantidad;
      pesoCanasillas += subtotal;
      totalUnidades  += cantidad;
      const subEl = row.querySelector('.subtotal');
      if (subEl) subEl.textContent = Utils.formatWeight(subtotal);
    });

    const pesoLibre = pesoBascula - pesoEstiba - pesoCanasillas;

    const displayEl   = document.getElementById('scale-weight');
    const errorEl     = document.getElementById('scale-error');
    const canSubEl    = document.getElementById('scale-canasillas');
    const estibaSubEl = document.getElementById('scale-estiba');
    const unidadesEl  = document.getElementById('scale-unidades');

    if (displayEl) {
      displayEl.textContent = pesoLibre.toFixed(1);
      displayEl.classList.toggle('error', pesoLibre < 0);
    }
    if (errorEl)    errorEl.style.display = pesoLibre < 0 ? 'block' : 'none';
    if (canSubEl)   canSubEl.textContent = Utils.formatWeight(pesoCanasillas);
    if (estibaSubEl) estibaSubEl.textContent = Utils.formatWeight(pesoEstiba);
    if (unidadesEl) unidadesEl.textContent = `${totalUnidades} uds`;

    // Disable save button if invalid
    const saveBtn = document.getElementById('entrada-save-btn');
    if (saveBtn) saveBtn.disabled = pesoLibre < 0 || pesoBascula <= 0;
  }

  async function _submitEntrada(e) {
    e.preventDefault();
    const btn     = document.getElementById('entrada-save-btn');
    const masters = App.getMasters();

    // Gather canasilla lines
    const canasillas = [];
    document.querySelectorAll('.canasilla-line').forEach(row => {
      const ownerSel = row.querySelector('.can-owner');
      const peso     = parseFloat(row.querySelector('.can-peso')?.value);
      const cantidad = parseInt(row.querySelector('.can-cantidad')?.value, 10);
      if (cantidad > 0) {
        canasillas.push({
          propietarioTipo:   ownerSel?.value === 'empresa' ? 'Empresa' : 'Proveedor',
          propietarioID:     ownerSel?.value || 'empresa',
          propietarioNombre: ownerSel?.selectedOptions[0]?.textContent || 'Empresa',
          pesoUnitario: peso,
          cantidad,
        });
      }
    });

    const provSel = document.getElementById('entrada-proveedor');
    const prodSel = document.getElementById('entrada-producto');
    const cliSel  = document.getElementById('entrada-cliente');

    const payload = {
      proveedorID:     provSel?.value,
      proveedorNombre: provSel?.selectedOptions[0]?.dataset.nombre || '',
      productoID:      prodSel?.value,
      productoNombre:  prodSel?.selectedOptions[0]?.dataset.nombre || '',
      clienteID:       cliSel?.value  || '',
      clienteNombre:   cliSel?.selectedOptions[0]?.dataset.nombre || 'Sin cliente',
      pesoBascula:     parseFloat(document.getElementById('entrada-peso-bascula')?.value),
      pesoEstiba:      parseFloat(document.getElementById('entrada-peso-estiba')?.value) || 0,
      canasillas,
      comentarios:     document.getElementById('entrada-comentarios')?.value || '',
    };

    btn.disabled = true;
    btn.innerHTML = '<span class="btn-spinner"></span> Guardando...';

    const res = await API.post('crearEntrada', payload);

    btn.disabled = false;
    btn.innerHTML = 'GUARDAR ENTRADA';

    if (res.ok) {
      _showSuccessAnimation();
      setTimeout(() => initForm(), 2500);
    } else {
      Utils.showToast(res.error || 'Error al guardar la entrada.', 'error');
    }
  }

  function _showSuccessAnimation() {
    const overlay = document.getElementById('entrada-success-overlay');
    if (overlay) {
      overlay.style.display = 'flex';
      setTimeout(() => { overlay.style.display = 'none'; }, 2500);
    }
    Utils.showToast('Entrada registrada exitosamente.', 'success');
  }

  // ── ENTRIES GRID ──────────────────────────────────────────────────────────
  async function initGrid(page = 1) {
    _currentPage = page;
    const tbody   = document.getElementById('entradas-grid-body');
    if (!tbody) return;

    // Show skeleton
    tbody.innerHTML = Array(5).fill(0).map(() =>
      '<tr>' + Array(9).fill('<td><div class="skeleton skeleton-text"></div></td>').join('') + '</tr>'
    ).join('');

    const filters = _getGridFilters();
    const res     = await API.get('getEntradas', { ...filters, page, size: 50 });

    if (!res.ok) { Utils.showToast('Error al cargar entradas.', 'error'); return; }

    _renderGrid(res.items || []);
    _renderPagination(res.total, res.page, res.pages);

    // Count
    const countEl = document.getElementById('entradas-count');
    if (countEl) countEl.textContent = `${res.total} registros`;
  }

  function _getGridFilters() {
    return {
      busqueda:  document.getElementById('entradas-busqueda')?.value || '',
      proveedor: document.getElementById('entradas-filter-proveedor')?.value || '',
      producto:  document.getElementById('entradas-filter-producto')?.value || '',
      estado:    document.getElementById('entradas-filter-estado')?.value || '',
      desde:     document.getElementById('entradas-filter-desde')?.value || '',
      hasta:     document.getElementById('entradas-filter-hasta')?.value || '',
    };
  }

  function _renderGrid(items) {
    const tbody = document.getElementById('entradas-grid-body');
    if (!tbody) return;
    tbody.innerHTML = items.length === 0
      ? `<tr><td colspan="9" style="text-align:center;padding:var(--sp-8);color:var(--clr-text-muted)">
            Sin resultados para los filtros aplicados.
         </td></tr>`
      : items.map(e => `
          <tr class="${e.Estado === 'Anulada' ? 'row-anulada' : ''}" onclick="Entradas._openDetalle('${Utils.sanitize(e.Consecutivo)}')">
            <td><input type="checkbox" onclick="event.stopPropagation()"></td>
            <td class="mono">${Utils.sanitize(e.Consecutivo)}</td>
            <td class="mono">${Utils.formatDate(e.FechaHora)}</td>
            <td class="mono">${Utils.formatTime(e.FechaHora)}</td>
            <td>${Utils.sanitize(e.ProveedorNombre)}</td>
            <td>${Utils.sanitize(e.ProductoNombre)}</td>
            <td class="mono">${Utils.formatWeight(e.PesoBascula)}</td>
            <td class="mono">${Utils.formatWeight(e.PesoLibre)}</td>
            <td>${_estadoBadge(e.Estado)}</td>
            <td onclick="event.stopPropagation()" style="white-space:nowrap">
              <button class="btn btn-ghost btn-sm" title="Ver" onclick="Entradas._openDetalle('${Utils.sanitize(e.Consecutivo)}')">👁</button>
              <button class="btn btn-ghost btn-sm" title="PDF" onclick="Entradas._generatePDF('${Utils.sanitize(e.Consecutivo)}')">📄</button>
              ${e.Estado !== 'Anulada' ? `<button class="btn btn-ghost btn-sm" title="Editar" onclick="Entradas._openEdit('${Utils.sanitize(e.Consecutivo)}')">✏</button>` : ''}
            </td>
          </tr>`
        ).join('');
  }

  function _estadoBadge(estado) {
    const map = { 'Activa':'badge-active','Con devolución':'badge-warning','Anulada':'badge-danger','Pendiente revisión':'badge-pending' };
    return `<span class="badge ${map[estado]||'badge-inactive'}"><span class="badge-dot"></span>${Utils.sanitize(estado)}</span>`;
  }

  function _renderPagination(total, page, pages) {
    const el = document.getElementById('entradas-pagination');
    if (!el || pages <= 1) { if (el) el.innerHTML = ''; return; }
    const buttons = [];
    buttons.push(`<button onclick="Entradas.initGrid(${page-1})" ${page===1?'disabled':''}>‹</button>`);
    for (let i = 1; i <= Math.min(pages, 7); i++) {
      buttons.push(`<button class="${i===page?'active':''}" onclick="Entradas.initGrid(${i})">${i}</button>`);
    }
    buttons.push(`<button onclick="Entradas.initGrid(${page+1})" ${page===pages?'disabled':''}>›</button>`);
    el.innerHTML = buttons.join('');
  }

  async function _openDetalle(id) {
    const res = await API.get('getEntrada', { id });
    if (!res.ok) { Utils.showToast('Error al cargar la entrada.', 'error'); return; }
    _showDetalleDrawer(res.entrada);
  }

  function _showDetalleDrawer(entrada) {
    const drawer = document.getElementById('drawer-detalle');
    if (!drawer) return;

    const canasillasHTML = (entrada.canasillas || []).map(c =>
      `<tr>
        <td>${Utils.sanitize(c.PropietarioNombre)}</td>
        <td class="mono">${Utils.formatWeight(c.PesoUnitario)}</td>
        <td class="mono">${c.Cantidad}</td>
        <td class="mono">${Utils.formatWeight(c.PesoSubtotal)}</td>
      </tr>`
    ).join('');

    drawer.innerHTML = `
      <div class="detalle-header">
        <div>
          <div class="detalle-consecutivo">${Utils.sanitize(entrada.Consecutivo)}</div>
          <div class="detalle-fecha">${Utils.formatDateTime(entrada.FechaHora)}</div>
        </div>
        <div style="display:flex;gap:8px;align-items:center">
          <button class="btn btn-secondary btn-sm" onclick="Entradas._generatePDF('${Utils.sanitize(entrada.Consecutivo)}')">📄 PDF</button>
          <button class="modal-close" onclick="document.getElementById('drawer-detalle').innerHTML='';document.getElementById('drawer-overlay').style.display='none'">✕</button>
        </div>
      </div>
      <div class="detalle-section">
        <div class="detalle-section-title">Detalles</div>
        <div class="detalle-grid">
          <div class="detalle-field"><div class="detalle-field-label">Proveedor</div><div class="detalle-field-value">${Utils.sanitize(entrada.ProveedorNombre)}</div></div>
          <div class="detalle-field"><div class="detalle-field-label">Producto</div><div class="detalle-field-value">${Utils.sanitize(entrada.ProductoNombre)}</div></div>
          <div class="detalle-field"><div class="detalle-field-label">Cliente</div><div class="detalle-field-value">${Utils.sanitize(entrada.ClienteNombre||'Sin cliente')}</div></div>
          <div class="detalle-field"><div class="detalle-field-label">Registró</div><div class="detalle-field-value">${Utils.sanitize(entrada.UsuarioNombre)}</div></div>
        </div>
      </div>
      <div class="detalle-section">
        <div class="detalle-section-title">Pesos</div>
        <div class="detalle-grid">
          <div class="detalle-field"><div class="detalle-field-label">Peso Báscula</div><div class="detalle-field-value mono">${Utils.formatWeight(entrada.PesoBascula)}</div></div>
          <div class="detalle-field"><div class="detalle-field-label">Peso Canasillas</div><div class="detalle-field-value mono">${Utils.formatWeight(entrada.PesoCanasillas)}</div></div>
          <div class="detalle-field"><div class="detalle-field-label">Peso Estiba</div><div class="detalle-field-value mono">${Utils.formatWeight(entrada.PesoEstiba)}</div></div>
          <div class="detalle-field">
            <div class="detalle-field-label">Peso Libre (Neto)</div>
            <div class="detalle-peso-libre">${parseFloat(entrada.PesoLibre||0).toFixed(1)} kg</div>
          </div>
        </div>
      </div>
      ${canasillasHTML ? `
      <div class="detalle-section">
        <div class="detalle-section-title">Canasillas</div>
        <table class="data-table"><thead><tr><th>Propietario</th><th>Peso Unit.</th><th>Cant.</th><th>Subtotal</th></tr></thead>
        <tbody>${canasillasHTML}</tbody></table>
      </div>` : ''}
      ${entrada.Comentarios ? `
      <div class="detalle-section">
        <div class="detalle-section-title">Observaciones</div>
        <p style="font-size:0.82rem;color:var(--clr-text-secondary)">${Utils.sanitize(entrada.Comentarios)}</p>
      </div>` : ''}
    `;

    document.getElementById('drawer-overlay').style.display = 'block';
    drawer.style.display = 'flex';
    drawer.style.flexDirection = 'column';
  }

  async function _generatePDF(id) {
    const res = await API.get('getEntrada', { id });
    if (!res.ok) return;
    const e = res.entrada;
    PDF.generateEntradaPDF({
      consecutivo: e.Consecutivo,
      fechaHora:   e.FechaHora,
      proveedor:   e.ProveedorNombre,
      producto:    e.ProductoNombre,
      cliente:     e.ClienteNombre,
      pesoBascula: e.PesoBascula,
      pesoCanasillas: e.PesoCanasillas,
      pesoEstiba:  e.PesoEstiba,
      pesoLibre:   e.PesoLibre,
      canasillas:  (e.canasillas||[]).map(c=>({propietario:c.PropietarioNombre,pesoUnitario:c.PesoUnitario,cantidad:c.Cantidad,subtotal:c.PesoSubtotal})),
      operador:    e.UsuarioNombre,
      comentarios: e.Comentarios,
    });
  }

  async function _openEdit(id) {
    const res = await API.get('getEntrada', { id });
    if (!res.ok) { Utils.showToast('Error al cargar la entrada.', 'error'); return; }
    const e = res.entrada;
    const modal = document.getElementById('modal-overlay');
    const body  = document.getElementById('modal-body-content');
    const title = document.getElementById('modal-title');
    if (!modal || !body) return;

    if (title) title.textContent = `Editar Entrada ${id}`;

    body.innerHTML = `
      <div class="form-group">
        <label class="form-label">Consecutivo</label>
        <input type="text" class="form-input" value="${Utils.sanitize(e.Consecutivo)}" readonly style="opacity:0.5">
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Proveedor</label>
          <input type="text" class="form-input" value="${Utils.sanitize(e.ProveedorNombre)}" readonly style="opacity:0.5">
        </div>
        <div class="form-group">
          <label class="form-label">Producto</label>
          <input type="text" class="form-input" value="${Utils.sanitize(e.ProductoNombre)}" readonly style="opacity:0.5">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Peso Báscula</label>
          <input type="text" class="form-input" value="${Utils.formatWeight(e.PesoBascula)}" readonly style="opacity:0.5">
        </div>
        <div class="form-group">
          <label class="form-label">Peso Libre (Neto)</label>
          <input type="text" class="form-input" value="${Utils.formatWeight(e.PesoLibre)}" readonly style="color:var(--clr-accent-cyan);font-weight:700">
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Observaciones / Comentarios</label>
        <textarea id="edit-entrada-comentarios" class="form-textarea">${Utils.sanitize(e.Comentarios || '')}</textarea>
      </div>
      ${Auth.isSupervisor() && e.Estado !== 'Anulada' ? `
      <div style="margin-top:var(--sp-4);padding-top:var(--sp-4);border-top:1px solid var(--clr-border)">
        <p style="font-size:0.78rem;color:var(--clr-text-muted);margin-bottom:var(--sp-3)">Zona de supervisor</p>
        <button type="button" class="btn btn-danger btn-sm" id="btn-anular-entrada">🚫 Anular esta entrada</button>
      </div>` : ''}
    `;

    // Anular button
    document.getElementById('btn-anular-entrada')?.addEventListener('click', async () => {
      if (!confirm(`¿Anular la entrada ${id}? Esta acción no se puede deshacer.`)) return;
      const r = await API.post('anularEntrada', { id });
      if (r.ok) {
        Utils.showToast(`Entrada ${id} anulada.`, 'warning');
        Maestros.closeModal();
        initGrid(_currentPage);
      } else {
        Utils.showToast(r.error, 'error');
      }
    });

    document.getElementById('modal-save-btn').onclick = async () => {
      const comentarios = document.getElementById('edit-entrada-comentarios')?.value || '';
      const r = await API.post('editarEntrada', { id, comentarios });
      if (r.ok) {
        Utils.showToast('Entrada actualizada.', 'success');
        Maestros.closeModal();
        initGrid(_currentPage);
      } else {
        Utils.showToast(r.error, 'error');
      }
    };

    modal.style.display = 'flex';
  }

  // Search with debounce
  const _debouncedSearch = Utils.debounce(() => initGrid(1), 300);

  function initSearchListeners() {
    document.getElementById('entradas-busqueda')?.addEventListener('input', _debouncedSearch);
    ['entradas-filter-proveedor','entradas-filter-producto','entradas-filter-estado',
     'entradas-filter-desde','entradas-filter-hasta'].forEach(id => {
      document.getElementById(id)?.addEventListener('change', () => initGrid(1));
    });
  }

  return { init: initGrid, initForm, initGrid, _calcularPeso, _addCanasilla, _removeCanasilla,
           _openDetalle, _generatePDF, _openEdit, initSearchListeners };
})();

// ===== BASKET FLOW — CANASILLAS MODULE =====
const Canasillas = (() => {
  async function init() {
    const [resSummary, resStock] = await Promise.all([
      API.get('getStockResumen'),
      API.get('getStockDetalle'),
    ]);

    if (resSummary.ok) {
      _setEl('can-total-stock',     resSummary.totalStock);
      _setEl('can-empresa',         resSummary.empresa);
      _setEl('can-clientes',        resSummary.conClientes);
      _setEl('can-proveedores',     resSummary.conProveedores);
      _setEl('can-alertas-count',   resSummary.alertas);
    }

    if (resStock.ok) _renderStock(resStock.stock || []);
    await _loadMovimientos();
  }

  function _setEl(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  }

  function _renderStock(stock) {
    const grid = document.getElementById('canasillas-stock-grid');
    if (!grid) return;
    const config = parseInt(App.getMasters()?.config?.find?.(c=>c.Clave==='stock_minimo_empresa')?.Valor || 50, 10);
    grid.innerHTML = stock.map(s => {
      const low = s.PropietarioTipo === 'Empresa' && parseInt(s.StockActual, 10) < config;
      return `
        <div class="stock-card ${low ? 'alert-stock' : ''}">
          <div class="stock-owner">${Utils.sanitize(s.PropietarioNombre)} — ${Utils.sanitize(s.PropietarioTipo)}</div>
          <div class="stock-quantity">${s.StockActual}</div>
          <div class="stock-peso">${Utils.formatWeight(s.PesoUnitario)} c/u</div>
          ${low ? '<div class="stock-delta" style="color:var(--clr-danger)">⚠ Stock bajo</div>' : ''}
        </div>`;
    }).join('') || '<div class="empty-state"><p class="empty-state-title">Sin stock registrado</p></div>';
  }

  async function _loadMovimientos(page = 1) {
    const res = await API.get('getMovimientos', { page, size: 50 });
    if (!res.ok) return;
    const tbody = document.getElementById('movimientos-body');
    if (!tbody) return;
    tbody.innerHTML = (res.items || []).map(m => `
      <tr>
        <td class="mono">${Utils.formatDate(m.FechaHora)} ${Utils.formatTime(m.FechaHora)}</td>
        <td><span class="badge ${m.Tipo==='Salida'?'badge-warning':m.Tipo==='Retorno'?'badge-active':'badge-inactive'}">${m.Tipo}</span></td>
        <td>${Utils.sanitize(m.PropietarioNombre)}</td>
        <td class="mono">${m.Cantidad}</td>
        <td class="mono">${Utils.formatWeight(m.PesoUnitario)}</td>
        <td class="mono">${Utils.sanitize(m.ReferenciaDoc)}</td>
        <td>${Utils.sanitize(m.UsuarioNombre)}</td>
      </tr>`
    ).join('');
  }

  return { init };
})();

// ===== BASKET FLOW — DEVOLUCIONES MODULE =====
const Devoluciones = (() => {
  let _step = 1;
  let _entradaActual = null;

  async function init() {
    _step = 1;
    _entradaActual = null;
    _showStep(1);
    await _loadGrid();

    document.getElementById('dev-buscar-btn')?.addEventListener('click', _buscarEntrada);
    document.getElementById('dev-crear-btn')?.addEventListener('click', _crearDevolucion);
  }

  function _showStep(step) {
    [1,2,3].forEach(s => {
      const el = document.getElementById(`dev-step-${s}`);
      if (el) el.style.display = s === step ? 'block' : 'none';
    });
    document.querySelectorAll('.step').forEach((el, i) => {
      el.classList.toggle('active', i + 1 === step);
      el.classList.toggle('done', i + 1 < step);
    });
  }

  async function _buscarEntrada() {
    const ref = document.getElementById('dev-ref-entrada')?.value?.trim();
    if (!ref) { Utils.showToast('Ingresa el consecutivo de la entrada.', 'warning'); return; }
    const res = await API.get('getEntrada', { id: ref });
    if (!res.ok || !res.entrada) { Utils.showToast('Entrada no encontrada.', 'error'); return; }
    if (res.entrada.Estado === 'Anulada') { Utils.showToast('No se puede devolver una entrada anulada.', 'error'); return; }

    _entradaActual = res.entrada;
    _renderEntradaResumen(res.entrada);
    _step = 2;
    _showStep(2);
  }

  function _renderEntradaResumen(e) {
    const el = document.getElementById('dev-entrada-resumen');
    if (!el) return;
    el.innerHTML = `
      <div class="detalle-grid">
        <div class="detalle-field"><div class="detalle-field-label">Consecutivo</div><div class="detalle-field-value mono">${Utils.sanitize(e.Consecutivo)}</div></div>
        <div class="detalle-field"><div class="detalle-field-label">Proveedor</div><div class="detalle-field-value">${Utils.sanitize(e.ProveedorNombre)}</div></div>
        <div class="detalle-field"><div class="detalle-field-label">Producto</div><div class="detalle-field-value">${Utils.sanitize(e.ProductoNombre)}</div></div>
        <div class="detalle-field"><div class="detalle-field-label">Peso Libre</div><div class="detalle-field-value mono" style="color:var(--clr-accent-cyan)">${Utils.formatWeight(e.PesoLibre)}</div></div>
      </div>`;
  }

  async function _crearDevolucion() {
    if (!_entradaActual) return;
    const payload = {
      entradaRef:   _entradaActual.Consecutivo,
      motivo:       document.getElementById('dev-motivo')?.value,
      motivoTexto:  document.getElementById('dev-motivo-texto')?.value,
      pesoDevuelto: parseFloat(document.getElementById('dev-peso')?.value),
      comentarios:  document.getElementById('dev-comentarios')?.value,
      canasillasRetorno: [],
    };
    if (!payload.motivo) { Utils.showToast('Selecciona el motivo.', 'warning'); return; }
    if (!payload.pesoDevuelto || payload.pesoDevuelto <= 0) { Utils.showToast('Ingresa el peso devuelto.', 'warning'); return; }

    const res = await API.post('crearDevolucion', payload);
    if (res.ok) {
      Utils.showToast(`Devolución ${res.consecutivo} creada. Pendiente de aprobación.`, 'success');
      _step = 3;
      _showStep(3);
      const confEl = document.getElementById('dev-confirmacion');
      if (confEl) confEl.innerHTML = `
        <div class="success-icon" style="margin-bottom:var(--sp-4)">
          <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
        </div>
        <p style="font-weight:700;font-size:1.1rem;margin-bottom:8px">${res.consecutivo}</p>
        <p style="color:var(--clr-text-muted);font-size:0.82rem">La devolución está pendiente de aprobación por un Supervisor.</p>`;
      await _loadGrid();
    } else {
      Utils.showToast(res.error, 'error');
    }
  }

  async function _loadGrid(page = 1) {
    const res = await API.get('getDevoluciones', { page, size: 25 });
    if (!res.ok) return;
    const tbody = document.getElementById('devoluciones-body');
    if (!tbody) return;
    tbody.innerHTML = (res.items || []).map(d => `
      <tr>
        <td class="mono">${Utils.sanitize(d.Consecutivo)}</td>
        <td class="mono">${Utils.sanitize(d.EntradaRef)}</td>
        <td>${Utils.formatDate(d.FechaHora)}</td>
        <td>${Utils.sanitize(d.Motivo)}</td>
        <td class="mono">${Utils.formatWeight(d.PesoDevuelto)}</td>
        <td><span class="badge ${d.Estado==='Aprobada'?'badge-active':d.Estado==='Rechazada'?'badge-danger':'badge-pending'}">${Utils.sanitize(d.Estado)}</span></td>
        <td>${Utils.sanitize(d.AprobadoPor||'—')}</td>
        ${Auth.isSupervisor() && d.Estado === 'Pendiente' ? `
        <td>
          <button class="btn btn-primary btn-sm" onclick="Devoluciones._aprobar('${Utils.sanitize(d.Consecutivo)}')">Aprobar</button>
          <button class="btn btn-danger btn-sm" onclick="Devoluciones._rechazar('${Utils.sanitize(d.Consecutivo)}')">Rechazar</button>
        </td>` : '<td>—</td>'}
      </tr>`
    ).join('');
  }

  async function _aprobar(id) {
    if (!confirm(`¿Aprobar devolución ${id}?`)) return;
    const res = await API.post('aprobarDevolucion', { id });
    if (res.ok) { Utils.showToast('Devolución aprobada.', 'success'); await _loadGrid(); }
    else Utils.showToast(res.error, 'error');
  }

  async function _rechazar(id) {
    const motivo = prompt('Motivo del rechazo:');
    if (!motivo) return;
    const res = await API.post('rechazarDevolucion', { id, motivo });
    if (res.ok) { Utils.showToast('Devolución rechazada.', 'warning'); await _loadGrid(); }
    else Utils.showToast(res.error, 'error');
  }

  return { init, _aprobar, _rechazar };
})();

// ===== BASKET FLOW — MAESTROS MODULE =====
const Maestros = (() => {
  // In-memory store: id → { item, tipo } — evita JSON en onclick HTML
  const _store = {};
  let _currentTab = 'Proveedores';

  async function init() {
    _currentTab = 'Proveedores';
    await _loadTab('Proveedores');

    document.querySelectorAll('[data-maestro-tab]').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('[data-maestro-tab]').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        _currentTab = tab.dataset.maestroTab;
        _loadTab(_currentTab);
      });
    });

    document.getElementById('maestro-nuevo-btn')?.addEventListener('click', () => _openModal(null, _currentTab));
  }

  async function _loadTab(tipo) {
    // Skeleton mientras carga
    const tbody = document.getElementById('maestros-body');
    if (tbody) tbody.innerHTML = Array(4).fill(
      '<tr>' + Array(5).fill('<td><div class="skeleton skeleton-text"></div></td>').join('') + '</tr>'
    ).join('');

    const res = await API.get('getMaestros');
    if (!res.ok) { Utils.showToast('Error al cargar maestros.', 'error'); return; }
    App.invalidateMasters();

    const key   = { Proveedores:'proveedores', Clientes:'clientes', Productos:'productos', TiposCanasilla:'canasillas' }[tipo] || 'proveedores';
    const items = res[key] || [];
    items.forEach(item => { _store[item.ID] = { item: { ...item }, tipo }; });
    _renderTab(items, tipo);
  }

  function _renderTab(items, tipo) {
    const tbody = document.getElementById('maestros-body');
    if (!tbody) return;

    if (items.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--clr-text-muted);padding:var(--sp-7)">
        Sin registros. Usa <strong>+ Nuevo</strong> para crear el primero.
      </td></tr>`;
      return;
    }

    tbody.innerHTML = items.map(item => {
      const id      = Utils.sanitize(item.ID);
      const nombre  = Utils.sanitize(item.Nombre || item.Descripcion || '—');
      const detalle = Utils.sanitize(
        tipo === 'TiposCanasilla' ? `${item.PesoUnitario} kg` :
        tipo === 'Productos'      ? (item.UnidadMedida  || '—') :
        tipo === 'Clientes'       ? (item.Tipo          || '—') :
        (item.Documento          || '—')
      );
      return `
        <tr>
          <td class="mono" style="font-size:0.72rem;color:var(--clr-text-muted)">${id}</td>
          <td style="font-weight:600">${nombre}</td>
          <td>${detalle}</td>
          <td><span class="badge ${item.Activo ? 'badge-active' : 'badge-inactive'}">
            <span class="badge-dot"></span>${item.Activo ? 'Activo' : 'Inactivo'}
          </span></td>
          <td style="white-space:nowrap">
            <button class="btn btn-secondary btn-sm" onclick="Maestros._editById('${id}')">✏ Editar</button>
            <button class="btn btn-ghost btn-sm" onclick="Maestros._toggleById('${id}')">
              ${item.Activo ? 'Desactivar' : 'Activar'}
            </button>
          </td>
        </tr>`;
    }).join('');
  }

  function _editById(id) {
    const s = _store[id];
    if (!s) { Utils.showToast('Recarga la página para editar.', 'warning'); return; }
    _openModal(s.item, s.tipo);
  }

  async function _toggleById(id) {
    const s = _store[id];
    if (!s) return;
    const nuevoActivo = !s.item.Activo;
    const label = s.item.Nombre || s.item.Descripcion || id;
    if (!confirm(nuevoActivo ? `¿Activar "${label}"?` : `¿Desactivar "${label}"?`)) return;
    const res = await API.post('toggleActivoMaestro', { tipo: s.tipo, id, activo: nuevoActivo });
    if (res.ok) {
      Utils.showToast(nuevoActivo ? 'Activado.' : 'Desactivado.', nuevoActivo ? 'success' : 'warning');
      App.invalidateMasters();
      _loadTab(s.tipo);
    } else { Utils.showToast(res.error || 'Error.', 'error'); }
  }

  function _openModal(item = null, tipo = null) {
    const t     = tipo || _currentTab;
    const modal = document.getElementById('modal-overlay');
    const body  = document.getElementById('modal-body-content');
    const title = document.getElementById('modal-title');
    if (!modal || !body) return;

    const isEdit    = !!item?.ID;
    const tipoLabel = { Proveedores:'Proveedor', Clientes:'Cliente', Productos:'Producto', TiposCanasilla:'Tipo de Canasilla' }[t] || t;
    if (title) title.textContent = isEdit ? `Editar ${tipoLabel}` : `Nuevo ${tipoLabel}`;

    const FIELDS = {
      Proveedores:    [['Nombre','Nombre',true],['Documento','Doc. / NIT',false],['Telefono','Teléfono',false],['Email','Email',false]],
      Clientes:       [['Nombre','Nombre',true],['Documento','Documento',false],['Tipo','Tipo (mayorista/minorista/plataforma)',false],['Contacto','Contacto',false],['Email','Email',false]],
      Productos:      [['Nombre','Nombre',true],['UnidadMedida','Unidad de Medida',false],['Categoria','Categoría',false]],
      TiposCanasilla: [['Descripcion','Descripción',true],['PesoUnitario','Peso Unitario (kg)',true]],
    };
    const fields = FIELDS[t] || [];

    body.innerHTML = [
      isEdit ? `<div class="form-group"><label class="form-label">ID</label><input class="form-input" value="${Utils.sanitize(item.ID)}" readonly style="opacity:0.45;font-family:var(--font-mono);font-size:0.75rem"></div>` : '',
      ...fields.map(([key, label, req]) => `
        <div class="form-group">
          <label class="form-label">${label}${req ? ' <span class="required">*</span>' : ''}</label>
          <input type="text" id="mf-${key}" class="form-input"
                 value="${Utils.sanitize(item?.[key] ?? '')}" placeholder="${label}">
        </div>`),
    ].join('');

    document.getElementById('modal-save-btn').onclick = async () => {
      let valid = true;
      fields.filter(f => f[2]).forEach(([key]) => {
        const el = document.getElementById(`mf-${key}`);
        const ok = el?.value.trim().length > 0;
        el?.classList.toggle('invalid', !ok);
        if (!ok) valid = false;
      });
      if (!valid) { Utils.showToast('Completa los campos obligatorios.', 'warning'); return; }

      const saveBtn = document.getElementById('modal-save-btn');
      saveBtn.disabled = true; saveBtn.textContent = 'Guardando...';

      const data = { ID: item?.ID || null };
      fields.forEach(([key]) => { data[key] = document.getElementById(`mf-${key}`)?.value.trim() || ''; });
      const res = await API.post('saveMaestro', { tipo: t, data });

      saveBtn.disabled = false; saveBtn.textContent = 'Guardar';

      if (res.ok) {
        Utils.showToast(isEdit ? 'Registro actualizado.' : 'Registro creado.', 'success');
        App.invalidateMasters();
        closeModal();
        _loadTab(t);
      } else { Utils.showToast(res.error || 'Error al guardar.', 'error'); }
    };

    modal.style.display = 'flex';
  }

  function closeModal() {
    const m = document.getElementById('modal-overlay');
    if (m) m.style.display = 'none';
    const t = document.getElementById('modal-title');
    if (t) t.textContent = 'Formulario';
    const btn = document.getElementById('modal-save-btn');
    if (btn) { btn.disabled = false; btn.textContent = 'Guardar'; }
  }

  return { init, _editById, _toggleById, closeModal };
})();

// ===== BASKET FLOW — USUARIOS MODULE =====
const Usuarios = (() => {
  async function init() {
    const res = await API.get('getUsuarios');
    if (!res.ok) { Utils.showToast('Sin permisos para ver usuarios.', 'error'); return; }

    const tbody = document.getElementById('usuarios-body');
    if (!tbody) return;

    // Store en memoria para edición segura
    Usuarios._store = {};
    (res.usuarios || []).forEach(u => { Usuarios._store[u.ID] = u; });

    tbody.innerHTML = (res.usuarios || []).map(u => {
      const id = Utils.sanitize(u.ID);
      return `
      <tr>
        <td style="font-weight:600">${Utils.sanitize(u.Nombre)}</td>
        <td class="mono">${Utils.sanitize(u.Email)}</td>
        <td><span class="badge role-${u.Rol}">${Utils.sanitize(u.Rol)}</span></td>
        <td><span class="badge ${u.Activo ? 'badge-active' : 'badge-inactive'}">
          <span class="badge-dot"></span>${u.Activo ? 'Activo' : 'Inactivo'}
        </span></td>
        <td class="mono" style="font-size:0.78rem">${u.UltimoAcceso ? Utils.formatDateTime(u.UltimoAcceso) : '—'}</td>
        <td style="white-space:nowrap">
          <button class="btn btn-secondary btn-sm" onclick="Usuarios._editModal('${id}')" title="Editar nombre y rol">✏ Editar</button>
          <button class="btn btn-ghost btn-sm" onclick="Usuarios._resetPw('${id}')" title="Reset contraseña">🔑 PW</button>
          <button class="btn btn-ghost btn-sm ${u.Activo ? '' : 'btn-danger'}" onclick="Usuarios._toggle('${id}')">
            ${u.Activo ? 'Desact.' : 'Activar'}
          </button>
        </td>
      </tr>`; }).join('');


    document.getElementById('usuario-nuevo-btn')?.addEventListener('click', _openCreateModal);
  }

  function _openCreateModal() {
    const modal = document.getElementById('modal-overlay');
    const body  = document.getElementById('modal-body-content');
    const title = document.getElementById('modal-title');
    if (!modal || !body) return;
    if (title) title.textContent = 'Nuevo Usuario';
    body.innerHTML = `
      <div class="form-group"><label class="form-label">Nombre completo <span class="required">*</span></label><input type="text" id="u-nombre" class="form-input" placeholder="Nombre Apellido"></div>
      <div class="form-group"><label class="form-label">Email <span class="required">*</span></label><input type="email" id="u-email" class="form-input" placeholder="usuario@empresa.com"></div>
      <div class="form-group"><label class="form-label">Contraseña <span class="required">*</span></label><input type="password" id="u-pw" class="form-input" placeholder="Mínimo 8 caracteres"></div>
      <div class="form-group"><label class="form-label">Rol <span class="required">*</span></label>
        <select id="u-rol" class="form-select">
          <option value="operador">Operador — Registra entradas</option>
          <option value="supervisor">Supervisor — Aprueba devoluciones</option>
          <option value="readonly">Solo Lectura — Solo consulta</option>
          <option value="admin">Admin — Acceso completo</option>
        </select>
      </div>`;
    document.getElementById('modal-save-btn').onclick = async () => {
      const nombre   = document.getElementById('u-nombre')?.value.trim();
      const email    = document.getElementById('u-email')?.value.trim();
      const password = document.getElementById('u-pw')?.value;
      if (!nombre || !email || !password) { Utils.showToast('Completa todos los campos obligatorios.', 'warning'); return; }
      const res = await API.post('crearUsuario', { nombre, email, password, rol: document.getElementById('u-rol')?.value });
      if (res.ok) { Utils.showToast('Usuario creado.', 'success'); Maestros.closeModal(); init(); }
      else Utils.showToast(res.error, 'error');
    };
    modal.style.display = 'flex';
  }

  function _editModal(id) {
    const u = Usuarios._store?.[id];
    if (!u) { Utils.showToast('Recarga para editar este usuario.', 'warning'); return; }
    const modal = document.getElementById('modal-overlay');
    const body  = document.getElementById('modal-body-content');
    const title = document.getElementById('modal-title');
    if (!modal || !body) return;
    if (title) title.textContent = `Editar Usuario`;
    body.innerHTML = `
      <div class="form-group">
        <label class="form-label">Email (no editable)</label>
        <input type="email" class="form-input" value="${Utils.sanitize(u.Email)}" readonly style="opacity:0.45;font-family:var(--font-mono)">
      </div>
      <div class="form-group">
        <label class="form-label">Nombre completo <span class="required">*</span></label>
        <input type="text" id="eu-nombre" class="form-input" value="${Utils.sanitize(u.Nombre)}">
      </div>
      <div class="form-group">
        <label class="form-label">Rol <span class="required">*</span></label>
        <select id="eu-rol" class="form-select">
          <option value="operador" ${u.Rol==='operador'?'selected':''}>Operador</option>
          <option value="supervisor" ${u.Rol==='supervisor'?'selected':''}>Supervisor</option>
          <option value="readonly" ${u.Rol==='readonly'?'selected':''}>Solo Lectura</option>
          <option value="admin" ${u.Rol==='admin'?'selected':''}>Admin</option>
        </select>
      </div>`;
    document.getElementById('modal-save-btn').onclick = async () => {
      const nombre = document.getElementById('eu-nombre')?.value.trim();
      if (!nombre) { Utils.showToast('El nombre es obligatorio.', 'warning'); return; }
      const res = await API.post('editarUsuario', { id, nombre, rol: document.getElementById('eu-rol')?.value });
      if (res.ok) { Utils.showToast('Usuario actualizado.', 'success'); Maestros.closeModal(); init(); }
      else Utils.showToast(res.error, 'error');
    };
    modal.style.display = 'flex';
  }

  async function _resetPw(id) {
    if (!confirm('¿Resetear contraseña? Se generará una clave temporal.')) return;
    const res = await API.post('resetPassword', { userId: id });
    if (res.ok) {
      alert(`Contraseña temporal: ${res.tempPassword}\n\n⚠️ Guárdala ahora, no se mostrará de nuevo.`);
    } else Utils.showToast(res.error, 'error');
  }

  async function _toggle(id) {
    const res = await API.post('toggleActivoUsuario', { userId: id });
    if (res.ok) init();
    else Utils.showToast(res.error, 'error');
  }

  return { init, _editModal, _resetPw, _toggle };
})();

// ===== BASKET FLOW — REPORTES MODULE =====
const Reportes = (() => {
  function init() {
    document.querySelectorAll('.report-card[data-report]').forEach(card => {
      card.addEventListener('click', () => {
        document.querySelectorAll('.report-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        _showReportParams(card.dataset.report);
      });
    });
  }

  function _showReportParams(type) {
    const el = document.getElementById('report-params');
    if (!el) return;
    const masters = App.getMasters();

    const comunes = `
      <div class="form-row">
        <div class="form-group"><label class="form-label">Fecha desde</label><input type="date" id="rp-desde" class="form-input"></div>
        <div class="form-group"><label class="form-label">Fecha hasta</label><input type="date" id="rp-hasta" class="form-input" value="${Utils.getToday('iso')}"></div>
      </div>`;

    const provSelect = `<div class="form-group"><label class="form-label">Proveedor</label>
      <select id="rp-proveedor" class="form-select">
        ${(masters.proveedores||[]).map(p => `<option value="${p.ID}">${p.Nombre}</option>`).join('')}
      </select></div>`;

    const cliSelect = `<div class="form-group"><label class="form-label">Cliente</label>
      <select id="rp-cliente" class="form-select">
        ${(masters.clientes||[]).map(c => `<option value="${c.ID}">${c.Nombre}</option>`).join('')}
      </select></div>`;

    const maps = {
      diario:    `<div class="form-group"><label class="form-label">Fecha del reporte</label><input type="date" id="rp-fecha" class="form-input" value="${Utils.getToday('iso')}"></div>`,
      proveedor: comunes + provSelect,
      cliente:   comunes + cliSelect,
      inventario: '<p style="color:var(--clr-text-muted);font-size:0.82rem">El reporte de inventario se genera al momento actual.</p>',
    };

    el.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:var(--sp-4)">
        ${maps[type] || ''}
        <div style="display:flex;gap:var(--sp-3)">
          <button class="btn btn-primary" onclick="Reportes._generate('${type}')">📄 Generar PDF</button>
        </div>
      </div>`;
  }

  async function _generate(type) {
    if (type === 'inventario') {
      const [resStock, resAlertas] = await Promise.all([
        API.get('getStockDetalle'),
        API.get('getAlertas'),
      ]);
      if (resStock.ok) {
        PDF.generateInventarioPDF({ stock: resStock.stock, alertas: resAlertas.alertas || [] });
      }
      return;
    }

    if (type === 'diario') {
      const fecha = document.getElementById('rp-fecha')?.value;
      const res   = await API.get('getReporteDiario', { fecha });
      if (res.ok) PDF.generateReportePDF(res);
      else Utils.showToast(res.error, 'error');
      return;
    }

    if (type === 'proveedor') {
      const res = await API.get('getReporteProveedor', {
        proveedorId: document.getElementById('rp-proveedor')?.value,
        desde: document.getElementById('rp-desde')?.value,
        hasta: document.getElementById('rp-hasta')?.value,
      });
      if (res.ok) Utils.showToast(`Reporte de ${res.proveedor}: ${res.totalEntregas} entregas / ${Utils.formatWeight(res.totalKg)}`, 'success');
      else Utils.showToast(res.error, 'error');
    }
  }

  return { init, _generate };
})();

// ===== BASKET FLOW — LOG MODULE =====
const Log = (() => {
  const PAGE_SIZE = 100;
  let _allItems = [];   // todos los traídos del backend
  let _filtered  = [];  // después del filtro cliente
  let _page      = 1;

  async function init() {
    _page = 1;
    // Fecha hasta = hoy por defecto
    const hoy = Utils.getToday('iso');
    const hastaEl = document.getElementById('log-hasta');
    if (hastaEl && !hastaEl.value) hastaEl.value = hoy;

    // Enter en búsqueda dispara búsqueda
    document.getElementById('log-busqueda')?.addEventListener('keydown', e => {
      if (e.key === 'Enter') buscar();
    });

    await buscar();
  }

  async function buscar() {
    const desde    = document.getElementById('log-desde')?.value    || '';
    const hasta    = document.getElementById('log-hasta')?.value    || '';
    const modulo   = document.getElementById('log-modulo')?.value   || '';
    const resultado= document.getElementById('log-resultado')?.value|| '';
    const texto    = (document.getElementById('log-busqueda')?.value || '').trim().toLowerCase();

    const tbody = document.getElementById('log-body');
    if (tbody) tbody.innerHTML = Array(5).fill(
      '<tr>' + Array(8).fill('<td><div class="skeleton skeleton-text"></div></td>').join('') + '</tr>'
    ).join('');

    const res = await API.get('getLog', { page: 1, size: 2000, desde, hasta, modulo, resultado });
    if (!res.ok) { Utils.showToast('Sin permisos para ver el log.', 'error'); return; }

    _allItems = res.items || [];

    // Filtro texto en cliente (rápido)
    _filtered = texto
      ? _allItems.filter(l =>
          (l.UsuarioNombre||'').toLowerCase().includes(texto) ||
          (l.Accion||'').toLowerCase().includes(texto)       ||
          (l.Modulo||'').toLowerCase().includes(texto)       ||
          (l.Referencia||'').toLowerCase().includes(texto)   ||
          (l.Detalle||'').toLowerCase().includes(texto)
        )
      : [..._allItems];

    _page = 1;
    _renderPage();
  }

  function _renderPage() {
    const tbody = document.getElementById('log-body');
    if (!tbody) return;

    const total = _filtered.length;
    const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    _page = Math.min(_page, pages);

    const start = (_page - 1) * PAGE_SIZE;
    const slice = _filtered.slice(start, start + PAGE_SIZE);

    // Contador
    const countEl = document.getElementById('log-count');
    if (countEl) countEl.textContent = `${total.toLocaleString()} registro${total !== 1 ? 's' : ''}`;

    // Info paginación
    const infoEl = document.getElementById('log-pagination-info');
    if (infoEl) infoEl.textContent = total > 0
      ? `Mostrando ${start + 1}–${Math.min(start + PAGE_SIZE, total)} de ${total}`
      : '';

    tbody.innerHTML = slice.length === 0
      ? '<tr><td colspan="8" style="text-align:center;color:var(--clr-text-muted);padding:var(--sp-6)">Sin registros para los filtros seleccionados.</td></tr>'
      : slice.map(l => `
        <tr>
          <td class="mono" style="white-space:nowrap;font-size:0.75rem">${Utils.formatDateTime(l.Timestamp)}</td>
          <td>${Utils.sanitize(l.UsuarioNombre)}</td>
          <td><span class="badge role-${l.Rol}">${Utils.sanitize(l.Rol)}</span></td>
          <td class="log-action">${Utils.sanitize(l.Accion)}</td>
          <td><span style="font-size:0.78rem;color:var(--clr-text-muted)">${Utils.sanitize(l.Modulo)}</span></td>
          <td class="mono" style="font-size:0.75rem">${Utils.sanitize(l.Referencia||'—')}</td>
          <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;font-size:0.78rem">${Utils.sanitize(l.Detalle||'')}</td>
          <td><span class="badge ${l.Resultado==='OK'?'badge-active':'badge-danger'}">${Utils.sanitize(l.Resultado)}</span></td>
        </tr>`).join('');

    // Paginación
    _renderPagination(pages);
  }

  function _renderPagination(pages) {
    const el = document.getElementById('log-pagination');
    if (!el) return;
    if (pages <= 1) { el.innerHTML = ''; return; }

    const btns = [];
    if (_page > 1) btns.push(`<button class="btn btn-ghost btn-sm" onclick="Log._goPage(${_page - 1})">← Anterior</button>`);

    // Páginas cercanas
    const start = Math.max(1, _page - 2);
    const end   = Math.min(pages, _page + 2);
    for (let p = start; p <= end; p++) {
      btns.push(`<button class="btn ${p === _page ? 'btn-primary' : 'btn-ghost'} btn-sm" onclick="Log._goPage(${p})">${p}</button>`);
    }
    if (_page < pages) btns.push(`<button class="btn btn-ghost btn-sm" onclick="Log._goPage(${_page + 1})">Siguiente →</button>`);

    el.innerHTML = btns.join('');
  }

  function _goPage(p) {
    _page = p;
    _renderPage();
    document.getElementById('view-log')?.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function limpiarFiltros() {
    ['log-busqueda','log-desde','log-hasta'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    const hastaEl = document.getElementById('log-hasta');
    if (hastaEl) hastaEl.value = Utils.getToday('iso');
    document.getElementById('log-modulo')   && (document.getElementById('log-modulo').value    = '');
    document.getElementById('log-resultado') && (document.getElementById('log-resultado').value = '');
    buscar();
  }

  return { init, buscar, limpiarFiltros, _goPage };
})();

// ===== BASKET FLOW — CONSIGNACION MODULE =====
const Consignacion = (() => {
  let _diasAlerta = 15;

  async function init() {
    _initTabs();
    await _cargarCatalogos();
    const activeTab = document.querySelector('.tab.active[data-consig-tab]')?.dataset.consigTab || 'Clientes';
    if (activeTab === 'Clientes') await cargarResumen('Cliente');
    else if (activeTab === 'Proveedores') await cargarResumen('Proveedor');
  }

  async function _cargarCatalogos() {
    const masters = App.getMasters();
    if (masters) {
      const selCan = document.getElementById('mc-canasilla');
      if (selCan) selCan.innerHTML = '<option value="">Seleccione...</option>' +
        (masters.canasillas || []).filter(c=>c.Activo).map(c => `<option value="${c.ID}">${Utils.sanitize(c.Descripcion)} (${c.PesoUnitario} kg)</option>`).join('');
      const hsTipo = document.getElementById('consig-hist-tipo-entidad');
      if (hsTipo) { hsTipo.onchange = () => _populateHistEntidades(); _populateHistEntidades(); }
    }
  }

  function _populateHistEntidades() {
    const tipo = document.getElementById('consig-hist-tipo-entidad')?.value;
    const sel  = document.getElementById('consig-hist-entidad');
    if (!sel || !tipo) return;
    const masters = App.getMasters();
    const items = tipo === 'Cliente' ? (masters.clientes || []) : (masters.proveedores || []);
    sel.innerHTML = '<option value="">Todas las entidades...</option>' +
      items.map(i => `<option value="${i.ID}">${Utils.sanitize(i.Nombre)}</option>`).join('');
  }

  function _initTabs() {
    document.querySelectorAll('[data-consig-tab]').forEach(tab => {
      const newTab = tab.cloneNode(true);
      if (tab.parentNode) tab.parentNode.replaceChild(newTab, tab);
      newTab.addEventListener('click', () => {
        document.querySelectorAll('[data-consig-tab]').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.consig-tab-content').forEach(c => c.style.display = 'none');
        newTab.classList.add('active');
        const tabName = newTab.dataset.consigTab;
        const target = document.getElementById(`consig-tab-${tabName}`);
        if (target) target.style.display = 'block';
        if (tabName === 'Historial') cargarHistorial();
        else if (tabName === 'Clientes') cargarResumen('Cliente');
        else if (tabName === 'Proveedores') cargarResumen('Proveedor');
      });
    });
  }

  async function cargarResumen(entidadTipo) {
    const tbody = document.getElementById(entidadTipo === 'Cliente' ? 'consig-clientes-body' : 'consig-proveedores-body');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="8"><div class="skeleton-text"></div></td></tr>';
    const res = await API.get('getResumenConsignacion');
    if (!res.ok) return;
    _diasAlerta = res.diasAlerta || 15;
    const items = (res.resumen || []).filter(r => r.entidadTipo === entidadTipo);
    tbody.innerHTML = items.map(r => {
      const crit = r.diasSinRetorno >= _diasAlerta * 2 ? 'danger' : r.diasSinRetorno >= _diasAlerta ? 'warning' : 'success';
      const label = r.diasSinRetorno >= _diasAlerta * 2 ? 'CRÍTICO' : r.diasSinRetorno >= _diasAlerta ? 'ALERTA' : 'OK';
      return `<tr>
        <td style="font-weight:600">${Utils.sanitize(r.entidadNombre)}</td>
        <td class="mono" style="font-size:0.75rem">${Utils.sanitize(r.tipo)}</td>
        <td style="text-align:center">${r.enviadas}</td>
        <td style="text-align:center">${r.retornadas}</td>
        <td style="text-align:center;font-weight:700;color:var(--clr-accent-cyan)">${r.saldo}</td>
        <td style="text-align:center">${entidadTipo==='Cliente'?r.diasSinRetorno:(r.ultimoRetorno?Utils.formatDate(r.ultimoRetorno):'—')}</td>
        ${entidadTipo==='Cliente'?`<td style="text-align:center"><span class="badge badge-${crit}">${label}</span></td>`:''}
        <td><button class="btn btn-ghost btn-sm" onclick="Consignacion.abrirModal('RETORNO', '${entidadTipo}', '${r.entidadId}', '${r.tipoCanasillaId}')">Devolución</button></td>
      </tr>`;
    }).join('') || `<tr><td colspan="8" style="text-align:center;padding:var(--sp-6);color:var(--clr-text-muted)">Sin saldos pendientes.</td></tr>`;
  }

  async function cargarHistorial() {
    const tbody = document.getElementById('consig-historial-body');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="7"><div class="skeleton-text"></div></td></tr>';
    const entidadTipo = document.getElementById('consig-hist-tipo-entidad')?.value || 'Cliente';
    const entidadId   = document.getElementById('consig-hist-entidad')?.value || '';
    const tipo        = document.getElementById('consig-hist-tipo-mvt')?.value || '';
    const res = await API.get('getHistorialConsignacion', { entidadId, entidadTipo, tipo });
    if (!res.ok) return;
    tbody.innerHTML = (res.items || []).map(m => `<tr>
      <td class="mono" style="font-size:0.75rem">${Utils.formatDateTime(m.Timestamp)}</td>
      <td><span class="badge ${m.Type==='ENVIO'?'badge-inactive':'badge-active'}">${m.Tipo}</span></td>
      <td>${Utils.sanitize(m.EntidadNombre)} <small style="display:block;color:grey">${m.EntidadTipo}</small></td>
      <td>${Utils.sanitize(m.TipoCanasillaNombre)}</td>
      <td style="font-weight:700">${m.Cantidad}</td>
      <td class="mono" style="font-size:0.75rem">${Utils.sanitize(m.Referencia||'—')}</td>
      <td>${Utils.sanitize(m.UsuarioNombre)}</td>
    </tr>`).join('') || '<tr><td colspan="7" style="text-align:center;padding:var(--sp-5);color:var(--clr-text-muted)">Sin movimientos.</td></tr>';
  }

  function abrirModal(tipo, entidadTipo = 'Cliente', entidadId = '', tipoCanasillaId = '') {
    const modal = document.getElementById('modal-consig');
    if (!modal) return;
    document.getElementById('mc-tipo').value = tipo;
    document.getElementById('mc-entidad-tipo').value = entidadTipo;
    const masters = App.getMasters();
    const items = entidadTipo === 'Cliente' ? (masters.clientes || []) : (masters.proveedores || []);
    document.getElementById('mc-entidad').innerHTML = '<option value="">Seleccione...</option>' +
      items.filter(i=>i.Activo).map(i => `<option value="${i.ID}">${Utils.sanitize(i.Nombre)}</option>`).join('');
    document.getElementById('mc-entidad').value = entidadId;
    document.getElementById('mc-canasilla').value = tipoCanasillaId;
    document.getElementById('mc-cantidad').value = '';
    document.getElementById('mc-referencia').value = '';
    document.getElementById('mc-notas').value = '';
    document.getElementById('mc-entidad-label').textContent = `${entidadTipo} *`;
    document.getElementById('modal-consig-title').textContent = `${tipo==='ENVIO'?'Suministrar':'Recibir'} de ${entidadTipo}`;
    modal.style.display = 'flex';
  }

  async function guardar() {
    const payload = {
      tipo: document.getElementById('mc-tipo').value,
      entidadTipo: document.getElementById('mc-entidad-tipo').value,
      entidadId: document.getElementById('mc-entidad').value,
      tipoCanasillaId: document.getElementById('mc-canasilla').value,
      cantidad: parseInt(document.getElementById('mc-cantidad').value) || 0,
      referencia: document.getElementById('mc-referencia').value,
      notas: document.getElementById('mc-notas').value
    };
    if (!payload.entidadId || payload.cantidad <= 0) { Utils.showToast('Datos incompletos','warning'); return; }
    const res = await API.post('registrarMovimientoConsignacion', payload);
    if (res.ok) {
      Utils.showToast('Guardado correctamente','success');
      document.getElementById('modal-consig').style.display = 'none';
      cargarResumen(payload.entidadTipo);
    } else Utils.showToast(res.error, 'error');
  }

  async function enviarAlertaManual() {
    if (!confirm('¿Forzar alerta de correo?')) return;
    const res = await API.post('enviarAlertaConsignacion');
    if (res.ok) Utils.showToast('Alerta enviada','success');
    else Utils.showToast(res.error, 'error');
  }

  return { init, abrirModal, guardar, cargarResumen, cargarHistorial, enviarAlertaManual };
})();

// ===== BASKET FLOW — BAJAS MODULE =====
const Bajas = (() => {
  async function init() {
    await loadHistory(); await loadStats();
    ['btn-nueva-baja','baja-save-btn'].forEach(id => {
      const el = document.getElementById(id); if (!el) return;
      const n = el.cloneNode(true); el.parentNode.replaceChild(n, el);
      n.addEventListener('click', id==='btn-nueva-baja'?abrirModal:guardar);
    });
  }
  function abrirModal() {
    const m = document.getElementById('modal-baja'); if (!m) return;
    document.getElementById('baja-canasilla').innerHTML = (App.getMasters().canasillas||[]).map(t => `<option value="${t.ID}">${t.Descripcion}</option>`).join('');
    m.style.display = 'flex';
  }
  async function guardar() {
    const p = { tipoCanasillaId: document.getElementById('baja-canasilla').value, cantidad: parseInt(document.getElementById('baja-cantidad').value), motivo: document.getElementById('baja-motivo').value, notas: document.getElementById('baja-notas').value };
    if (!p.cantidad || p.cantidad <= 0) return Utils.showToast('Indique cantidad válida','warning');
    const res = await API.post('registrarBaja', p);
    if (res.ok) { Utils.showToast('Baja registrada','success'); document.getElementById('modal-baja').style.display = 'none'; init(); }
    else Utils.showToast(res.error,'error');
  }
  async function loadHistory() {
    const tbody = document.getElementById('bajas-history-body'); if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="6"><div class="skeleton-text"></div></td></tr>';
    const res = await API.get('getBajasHistory'); if (!res.ok) return;
    tbody.innerHTML = (res.items || []).map(b => `<tr>
      <td class="mono">${Utils.formatDate(b.Timestamp)}</td>
      <td>${Utils.sanitize(b.TipoCanasillaNombre)}</td>
      <td class="danger" style="font-weight:700">-${b.Cantidad}</td>
      <td><span class="badge badge-danger">${b.Motivo}</span></td>
      <td>${Utils.sanitize(b.UsuarioNombre)}</td>
      <td style="font-size:0.75rem">${Utils.sanitize(b.Notas||'—')}</td>
    </tr>`).join('') || '<tr><td colspan="6" style="text-align:center;color:var(--clr-text-muted)">Sin registros</td></tr>';
  }
  async function loadStats() {
    const res = await API.get('getBajasStats'); if (!res.ok) return;
    const s = res.stats;
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    set('bajas-kpi-rotura', s.ROTURA||0); set('bajas-kpi-perdida', s.PERDIDA||0); set('bajas-kpi-mes', s.total||0);
  }
  return { init, abrirModal, guardar };
})();

// ===== BASKET FLOW — CONFIGURACIÓN MODULE =====
const Configuracion = (() => {
  let _currentConfig = {};

  async function init() {
    _initTabs();
    await load();
    _setupEvents();
    toggleEdit(false);
  }

  function _initTabs() {
    document.querySelectorAll('[data-config-tab]').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('[data-config-tab]').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.config-tab-content').forEach(c => c.style.display = 'none');
        tab.classList.add('active');
        const targetId = `config-tab-${tab.dataset.configTab}`;
        if (document.getElementById(targetId)) document.getElementById(targetId).style.display = 'block';
      });
    });
  }

  async function load() {
    const masters = App.getMasters();
    const rows = masters.config || [];
    _currentConfig = {};
    rows.forEach(r => { _currentConfig[r.Clave] = r.Valor; });

    // Llenar campos Empresa
    const keys = [
      'empresa.nombre','empresa.nit','empresa.direccion','empresa.ciudad',
      'empresa.pais','empresa.moneda','empresa.telefono','empresa.movil',
      'empresa.email','empresa.web','empresa.logoId'
    ];
    keys.forEach(k => {
      const el = document.getElementById(`conf-${k.replace(/\./g, '-')}`);
      if (el) el.value = _currentConfig[k] || '';
    });

    // Llenar campos Sistema
    const sysKeys = {
      'consig.diasAlerta': 'conf-sys-diasAlerta',
      'consig.emailAdmin': 'conf-sys-emailAdmin',
      'consig.emailCopia': 'conf-sys-emailCopia',
      'stock_minimo_empresa':'conf-sys-stockMin'
    };
    Object.entries(sysKeys).forEach(([key, id]) => {
      const el = document.getElementById(id);
      if (el) el.value = _currentConfig[key] || '';
    });

    updatePreview();
    toggleEdit(false);
  }

  function _setupEvents() {
    document.getElementById('config-edit-btn')?.addEventListener('click', () => toggleEdit(true));
    document.getElementById('config-cancel-btn')?.addEventListener('click', () => {
       load(); // Recargar datos originales
       toggleEdit(false);
    });
    document.getElementById('config-save-btn')?.addEventListener('click', save);
  }

  function toggleEdit(editable) {
    const container = document.getElementById('view-configuracion');
    if (!container) return;

    // Tocar inputs y selects
    container.querySelectorAll('input, select').forEach(el => {
      el.disabled = !editable;
    });

    // Tocar botones
    const btnEdit = document.getElementById('config-edit-btn');
    const groupBtns = document.getElementById('config-editing-btns');

    if (btnEdit && groupBtns) {
      btnEdit.style.display = editable ? 'none' : 'inline-flex';
      groupBtns.style.display = editable ? 'flex' : 'none';
    }
  }

  function updatePreview() {
    const logoId = document.getElementById('conf-emp-logoId')?.value?.trim();
    const img = document.getElementById('logo-preview-img');
    const placeholder = document.getElementById('logo-preview-placeholder');
    
    if (logoId && logoId.length > 5) { // ID de Drive puede ser corto en algunos casos, mantenlo flexible
      let id = logoId;
      if (logoId.includes('id=')) id = logoId.split('id=')[1].split('&')[0];
      else if (logoId.includes('/d/')) id = logoId.split('/d/')[1].split('/')[0];

      if (img && placeholder) {
        img.src = `https://lh3.googleusercontent.com/u/0/d/${id}=w400-h200-iv`;
        img.onload = () => { img.style.display = 'block'; placeholder.style.display = 'none'; };
        img.onerror = () => { img.style.display = 'none'; placeholder.style.display = 'block'; placeholder.textContent = 'Sin acceso o ID inválido'; };
      }
    } else {
      if (img && placeholder) { img.style.display = 'none'; placeholder.style.display = 'block'; placeholder.textContent = 'Visualización del Logo'; }
    }
  }

  async function save() {
    const payload = {};
    
    // Recopilar campos Empresa
    const keys = [
      'empresa.nombre','empresa.nit','empresa.direccion','empresa.ciudad',
      'empresa.pais','empresa.moneda','empresa.telefono','empresa.movil',
      'empresa.email','empresa.web','empresa.logoId'
    ];
    keys.forEach(k => {
      const val = document.getElementById(`conf-${k.replace(/\./g, '-')}`)?.value || '';
      payload[k] = val;
    });

    // Recopilar campos Sistema
    const sysKeys = {
      'consig.diasAlerta': 'conf-sys-diasAlerta',
      'consig.emailAdmin': 'conf-sys-emailAdmin',
      'consig.emailCopia': 'conf-sys-emailCopia',
      'stock_minimo_empresa':'conf-sys-stockMin'
    };
    Object.entries(sysKeys).forEach(([key, id]) => {
      const val = document.getElementById(id)?.value || '';
      payload[key] = val;
    });

    const btn = document.getElementById('config-save-btn');
    btn.disabled = true;
    btn.textContent = 'GUARDANDO...';

    const res = await API.post('saveConfig', payload);
    btn.disabled = false;
    btn.textContent = 'GUARDAR CAMBIOS';

    if (res.ok) {
      Utils.showToast('Configuración actualizada con éxito','success');
      App.invalidateMasters();
      await App.init(); // Recargar App (masters, branding, etc)
      toggleEdit(false);
    } else {
      Utils.showToast(res.error, 'error');
    }
  }

  function get(key) { return _currentConfig[key] || ''; }

  return { init, updatePreview, save, get, toggleEdit };
})();
