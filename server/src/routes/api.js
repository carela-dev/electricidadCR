/**
 * API REST del dashboard (multi-casa, con PIN por casa).
 *   GET /api/health                 público
 *   GET /api/devices                público (nombres + si exigen PIN)
 *   GET /api/device                 ?house=…  (+ PIN)
 *   GET /api/status                 ?house=…  (+ PIN)
 *   GET /api/latest                 ?house=…  (+ PIN)
 *   GET /api/history?from&to&points ?house=… (+ PIN)
 *
 * La casa se indica con el parámetro ?house= o la cabecera X-House-Id.
 * El PIN con la cabecera X-House-Pin (o ?pin=). Las casas sin PIN configurado
 * quedan abiertas (compatibilidad con el modo de un solo dispositivo).
 */
import { Router } from 'express';
import { devices, getDeviceById } from '../config.js';
import { devicePayload, housesPayload, statusPayload } from '../payloads.js';

const asyncHandler = (fn) => (req, res, next) => fn(req, res, next).catch(next);

const safeEqual = (a, b) => {
  const x = String(a || '');
  const y = String(b || '');
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i += 1) diff |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return diff === 0;
};

/**
 * Autentica la petición contra una casa. Devuelve el dispositivo config o
 * null tras responder 401/404.
 */
function authorize(req, res) {
  const id = String(req.query.house || req.headers['x-house-id'] || '').trim();
  let device = id ? getDeviceById(id) : null;

  if (!device && devices.length === 1) device = devices[0]; // modo 1 casa
  if (!device) {
    res.status(404).json({ ok: false, error: 'Casa no encontrada (usa ?house=…)' });
    return null;
  }

  if (device.pin) {
    const pin = String(req.headers['x-house-pin'] || req.query.pin || '');
    if (!safeEqual(pin, device.pin)) {
      res.status(401).json({ ok: false, error: 'PIN incorrecto' });
      return null;
    }
  }
  return device;
}

const getHouse = (ctx, device) => ctx.houseById.get(device.id);

export function createApiRouter(ctx) {
  const router = Router();

  router.get(
    '/health',
    asyncHandler(async (req, res) => {
      res.json({ ok: true, service: 'ly-c100a-dashboard', uptime: Math.round(process.uptime()), time: Date.now() });
    })
  );

  router.get(
    '/devices',
    asyncHandler(async (req, res) => {
      res.json(housesPayload(ctx));
    })
  );

  router.get(
    '/device',
    asyncHandler(async (req, res) => {
      const device = authorize(req, res);
      if (!device) return;
      res.json({ ok: true, data: devicePayload(getHouse(ctx, device)) });
    })
  );

  router.get(
    '/status',
    asyncHandler(async (req, res) => {
      const device = authorize(req, res);
      if (!device) return;
      res.json({ ok: true, data: statusPayload(ctx, getHouse(ctx, device)) });
    })
  );

  router.get(
    '/latest',
    asyncHandler(async (req, res) => {
      const device = authorize(req, res);
      if (!device) return;
      res.json({ ok: true, data: getHouse(ctx, device).latest });
    })
  );

  router.get(
    '/history',
    asyncHandler(async (req, res) => {
      const device = authorize(req, res);
      if (!device) return;
      const house = getHouse(ctx, device);
      const to = parseTime(req.query.to, Date.now());
      let from = parseTime(req.query.from, to - 3_600_000);
      if (from > to) [from, to] = [to, from];
      const points = Math.min(2000, Math.max(10, Math.trunc(Number(req.query.points) || 600)));
      const { total, points: serie } = house.store.query({ from, to, maxPoints: points });
      res.json({ ok: true, data: { house: house.device.id, from, to, total, points: serie } });
    })
  );

  // Middleware de errores JSON
  router.use((err, req, res, next) => {
    console.error('[api] error:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  });

  return router;
}

/** Acepta epoch ms o ISO 8601. */
function parseTime(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  const n = Number(value);
  if (Number.isFinite(n)) return n;
  const d = Date.parse(String(value));
  return Number.isFinite(d) ? d : fallback;
}
