/**
 * LY-C100A Energy Dashboard — arranque del backend.
 *
 * - Crea el store (historial NDJSON), el origen de datos (Tuya Cloud API o
 *   simulador demo), los syncers (Supabase/Firebase) y los canales
 *   REST + Socket.IO.
 * - Sonda el medidor en bucle con backoff exponencial ante errores y emite
 *   cada lectura por Socket.IO (`reading`).
 *
 * En producción sirve además el frontend compilado (web/dist) en la misma
 * raíz: `npm run build && npm start`.
 */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import express from 'express';
import { Server } from 'socket.io';

import { config, isTuyaConfigured, tuyaBaseUrl } from './config.js';
import { createLogger } from './logger.js';
import { TuyaCloudClient } from './tuya/client.js';
import { createDemoSource, createTuyaSource } from './tuya/sources.js';
import { ReadingStore } from './store.js';
import { createSyncers } from './sync/index.js';
import { createApiRouter } from './routes/api.js';
import { attachSocket } from './socket.js';

const log = createLogger('main');

// ---------------------------------------------------------------- contexto
const runtime = {
  kind: 'none', // 'tuya' | 'demo' | 'none'
  meta: null,
  codes: [],
  latest: null,
  state: { lastPollAt: null, lastPollOk: null, lastError: null, attempts: 0 },
};

const ctx = { config, runtime };

// ---------------------------------------------------------------- store
const store = await new ReadingStore({
  file: config.historyFile,
  retentionDays: config.retentionDays,
  log,
}).load();
ctx.store = store;

// ---------------------------------------------------------------- origen
let source = null;

if (config.demo) {
  source = createDemoSource({
    deviceId: config.tuyaDeviceId || 'ly-c100a-demo',
    log,
  });
  runtime.kind = 'demo';
  runtime.meta = source.meta;
  runtime.codes = source.codes;
  log.info('Modo DEMO: datos sintéticos de 2 fases (sin Tuya Cloud)');
} else if (isTuyaConfigured()) {
  const client = new TuyaCloudClient({
    clientId: config.tuyaClientId,
    secret: config.tuyaSecret,
    baseUrl: tuyaBaseUrl(),
  });
  source = createTuyaSource({ client, deviceId: config.tuyaDeviceId, energyScale: config.energyScale, log });
  runtime.kind = 'tuya';
  log.info(`Origen Tuya Cloud API (${config.region}) · dispositivo ${config.tuyaDeviceId}`);
} else {
  log.warn(
    'Sin fuente de datos: define TUYA_CLIENT_ID / TUYA_CLIENT_SECRET / TUYA_DEVICE_ID ' +
      'o lanza con TUYA_DEMO=1 (simulador).'
  );
}

// ---------------------------------------------------------------- sync
const sync = await createSyncers(config, log);
ctx.sync = sync;

// ---------------------------------------------------------------- historial demo
if (config.demo && store.getLatest() === null) {
  log.info('Sembrando historial demo de 7 días (1 lectura/minuto)…');
  const SEED_MS = 7 * 86_400_000;
  const STEP_MS = 60_000;
  const seed = [];
  const startTs = Date.now() - SEED_MS;
  for (let ts = startTs; ts <= Date.now(); ts += STEP_MS) {
    const res = source.tick(ts);
    if (res.ok && res.snapshot) seed.push(res.snapshot);
  }
  await store.appendMany(seed);
  log.info(`Historial demo sembrado: ${seed.length} lecturas`);
}

// ---------------------------------------------------------------- HTTP + Sockets
const app = express();
app.disable('x-powered-by');
app.use(express.json());

app.use('/api', createApiRouter(ctx));

// Frontend compilado (si existe web/dist)
const distIndex = path.join(config.webDist, 'index.html');
if (fs.existsSync(distIndex)) {
  app.use(express.static(config.webDist, { index: false, maxAge: '1h' }));
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api') || req.path.startsWith('/socket.io')) {
      return next();
    }
    res.sendFile(distIndex);
  });
  log.info(`Sirviendo frontend desde ${config.webDist}`);
} else {
  app.get('/', (req, res) => {
    res
      .status(200)
      .type('html')
      .send(
        '<h1>Backend LY-C100A funcionando ✅</h1><p>El frontend no está compilado. ' +
          'Ejecuta <code>npm install</code> y <code>npm run dev</code> en la raíz, ' +
          'o <code>npm run build</code> para servir la web desde aquí.</p>'
      );
  });
}

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: config.corsOrigin ? config.corsOrigin.split(',') : true,
    methods: ['GET', 'POST'],
  },
  transports: ['websocket', 'polling'],
});
const ws = attachSocket(io, ctx);
log.info('Socket.IO listo (websocket + polling)');

// ---------------------------------------------------------------- sondeo
const MAX_BACKOFF_MS = 120_000;
let timer = null;
let delay = config.pollIntervalMs;

async function tickOnce() {
  if (!source) return; // modo 'none': sin sondeo

  runtime.state.attempts += 1;
  const markPoll = (ok, error = null) => {
    runtime.state.lastPollAt = Date.now();
    runtime.state.lastPollOk = ok;
    runtime.state.lastError = error;
    ws.emitPoll();
  };

  try {
    const res = await source.tick();

    if (res.ok) {
      if (res.meta) runtime.meta = res.meta;
      if (res.codes) runtime.codes = res.codes;

      if (res.offline) {
        // Dispositivo fuera de línea: conservamos los últimos valores.
        const last = runtime.latest || store.getLatest();
        const snapshot = last ? { ...last, ts: Date.now(), online: false } : null;
        if (snapshot) {
          runtime.latest = snapshot;
          await store.append(snapshot);
          ws.emitReading(snapshot);
        }
        markPoll(false, 'Dispositivo sin conexión (código 2001)');
        log.warn('Medidor sin conexión: se conserva la última telemetría');
      } else if (res.snapshot) {
        runtime.latest = res.snapshot;
        await store.append(res.snapshot);
        ws.emitReading(res.snapshot);
        sync.push(res.snapshot); // fuego-y-olvido (errores internos ya registrados)
        markPoll(true);
        delay = config.pollIntervalMs; // reset de backoff
      }
    } else {
      markPoll(false, res.error.message);
      if (res.fatal) {
        log.error(`Sondeo fallido (fatal): ${res.error.message}`);
      } else {
        log.warn(`Sondeo fallido: ${res.error.message}`);
      }
      if (res.error?.code === 1004) {
        log.error('Signatura inválida: revisa TUYA_CLIENT_ID / TUYA_CLIENT_SECRET.');
      } else if (res.error?.code === 1106) {
        log.error('Permiso denegado (1106): autoriza la API «IoT Core» para el proyecto en iot.tuya.com.');
      } else if (res.error?.code === 2010) {
        log.error('Dispositivo inexistente (2010): revisa TUYA_DEVICE_ID.');
      }
      delay = Math.min(Math.max(delay * 2, config.pollIntervalMs), MAX_BACKOFF_MS);
      log.warn(`Próximo intento en ${Math.round(delay / 1000)} s`);
    }
  } catch (err) {
    markPoll(false, err.message);
    log.error(`Error interno del sondeo: ${err.message}`);
  } finally {
    if (source) timer = setTimeout(tickOnce, delay);
  }
}

// ---------------------------------------------------------------- arranque
server.listen(config.port, () => {
  log.info(`API + Socket.IO escuchando en http://localhost:${config.port}`);
  log.info('Rutas: /api/health · /api/device · /api/status · /api/latest · /api/history');
  if (source) {
    timer = setTimeout(tickOnce, 500);
    log.info(`Sondeo cada ${Math.round(config.pollIntervalMs / 1000)} s`);
  }
});

function shutdown(signal) {
  log.info(`${signal} recibido, cerrando…`);
  if (timer) clearTimeout(timer);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

export { io };
