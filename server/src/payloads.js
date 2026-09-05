/**
 * Serializadores de estado para REST y Socket.IO (evita duplicación).
 */
export function devicePayload(runtime, config) {
  const meta = runtime.meta || {};
  const fallbackId = runtime.latest?.device_id || config.tuyaDeviceId || 'ly-c100a-demo';
  return {
    id: meta.id || fallbackId,
    name: meta.name || (config.demo ? 'LY-C100A (simulación)' : 'Medidor Tuya'),
    product_name: meta.product_name || null,
    model: meta.model || meta.product_name || (config.demo ? 'LY-C100A' : null),
    category: meta.category || null,
    online: runtime.latest ? runtime.latest.online : meta.online !== false,
    source: runtime.kind, // 'tuya' | 'demo' | 'none'
    phase2: Boolean(runtime.latest && runtime.latest.voltage_l2 !== null),
    phase3: Boolean(runtime.latest && runtime.latest.voltage_l3 !== null),
  };
}

export function statusPayload(ctx) {
  const { config, runtime, sync } = ctx;
  return {
    mode: runtime.kind, // 'tuya' | 'demo' | 'none'
    demo: config.demo,
    configured: Boolean(
      config.tuyaClientId && config.tuyaSecret && config.tuyaDeviceId
    ),
    region: config.region,
    pollIntervalMs: config.pollIntervalMs,
    lastPollAt: runtime.state.lastPollAt,
    lastPollOk: runtime.state.lastPollOk,
    lastError: runtime.state.lastError,
    attempts: runtime.state.attempts,
    dpsCodes: runtime.codes || [],
    sync: sync.describe(),
    serverTime: Date.now(),
    uptime: Math.round(process.uptime()),
  };
}

export function helloPayload(ctx) {
  return {
    device: devicePayload(ctx.runtime, ctx.config),
    status: statusPayload(ctx),
    latest: ctx.runtime.latest,
  };
}
