/**
 * Fuentes de medición intercambiables:
 *   - createTuyaSource(): medidor real vía Tuya Cloud API.
 *   - createDemoSource(): simulador 2 fases (L1/L2) sin hardware.
 *
 * Ambas exponen  { kind, tick() }  y tick() devuelve:
 *   { ok:true, snapshot, meta?, codes? }
 *   { ok:true, offline:true, meta, codes }   (dispositivo sin conexión)
 *   { ok:false, error, fatal? }
 */
import { normalizeStatus } from './normalize.js';
import { TuyaApiError } from './client.js';
import { codeLabel } from './dps.js';

const round = (n, d = 2) => Number(n.toFixed(d));
const noise = (amp) => (Math.random() - 0.5) * 2 * amp;

// ---------------------------------------------------------------- Tuya real
export function createTuyaSource({ client, deviceId, energyScale, log }) {
  let meta = null;
  let detailCounter = 0;
  let codes = [];

  return {
    kind: 'tuya',
    async tick() {
      let statusArr;
      try {
        statusArr = await client.getDeviceStatus(deviceId);
      } catch (err) {
        if (err instanceof TuyaApiError) {
          if (err.code === 2001) {
            // 2001 = dispositivo offline: conservamos la última telemetría válida.
            return { ok: true, offline: true, meta, codes };
          }
          if (err.code === 2010) {
            return { ok: false, fatal: true, error: err };
          }
        }
        return { ok: false, error: err };
      }
      if (!Array.isArray(statusArr)) {
        return { ok: false, error: new Error('Tuya devolvió un estado inesperado') };
      }

      const newCodes = [...new Set(statusArr.map((s) => s.code))].sort();
      if (newCodes.join('|') !== codes.join('|')) {
        log.info(
          `DPs detectados (${newCodes.length}): ${newCodes.map((c) => `${c} [${codeLabel(c)}]`).join(', ')}`
        );
        codes = newCodes;
      }

      // El detalle (nombre/modelo/online) solo se consulta de vez en cuando.
      if (detailCounter++ % 6 === 0) {
        try {
          meta = await client.getDeviceDetail(deviceId);
        } catch (err) {
          log.warn(`Detalle del dispositivo no disponible: ${err.message}`);
        }
      }
      const online = meta ? meta.online !== false : true;
      const snapshot = normalizeStatus(statusArr, {
        device_id: deviceId,
        source: 'tuya',
        energyScale,
        online,
      });
      return { ok: true, snapshot, meta, codes };
    },
  };
}

// ---------------------------------------------------------------- Simulador
const DEMO_CODES = [
  'cur_voltage_l1', 'cur_voltage_l2',
  'cur_current', 'cur_power', 'cur_power_factor', 'add_ele', 'temperature',
];

export function createDemoSource({ deviceId = 'ly-c100a-demo', log } = {}) {
  let energy = 1024.37; // kWh acumulado inicial (simulado)
  let lastTs = null;

  const meta = {
    id: deviceId,
    name: 'LY-C100A (simulación)',
    product_name: 'Medidor de energía WiFi 2 fases · demo',
    category: 'kg',
    model: 'LY-C100A',
    online: true,
  };

  const generate = (ts, dtSeconds) => {
    const s = ts / 1000;
    // Tensión nominal 230 V con deriva lenta + ondulación de red por fase.
    const drift = 1.5 * Math.sin(s / 900) + 0.6 * Math.sin(s / 240 + 1.2);
    const v1 = 230.4 + drift + 0.9 * Math.sin(s / 31 + 0.4) + noise(0.1);
    const v2 = 228.6 + drift * 0.8 + 1.15 * Math.sin(s / 43 + 2.1) + noise(0.1);

    // Carga cíclica tipo electrodomésticos por fase.
    const pulse = (t, period, strength, phase = 0) =>
      strength * Math.max(0, Math.sin((t + phase) / period)) ** 6;
    const loadL1 =
      140 + pulse(s, 137, 1050) + pulse(s, 61, 640, 2.1) + 120 * Math.sin(s / 23 + 0.6);
    const loadL2 =
      110 + pulse(s, 173, 780, 4.0) + pulse(s, 53, 430, 1.0) + 90 * Math.sin(s / 29 + 2.4);
    const powerL1 = Math.max(25, loadL1 + noise(18));
    const powerL2 = Math.max(15, loadL2 + noise(14));
    const power = powerL1 + powerL2;

    // Corriente por fase ≈ P/(V·fp) — el medidor reporta corriente total.
    const powerFactor = Math.min(0.99, Math.max(0.85, 0.93 + 0.04 * Math.sin(s / 500 + 1) + noise(0.008)));
    const current = powerL1 / (v1 * powerFactor) + powerL2 / (v2 * powerFactor);
    const temperature = 38 + 5 * Math.sin(s / 3600 + 0.7) + 0.8 * Math.sin(s / 97) + noise(0.15);

    if (dtSeconds > 0) energy += (power * dtSeconds) / 3_600_000;

    return {
      ts,
      device_id: deviceId,
      source: 'demo',
      online: true,
      voltage_l1: round(v1),
      voltage_l2: round(v2),
      voltage_l3: null,
      current: round(current, 2),
      power: round(power, 1),
      power_factor: round(powerFactor, 3),
      temperature: round(temperature, 1),
      energy_kwh: round(energy, 4),
      balance_kwh: null, // el simulador no emula prepago
      switch_on: true,
      cutoff: false,
    };
  };

  return {
    kind: 'demo',
    meta,
    codes: DEMO_CODES,
    /** snapshot simulado para un instante dado (ts ascendente). */
    tick(ts = Date.now()) {
      const prev = lastTs ?? ts - 10_000;
      lastTs = ts;
      return { ok: true, snapshot: generate(ts, (ts - prev) / 1000), meta, codes: DEMO_CODES };
    },
  };
}
