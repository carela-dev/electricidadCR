/**
 * Carga de configuración por variables de entorno.
 * Admite un archivo `.env` en:  directorio actual, server/ o raíz del repo.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const SERVER_ROOT = path.resolve(__dirname, '..');
export const REPO_ROOT = path.resolve(SERVER_ROOT, '..');

function loadEnvFiles() {
  const candidates = [
    path.join(process.cwd(), '.env'),
    path.join(SERVER_ROOT, '.env'),
    path.join(REPO_ROOT, '.env'),
  ];
  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    const text = fs.readFileSync(file, 'utf8');
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (!m) continue;
      const [, key, value] = m;
      if (!(key in process.env)) process.env[key] = value.replace(/^["']|["']$/g, '');
    }
    break; // primer .env encontrado (cwd > server > raíz)
  }
}
loadEnvFiles();

const toNum = (v, fallback) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};
const toBool = (v, fallback = false) =>
  v === undefined || v === null ? fallback : /^(1|true|yes|on)$/i.test(String(v));

/** Dominios públicos de la Open API de Tuya por región. */
export const TUYA_BASE_URLS = {
  cn: 'https://openapi.tuyacn.com',
  us: 'https://openapi.tuyaus.com',
  eu: 'https://openapi.tuyaeu.com',
  in: 'https://openapi.tuyain.com',
};

export const config = {
  port: toNum(process.env.PORT, 4000),

  region: String(process.env.TUYA_REGION || 'eu').toLowerCase(),
  tuyaClientId: process.env.TUYA_CLIENT_ID || process.env.TUYA_ACCESS_ID || '',
  tuyaSecret: process.env.TUYA_CLIENT_SECRET || process.env.TUYA_ACCESS_SECRET || '',
  tuyaDeviceId: (process.env.TUYA_DEVICE_ID || '').trim(),

  demo: toBool(process.env.TUYA_DEMO),
  pollIntervalMs: Math.max(3000, toNum(process.env.TUYA_POLL_INTERVAL_MS, 10000)),
  energyScale: toNum(process.env.TUYA_ENERGY_SCALE, 1),

  dataDir: process.env.DATA_DIR || path.join(SERVER_ROOT, 'data'),
  retentionDays: Math.max(1, toNum(process.env.HISTORY_RETENTION_DAYS, 7)),
  historyFile: path.join(process.env.DATA_DIR || path.join(SERVER_ROOT, 'data'), 'readings.ndjson'),

  syncSupabaseUrl: (process.env.SYNC_SUPABASE_URL || '').trim(),
  syncSupabaseKey: process.env.SYNC_SUPABASE_SERVICE_KEY || process.env.SYNC_SUPABASE_KEY || '',
  syncSupabaseTable: process.env.SYNC_SUPABASE_TABLE || 'readings',

  firebaseServiceAccount: (process.env.SYNC_FIREBASE_SERVICE_ACCOUNT || '').trim(),
  firebaseCollection: process.env.SYNC_FIREBASE_COLLECTION || 'readings',

  webDist: process.env.WEB_DIST || path.join(REPO_ROOT, 'web', 'dist'),
  corsOrigin: process.env.CORS_ORIGIN || '',
};

/** ¿Hay credenciales Tuya suficientes para sondear el dispositivo? */
export const isTuyaConfigured = () =>
  Boolean(config.tuyaClientId && config.tuyaSecret && config.tuyaDeviceId);

export const tuyaBaseUrl = () => TUYA_BASE_URLS[config.region] || TUYA_BASE_URLS.eu;
