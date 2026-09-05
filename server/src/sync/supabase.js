/**
 * Sync a Supabase (PostgREST). Cada lectura se inserta en una tabla
 * `readings` — crea el esquema con `supabase-schema.sql` (raíz del repo).
 * Requiere: SYNC_SUPABASE_URL + SYNC_SUPABASE_SERVICE_KEY (rol service_role).
 */
import { NUMERIC_KEYS } from '../store.js';

export function createSupabaseSyncer({ url, key, table, log }) {
  const endpoint = `${url.replace(/\/+$/, '')}/rest/v1/${table}`;
  log.info(`Sync Supabase activado → ${table}`);

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

  return async function pushToSupabase(snapshot) {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(rowOf(snapshot)),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Supabase ${res.status}: ${text.slice(0, 220)}`);
    }
  };
}
