/**
 * Cliente HTTP mínimo para la API del backend.
 * Todas las rutas son relativas: en desarrollo Vite las proxya al servidor.
 */
async function getJSON(url, timeoutMs = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status}${text ? `: ${text.slice(0, 140)}` : ''}`);
    }
    const json = await res.json();
    if (json && json.ok === false) throw new Error(json.error || 'Error del servidor');
    return json;
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('Tiempo de espera agotado');
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export function fetchHealth() {
  return getJSON('/api/health');
}

export function fetchDevice() {
  return getJSON('/api/device').then((j) => j.data);
}

export function fetchStatus() {
  return getJSON('/api/status').then((j) => j.data);
}

export function fetchLatest() {
  return getJSON('/api/latest').then((j) => j.data);
}

/**
 * Serie histórica.
 * @returns {Promise<{from:number,to:number,total:number,points:object[]}>}
 */
export function fetchHistory({ from, to, points = 600 }) {
  const qs = new URLSearchParams();
  qs.set('from', String(from));
  qs.set('to', String(to));
  qs.set('points', String(points));
  return getJSON(`/api/history?${qs.toString()}`).then((j) => j.data);
}
