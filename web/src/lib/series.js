/**
 * Vistas temporales, paleta de series y utilidades de ejes para los gráficos.
 * La paleta fija garantiza el mismo color en cualquier tema; los colores
 * neutros (ejes/rejilla) se leen de las variables CSS del tema activo.
 */

export const VIEWS = [
  { id: 'live', label: 'Tiempo real', windowMs: 8 * 60_000, live: true },
  { id: '1h', label: '1 h', windowMs: 3_600_000, live: true },
  { id: '6h', label: '6 h', windowMs: 6 * 3_600_000, live: false },
  { id: '24h', label: '24 h', windowMs: 24 * 3_600_000, live: false },
  { id: '7d', label: '7 días', windowMs: 7 * 86_400_000, live: false },
];

export const viewById = (id) => VIEWS.find((v) => v.id === id) || VIEWS[0];
export const isLiveView = (id) => viewById(id).live;

export const SERIES = {
  voltage_l1: { label: 'Voltaje L1', css: '--c-l1', unit: 'V' },
  voltage_l2: { label: 'Voltaje L2', css: '--c-l2', unit: 'V' },
  voltage_l3: { label: 'Voltaje L3', css: '--c-l3', unit: 'V' },
  current: { label: 'Corriente', css: '--c-current', unit: 'A' },
  power: { label: 'Potencia activa', css: '--c-power', unit: 'W' },
  temperature: { label: 'Temperatura', css: '--c-temp', unit: '°C' },
  energy_kwh: { label: 'Consumo total', css: '--c-energy', unit: 'kWh' },
};

/** Color resuelto (hex) de una serie a partir de su variable CSS. */
export function colorOf(key) {
  const s = SERIES[key];
  return s ? cssVar(s.css, '#22d3ee') : '#22d3ee';
}

/** Resuelve una variable CSS del documento (para ejes y rejilla). */
export function cssVar(name, fallback = '#94a3b8') {
  if (typeof window === 'undefined') return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

export function chartTheme() {
  return {
    tick: cssVar('--text-faint', '#64748b'),
    grid: cssVar('--border', '#1c2a46'),
    cursor: cssVar('--border-strong', '#334155'),
    tooltipBg: cssVar('--surface-2', '#13203a'),
    tooltipText: cssVar('--text', '#e7eef9'),
    tooltipMuted: cssVar('--text-dim', '#9db0c9'),
  };
}

/** Formato del eje X según la vista. */
export function tickTime(ts, view) {
  if (!ts) return '';
  const d = new Date(ts);
  if (view === 'live') {
    return d.toLocaleTimeString('es-ES', { hour12: false, minute: '2-digit', second: '2-digit' });
  }
  if (view === '1h' || view === '6h') {
    return d.toLocaleTimeString('es-ES', { hour12: false, hour: '2-digit', minute: '2-digit' });
  }
  if (view === '24h') {
    return d.toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
}

export function tickFull(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleString('es-ES', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/** Eje Y con un pequeño margen alrededor del rango de datos. */
export const yDomainPad = (pad = 1) => [(dataMin) => Math.floor(dataMin - pad), (dataMax) => Math.ceil(dataMax + pad)];
