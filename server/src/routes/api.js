/**
 * API REST del dashboard.
 *   GET /api/health   estado del servicio
 *   GET /api/device   metadatos del medidor
 *   GET /api/status   estado del sondeo y la configuración
 *   GET /api/latest   última lectura
 *   GET /api/history  serie histórica (?from=ms&to=ms&points=n)
 */
import { Router } from 'express';
import { devicePayload, statusPayload } from '../payloads.js';

const asyncHandler = (fn) => (req, res, next) => fn(req, res, next).catch(next);

/** Acepta epoch ms o ISO 8601. */
function parseTime(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  const n = Number(value);
  if (Number.isFinite(n)) return n;
  const d = Date.parse(String(value));
  return Number.isFinite(d) ? d : fallback;
}

export function createApiRouter(ctx) {
  const router = Router();

  router.get(
    '/health',
    asyncHandler(async (req, res) => {
      res.json({
        ok: true,
        service: 'ly-c100a-dashboard',
        uptime: Math.round(process.uptime()),
        time: Date.now(),
      });
    })
  );

  router.get(
    '/device',
    asyncHandler(async (req, res) => {
      res.json({ ok: true, data: devicePayload(ctx.runtime, ctx.config) });
    })
  );

  router.get(
    '/status',
    asyncHandler(async (req, res) => {
      res.json({ ok: true, data: statusPayload(ctx) });
    })
  );

  router.get(
    '/latest',
    asyncHandler(async (req, res) => {
      res.json({ ok: true, data: ctx.runtime.latest });
    })
  );

  router.get(
    '/history',
    asyncHandler(async (req, res) => {
      const to = parseTime(req.query.to, Date.now());
      let from = parseTime(req.query.from, to - 3_600_000);
      if (from > to) [from, to] = [to, from];
      const points = Math.min(2000, Math.max(10, Math.trunc(Number(req.query.points) || 600)));
      const { total, points: serie } = ctx.store.query({ from, to, maxPoints: points });
      res.json({ ok: true, data: { from, to, total, points: serie } });
    })
  );

  // Middleware de errores JSON
  router.use((err, req, res, next) => {
    // eslint-disable-next-line no-console
    console.error('[api] error:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  });

  return router;
}
