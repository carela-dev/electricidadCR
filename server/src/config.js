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
const clean = (v) => String(v || '').trim();

/** Dominios públicos de la Open API de Tuya por región. */
export const TUYA_BASE_URLS = {
  cn: 'https://openapi.tuyacn.com',
  us: 'https://openapi.tuyaus.com',
  eu: 'https://openapi.tuyaeu.com',
  in: 'https://openapi.tuyain.com',
};

export const config = {
  port: toNum(process.env.PORT, 4000),

  // Credenciales globales (una cuenta de Tuya = un proyecto cloud)
  region: String(process.env.TUYA_REGION || 'eu').toLowerCase(),
  tuyaClientId: clean(process.env.TUYA_CLIENT_ID || process.env.TUYA_ACCESS_ID),
  tuyaSecret: clean(process.env.TUYA_CLIENT_SECRET || process.env.TUYA_ACCESS_SECRET),
  tuyaDeviceId: clean(process.env.TUYA_DEVICE_ID),

  demo: toBool(process.env.TUYA_DEMO),
  pollIntervalMs: Math.max(3000, toNum(process.env.TUYA_POLL_INTERVAL_MS, 10000)),
  energyScale: toNum(process.env.TUYA_ENERGY_SCALE, 1),

  dataDir: process.env.DATA_DIR || path.join(SERVER_ROOT, 'data'),
  retentionDays: Math.max(1, toNum(process.env.HISTORY_RETENTION_DAYS, 7)),

  syncSupabaseUrl: clean(process.env.SYNC_SUPABASE_URL),
  syncSupabaseKey: clean(process.env.SYNC_SUPABASE_SERVICE_KEY || process.env.SYNC_SUPABASE_KEY),
  syncSupabaseTable: process.env.SYNC_SUPABASE_TABLE || 'readings',

  firebaseServiceAccount: clean(process.env.SYNC_FIREBASE_SERVICE_ACCOUNT),
  firebaseCollection: process.env.SYNC_FIREBASE_COLLECTION || 'readings',

  webDist: process.env.WEB_DIST || path.join(REPO_ROOT, 'web', 'dist'),
  corsOrigin: process.env.CORS_ORIGIN || '',
};

/** Región efectiva por dispositivo (o la global). */
const regionOf = (d) => String(d.region || config.region).toLowerCase();

/**
 * Registro de casas/medidores. Cada entrada:
 *   { id, name, deviceId, pin?, clientId?, secret?, region? }
 * Se define con la variable TUYA_DEVICES (JSON) — útil para varias casas.
 * Si no existe, se mantiene el modo clásico de un solo dispositivo.
 */
export function resolveDevices() {
  const raw = clean(process.env.TUYA_DEVICES);
  if (raw) {
    let list;
    try {
      list = JSON.parse(raw);
    } catch (err) {
      throw new Error(`TUYA_DEVICES no es un JSON válido: ${err.message}`);
    }
    if (!Array.isArray(list) || !list.length) {
      throw new Error('TUYA_DEVICES debe ser un array con al menos una casa');
    }
    return list.map((d, i) => ({
      id: clean(d.id || d.house || `casa${i + 1}`),
      name: clean(d.name || `Casa ${i + 1}`),
      deviceId: clean(d.deviceId || d.device_id),
      pin: clean(d.pin ?? d.key ?? d.pin_code),
      clientId: clean(d.clientId || d.accessId),
      secret: clean(d.secret || d.accessSecret),
      region: regionOf(d),
    }));
  }

  // Modo clásico de una sola casa (compatibilidad)
  const id = config.demo
    ? 'casa4'
    : (config.tuyaDeviceId || 'default');
  return [
    {
      id,
      name: clean(process.env.TUYA_HOUSE_NAME) || 'Medidor',
      deviceId: config.tuyaDeviceId,
      pin: clean(process.env.TUYA_HOUSE_PIN),
      clientId: '',
      secret: '',
      region: config.region,
    },
  ];
}

export const devices = resolveDevices();
export const devicesById = new Map(devices.map((d) => [d.id, d]));

/** Credenciales efectivas (propias de la casa o las globales). */
export function credsFor(device) {
  return {
    clientId: device.clientId || config.tuyaClientId,
    secret: device.secret || config.tuyaSecret,
    baseUrl: TUYA_BASE_URLS[device.region] || TUYA_BASE_URLS.us,
    region: device.region,
  };
}

/** ¿Hay credenciales Tuya para sondear al menos una casa real? */
export const isTuyaConfigured = () =>
  devices.some((d) => {
    const c = credsFor(d);
    return Boolean(c.clientId && c.secret && d.deviceId);
  });

export function getDeviceById(id) {
  return devicesById.get(id) || null;
}

export const tuyaBaseUrl = () => TUYA_BASE_URLS[config.region] || TUYA_BASE_URLS.us;
