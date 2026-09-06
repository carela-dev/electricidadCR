/**
 * LY-C100A Energy Dashboard — arranque del backend (multi-casa).
 *
 * Cada casa configurada en TUYA_DEVICES (o el modo clásico de una sola) tiene:
 *   - su propio origen de datos (Tuya Cloud API real o simulador demo),
 *   - su ReadingStore (historial NDJSON propio en data/<casa>.ndjson),
 *   - su bucle de sondeo independiente con backoff,
 *   - su estado (última lectura, errores, DPs) expuesto por REST/Socket.
 *
 * El acceso por casa queda protegido con PIN cuando la casa lo define.
 */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import express from 'express';
import { Server } from 'socket.io';

import { config, devices, credsFor } from './config.js';
import { createLogger } from './logger.js';
import { TuyaCloudClient } from './tuya/client.js';
import { createDemoSource, createTuyaSource } from './tuya/sources.js';
import { ReadingStore } from './store.js';
import { createSyncers } from './sync/index.js';
import { createApiRouter } from './routes/api.js';
import { attachSocket } from './socket.js';

const log = createLogger('main');

// ---------------------------------------------------------------- contexto
const houses = [];
const houseById = new Map();
const ctx = { config, houses, houseById };

const fileSlug = (id) => String(id).replace(/[^a-zA-Z0-9_-]/g, '-');

// ---------------------------------------------------------------- casas
for (let i = 0; i < devices.length; i += 1) {
  const device = devices[i];
  const house = {
    device,
    kind: 'none', // 'tuya' | 'demo' | 'none'
    meta: null,
    codes: [],
    latest: null,
    state: { lastPollAt: null, lastPollOk: null, lastError: null, attempts: 0 },
    store: null,
    source: null,
    timer: null,
  };

  const store = await new ReadingStore({
    file: path.join(config.dataDir, `${fileSlug(device.id)}.ndjson`),
    retentionDays: config.retentionDays,
    log: createLogger(`store:${device.id}`),
  }).load();
  house.store = store;

  if (config.demo) {
    house.kind = 'demo';
    house.source = createDemoSource({
      deviceId: device.deviceId || `${device.id}-demo`,
      name: device.name,
      log: createLogger(`demo:${device.id}`),
      phaseShift: i * 137 + 41, // cada casa simula una curva distinta
    });
    house.meta = house.source.meta;
    house.codes = house.source.codes;
  } else if (device.deviceId && credsFor(device).clientId && credsFor(device).secret) {
    house.kind = 'tuya';
    const creds = credsFor(device);
    const client = new TuyaCloudClient({ clientId: creds.clientId, secret: creds.secret, baseUrl: creds.baseUrl });
    house.source = createTuyaSource({
      client,
      deviceId: device.deviceId,
      energyScale: config.energyScale,
      log: createLogger(`tuya:${device.id}`),
    });
  } else {
    log.warn(`Casa «${device.name}» sin datos: falta credencial Tuya o deviceId (o usa TUYA_DEMO=1)`);
  }

  houses.push(house);
  houseById.set(device.id, house);
  log.info(`Casa «${device.name}» (${device.id}) → modo ${house.kind}${device.pin ? ' · PIN protegida' : ''}`);
}

// ---------------------------------------------------------------- sync
const sync = await createSyncers(config, log);
ctx.sync = sync;

// ---------------------------------------------------------------- historial demo (siembra)
if (config.demo) {
  for (const house of houses) {
    if (house.store.getLatest() !== null) continue;
    log.info(`Sembrando historial demo de ${house.device.name} (7 días)…`);
    const SEED_MS = 7 * 86_400_000;
    const STEP_MS = 60_000;
    const seed = [];
    const startTs = Date.now() - SEED_MS;
    for (let ts = startTs; ts <= Date.now(); ts += STEP_MS) {
      const res = house.source.tick(ts);
      if (res.ok && res.snapshot) seed.push(res.snapshot);
    }
    await house.store.appendMany(seed);
    log.info(`Historial demo sembrado: ${seed.length} lecturas (${house.device.id})`);
  }
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
  cors: { origin: config.corsOrigin ? config.corsOrigin.split(',') : true, methods: ['GET', 'POST'] },
  transports: ['websocket', 'polling'],
});
const ws = attachSocket(io, ctx);
log.info('Socket.IO listo (websocket + polling, autenticado por casa)');

// ---------------------------------------------------------------- sondeo por casa
const MAX_BACKOFF_MS = 120_000;

async function tickOnce(house) {
  if (!house.source) return; // casa sin fuente: no sondea

  house.state.attempts += 1;
  const markPoll = (ok, error = null) => {
    house.state.lastPollAt = Date.now();
    house.state.lastPollOk = ok;
    house.state.lastError = error;
    ws.emitPoll(house.device.id);
  };

  try {
    const res = await house.source.tick();

    if (res.ok) {
      if (res.meta) house.meta = res.meta;
      if (res.codes) house.codes = res.codes;

      if (res.offline) {
        const last = house.latest || house.store.getLatest();
        const snapshot = last ? { ...last, ts: Date.now(), online: false } : null;
        if (snapshot) {
          house.latest = snapshot;
          await house.store.append(snapshot);
          ws.emitReading(house.device.id, snapshot);
        }
        markPoll(false, 'Dispositivo sin conexión (código 2001)');
        log.warn(`${house.device.name}: medidor sin conexión, se conserva la última telemetría`);
      } else if (res.snapshot) {
        house.latest = res.snapshot;
        await house.store.append(res.snapshot);
        ws.emitReading(house.device.id, res.snapshot);
        sync.push(res.snapshot); // fuego-y-olvido (errores internos ya registrados)
        markPoll(true);
        house.delay = config.pollIntervalMs;
      }
    } else {
      markPoll(false, res.error.message);
      if (res.error?.code === 1004) {
        log.error(`${house.device.name}: signatura inválida — revisa las credenciales Tuya.`);
      } else if (res.error?.code === 1106) {
        log.error(`${house.device.name}: permiso denegado (1106) — autoriza la API «IoT Core».`);
      } else if (res.error?.code === 2010) {
        log.error(`${house.device.name}: dispositivo inexistente (2010) — revisa su deviceId.`);
      }
      log.warn(`${house.device.name}: sondeo fallido — ${res.error.message}`);
      house.delay = Math.min(Math.max((house.delay || config.pollIntervalMs) * 2, config.pollIntervalMs), MAX_BACKOFF_MS);
      log.warn(`${house.device.name}: próximo intento en ${Math.round(house.delay / 1000)} s`);
    }
  } catch (err) {
    markPoll(false, err.message);
    log.error(`${house.device.name}: error interno del sondeo — ${err.message}`);
  } finally {
    if (house.source) {
      house.timer = setTimeout(() => tickOnce(house), house.delay || config.pollIntervalMs);
    }
  }
}

function startPollers() {
  for (const house of houses) {
    house.delay = config.pollIntervalMs;
    if (house.source) {
      house.timer = setTimeout(() => tickOnce(house), 500);
      log.info(`«${house.device.name}» sondea cada ${Math.round(config.pollIntervalMs / 1000)} s`);
    }
  }
}

// ---------------------------------------------------------------- arranque
server.listen(config.port, () => {
  log.info(`API + Socket.IO escuchando en http://localhost:${config.port}`);
  log.info('Rutas: /api/health · /api/devices · /api/{device,status,latest,history}?house=…');
  startPollers();
});

function shutdown(signal) {
  log.info(`${signal} recibido, cerrando…`);
  for (const house of houses) if (house.timer) clearTimeout(house.timer);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

export { io };
