/**
 * Sync a Supabase (PostgREST).
 *
 * - Escritura: cada lectura se inserta en la tabla `readings` (service_role).
 *   Crea el esquema con `supabase-schema.sql` (raíz del repo).
 * - Lectura: `fetchRecent(deviceId, limit)` recupera las últimas lecturas para
 *   rellenar el historial local cuando el disco de la instancia se reinicia
 *   (plan Free de Render) o cuando la cuota de Tuya está agotada.
 *
 * Requiere: SYNC_SUPABASE_URL + SYNC_SUPABASE_SERVICE_KEY (rol service_role).
 */
import { NUMERIC_KEYS } from '../store.js';

const SELECT_COLUMNS = ['device_id', 'ts', 'source', 'online', ...NUMERIC_KEYS].join(',');
// Columnas que existen desde la primera versión del esquema (tablas antiguas sin balance_kwh).
const CORE_COLUMNS = [
  'device_id', 'ts', 'source', 'online',
  'voltage_l1', 'voltage_l2', 'voltage_l3', 'current', 'power', 'power_factor', 'temperature', 'energy_kwh',
].join(',');

const toNumberOrNull = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Fila de PostgREST/Postgres → snapshot normalizado. */
export function rowToSnapshot(row) {
  const snapshot = {
    ts: typeof row.ts === 'number' ? row.ts : Date.parse(row.ts),
    device_id: row.device_id,
    source: row.source || 'tuya',
    online: row.online !== false,
  };
  for (const k of NUMERIC_KEYS) snapshot[k] = toNumberOrNull(row[k]);
  return snapshot;
}

export function createSupabaseClient({ url, key, table, log }) {
  const base = url.replace(/\/+$/, '');
  const endpoint = `${base}/rest/v1/${table}`;
  const headers = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    Prefer: 'return=minimal',
  };

  const rowOf = (snapshot) => {
    const row = {
      device_id: snapshot.device_id,
      ts: new Date(snapshot.ts).toISOString(),
      source: snapshot.source,
      online: snapshot.online,
    };
    for (const k of NUMERIC_KEYS) row[k] = snapshot[k];
    return row;
  };

  return {
    table,
    async push(snapshot) {
      const res = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify(rowOf(snapshot)) });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Supabase ${res.status}: ${text.slice(0, 220)}`);
      }
    },
    /** Últimas `limit` lecturas de un dispositivo, ordenadas de más antigua a más reciente. */
    async fetchRecent(deviceId, limit = 5000) {
      const request = (columns) => {
        const qs = new URLSearchParams();
        qs.set('device_id', `eq.${deviceId}`);
        qs.set('select', columns);
        qs.set('order', 'ts.desc');
        qs.set('limit', String(Math.max(1, limit)));
        return fetch(`${endpoint}?${qs.toString()}`, {
          headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/json' },
        });
      };

      let res = await request(SELECT_COLUMNS);
      if (res.status === 400) {
        // Probable columna inexistente (tabla creada con un esquema anterior).
        res = await request(CORE_COLUMNS);
      }
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Supabase lectura ${res.status}: ${text.slice(0, 220)}`);
      }
      const rows = await res.json();
      const snaps = rows.map(rowToSnapshot).filter((s) => Number.isFinite(s.ts));
      snaps.sort((a, b) => a.ts - b.ts);
      return snaps;
    },
  };
}

/** Compatibilidad: syncer de escritura clásico. */
export function createSupabaseSyncer({ url, key, table, log }) {
  const client = createSupabaseClient({ url, key, table, log });
  log.info(`Sync Supabase activado → ${table}`);
  return (snapshot) => client.push(snapshot);
}
