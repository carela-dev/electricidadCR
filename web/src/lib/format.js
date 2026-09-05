/** Utilidades de formato (es-ES, decimales con coma). */

export function fmtNumber(value, decimals = 1) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('es-ES', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

/** Potencia con unidad automática: W → kW. */
export function fmtPower(watts) {
  if (watts === null || watts === undefined || !Number.isFinite(watts)) return { value: '—', unit: 'W' };
  if (Math.abs(watts) >= 1000) {
    return { value: fmtNumber(watts / 1000, 2), unit: 'kW' };
  }
  return { value: fmtNumber(watts, 0), unit: 'W' };
}

/** Delta formateada con signo. */
export function fmtDelta(current, previous, decimals = 1) {
  if (
    current === null || previous === null ||
    current === undefined || previous === undefined ||
    !Number.isFinite(current) || !Number.isFinite(previous)
  ) return null;
  const d = current - previous;
  const sign = d > 0 ? '+' : d < 0 ? '−' : '';
  return { sign, value: Math.abs(d), delta: d, pct: previous !== 0 ? (d / Math.abs(previous)) * 100 : null };
}

/** Intervalo «hace X s/min/h» desde epoch ms. */
export function ago(ts, now = Date.now()) {
  if (!ts) return 'nunca';
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 5) return 'ahora mismo';
  if (s < 60) return `hace ${s} s`;
  const m = Math.round(s / 60);
  if (m < 60) return `hace ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `hace ${h} h`;
  return `hace ${Math.round(h / 24)} d`;
}

export function clock(ts) {
  return ts ? new Date(ts).toLocaleTimeString('es-ES', { hour12: false }) : '—';
}

export function shortDeviceId(id) {
  if (!id) return '—';
  return id.length > 14 ? `${id.slice(0, 6)}…${id.slice(-6)}` : id;
}
