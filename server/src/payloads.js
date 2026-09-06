/**
 * Serializadores de estado para REST y Socket.IO (evita duplicación).
 * Todo el estado está organizado por casa (house = id de configuración).
 */

/** Lista pública de casas (solo nombres + si exigen PIN). */
export function housesPayload(ctx) {
  return {
    ok: true,
    houses: ctx.houses.map((h) => ({
      id: h.device.id,
      name: h.device.name,
      requiresPin: Boolean(h.device.pin),
      mode: h.kind, // 'tuya' | 'demo' | 'none'
    })),
  };
}

export function devicePayload(house) {
  const meta = house.meta || {};
  const d = house.device;
  return {
    id: d.id,
    name: d.name,
    deviceId: meta.id || d.deviceId || d.id,
    product_name: meta.product_name || null,
    model: meta.model || meta.product_name || (house.kind === 'demo' ? 'LY-C100A' : null),
    category: meta.category || null,
    online: house.latest ? house.latest.online : meta.online !== false,
    source: house.kind, // 'tuya' | 'demo' | 'none'
    phase2: Boolean(house.latest && house.latest.voltage_l2 !== null),
    phase3: Boolean(house.latest && house.latest.voltage_l3 !== null),
  };
}

export function statusPayload(ctx, house) {
  return {
    house: house.device.id,
    name: house.device.name,
    mode: house.kind,
    demo: ctx.config.demo,
    configured: house.kind === 'tuya',
    region: house.device.region,
    pollIntervalMs: ctx.config.pollIntervalMs,
    lastPollAt: house.state.lastPollAt,
    lastPollOk: house.state.lastPollOk,
    lastError: house.state.lastError,
    attempts: house.state.attempts,
    dpsCodes: house.codes || [],
    sync: ctx.sync.describe(),
    serverTime: Date.now(),
    uptime: Math.round(process.uptime()),
  };
}

export function helloPayload(ctx, house) {
  return {
    house: house.device.id,
    device: devicePayload(house),
    status: statusPayload(ctx, house),
    latest: house.latest,
  };
}
