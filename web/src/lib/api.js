/**
 * Cliente HTTP mínimo para la API del backend (multi-casa).
 * Las rutas son relativas: en desarrollo Vite las proxya al servidor.
 * Las peticiones de datos llevan la casa activa (X-House-Id) y su PIN
 * (X-House-Pin) para el aislamiento entre casas.
 */

class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function getJSON(url, { house, pin, timeoutMs = 10000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const headers = { Accept: 'application/json' };
  if (house) headers['X-House-Id'] = house;
  if (pin) headers['X-House-Pin'] = pin;
  try {
    const res = await fetch(url, { signal: controller.signal, headers });
    if (res.status === 401) {
      let text = '';
      try {
        text = (await res.json()).error || '';
      } catch { /* sin cuerpo */ }
      throw new ApiError(401, text || 'PIN incorrecto');
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new ApiError(res.status, `HTTP ${res.status}${text ? `: ${text.slice(0, 140)}` : ''}`);
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

/** Lista pública de casas. */
export function fetchDevices() {
  return getJSON('/api/devices').then((j) => j.houses || []);
}

export function fetchHealth() {
  return getJSON('/api/health');
}

export function fetchDevice(access) {
  return getJSON('/api/device', access).then((j) => j.data);
}

export function fetchStatus(access) {
  return getJSON('/api/status', access).then((j) => j.data);
}

export function fetchLatest(access) {
  return getJSON('/api/latest', access).then((j) => j.data);
}

/**
 * Serie histórica de una casa.
 * access = { house, pin }.
 * @returns {Promise<{house,from,to,total,points}>}
 */
export function fetchHistory({ from, to, points = 600 }, access) {
  const qs = new URLSearchParams();
  qs.set('from', String(from));
  qs.set('to', String(to));
  qs.set('points', String(points));
  return getJSON(`/api/history?${qs.toString()}`, access).then((j) => j.data);
}
