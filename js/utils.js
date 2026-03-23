// ===== BASKET FLOW — UTILITIES =====

const Utils = (() => {

  // ── Date & Time ──────────────────────────────────────
  function formatDate(ts, format = 'short') {
    const d = ts instanceof Date ? ts : new Date(ts);
    if (isNaN(d)) return '—';
    const day   = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year  = d.getFullYear();
    const yy    = String(year).slice(2);
    if (format === 'long') {
      const months = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
      return `${d.getDate()} de ${months[d.getMonth()]} de ${year}`;
    }
    if (format === 'short') return `${day}/${month}/${yy}`;
    if (format === 'iso')   return `${year}-${month}-${day}`;
    return `${day}/${month}/${year}`;
  }

  function formatTime(ts) {
    const d = ts instanceof Date ? ts : new Date(ts);
    if (isNaN(d)) return '—';
    return d.toLocaleTimeString('es-CO', { hour12: false });
  }

  function formatDateTime(ts) {
    return `${formatDate(ts)} · ${formatTime(ts)}`;
  }

  function getToday(format = 'iso') {
    return formatDate(new Date(), format);
  }

  // ── Numbers & Weights ──────────────────────────────────
  function formatWeight(kg) {
    if (kg === null || kg === undefined || kg === '') return '0.0 kg';
    const n = parseFloat(kg);
    if (isNaN(n)) return '0.0 kg';
    return `${n.toFixed(1)} kg`;
  }

  function formatNumber(n, decimals = 0) {
    if (n === null || n === undefined) return '—';
    return Number(n).toLocaleString('es-CO', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  }

  // ── Consecutives ──────────────────────────────────────
  function formatConsecutive(n, prefix = 'BF') {
    const year = new Date().getFullYear();
    return `${prefix}-${year}-${String(n).padStart(5, '0')}`;
  }

  // ── Debounce & Throttle ──────────────────────────────────
  function debounce(fn, ms = 300) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), ms);
    };
  }

  function throttle(fn, ms = 300) {
    let last = 0;
    return (...args) => {
      const now = Date.now();
      if (now - last >= ms) { last = now; fn(...args); }
    };
  }

  // ── SHA-256 (SubtleCrypto) ──────────────────────────────────
  async function sha256(str) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
  }

  // ── Validation ──────────────────────────────────────
  function validateEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).toLowerCase());
  }

  function sanitize(str) {
    const div = document.createElement('div');
    div.textContent = String(str || '');
    return div.innerHTML;
  }

  // ── Toast ──────────────────────────────────────
  function showToast(message, type = 'info', duration = 4000) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const icons = {
      success: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
      error:   '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
      warning: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
      info:    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
    };

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `${icons[type] || icons.info}<span>${sanitize(message)}</span>`;
    container.appendChild(toast);

    setTimeout(() => toast.remove(), duration + 250);
  }

  // ── Local Cache (TTL) ──────────────────────────────────
  function cacheSet(key, data, ttlHours = 4) {
    try {
      localStorage.setItem(`bf_cache_${key}`, JSON.stringify({
        data,
        expires: Date.now() + ttlHours * 3600 * 1000
      }));
    } catch(e) { /* storage full or private mode */ }
  }

  function cacheGet(key) {
    try {
      const raw = localStorage.getItem(`bf_cache_${key}`);
      if (!raw) return null;
      const { data, expires } = JSON.parse(raw);
      if (Date.now() > expires) { localStorage.removeItem(`bf_cache_${key}`); return null; }
      return data;
    } catch(e) { return null; }
  }

  function cacheClear(key) {
    localStorage.removeItem(`bf_cache_${key}`);
  }

  function cacheClearAll() {
    Object.keys(localStorage).filter(k => k.startsWith('bf_cache_')).forEach(k => localStorage.removeItem(k));
  }

  // ── ID Generator (client-side) ──────────────────────────
  function uid() {
    return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2,7)}`;
  }

  // ── Excel Export (simple CSV) ──────────────────────────
  function exportCSV(data, headers, filename = 'basket_flow_export.csv') {
    const rows = [headers.join(',')];
    data.forEach(row => {
      rows.push(headers.map(h => {
        const v = String(row[h] ?? '').replace(/"/g, '""');
        return v.includes(',') || v.includes('\n') ? `"${v}"` : v;
      }).join(','));
    });
    const blob = new Blob(['\uFEFF' + rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── Offline detection ──────────────────────────────────
  function initOfflineDetection() {
    const banner = document.getElementById('offline-banner');
    if (!banner) return;
    const update = () => {
      banner.classList.toggle('visible', !navigator.onLine);
    };
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    update();
  }

  return {
    formatDate, formatTime, formatDateTime, getToday,
    formatWeight, formatNumber, formatConsecutive,
    debounce, throttle, sha256,
    validateEmail, sanitize,
    showToast,
    cacheSet, cacheGet, cacheClear, cacheClearAll,
    uid, exportCSV, initOfflineDetection
  };
})();
