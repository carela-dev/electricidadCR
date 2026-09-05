/**
 * Normaliza los DPs [{code,value}] de Tuya a un snapshot plano con tipos
 * numéricos, apto para gráficos, persistencia y sync.
 *
 * Soporta dos familias de dispositivos:
 *   1. Medidores de energía «clásicos» (voltaje/corriente/potencia como DPs
 *      numéricos: cur_voltage, cur_current, cur_power, add_ele…).
 *   2. Disyuntores inteligentes con medición (categoría dlq, p. ej. «Breaker»)
 *      donde las magnitudes viajan en un paquete Base64 dentro de los DPs
 *      phase_a/phase_b/phase_c (ver breaker.js).
 *
 * Forma del snapshot:
 *   { ts, device_id, source, online,
 *     voltage_l1, voltage_l2, voltage_l3,   // V  (null si no reportado)
 *     current,                              // A  (total)
 *     power,                                // W  (potencia activa total)
 *     power_factor, temperature,            // 0..1 · °C
 *     energy_kwh }                          // kWh acumulado
 */
import { DP_CATALOG, DP_ENERGY_SCALES, balanceAliases, switchAliases } from './dps.js';
import { decodePhasePacket } from './breaker.js';

export const SNAPSHOT_KEYS = [
  'voltage_l1',
  'voltage_l2',
  'voltage_l3',
  'current',
  'power',
  'power_factor',
  'temperature',
  'energy_kwh',
  'balance_kwh',
];

function toFiniteNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const n = Number(value.trim());
    return Number.isFinite(n) ? n : null;
  }
  return null; // boolean / objetos / undefined
}

/** Primera coincidencia de una lista de códigos DP sobre el mapa raw. */
function pick(rawMap, aliases) {
  for (const code of aliases) {
    if (code in rawMap && rawMap[code] !== null && rawMap[code] !== undefined) {
      const n = toFiniteNumber(rawMap[code]);
      if (n !== null) return n;
    }
  }
  return null;
}

/** Decodifica los paquetes phase_a/b/c en fases ordenadas (L1, L2, L3). */
function decodePhases(rawMap) {
  const phases = [];
  const order = ['phase_a', 'phase_b', 'phase_c', 'phase_1', 'phase_2', 'phase_3'];
  for (const code of order) {
    if (code in rawMap) {
      const dec = decodePhasePacket(rawMap[code]);
      if (dec) phases.push(dec);
    }
  }
  return phases;
}

/**
 * @param {Array<{code:string,value:unknown}>} status Lista DP de Tuya.
 * @param {object} opts
 */
export function normalizeStatus(
  status,
  { device_id = 'unknown', source = 'tuya', energyScale = 1, online = true } = {}
) {
  const rawMap = {};
  for (const item of status) {
    if (item && typeof item.code === 'string') rawMap[item.code] = item.value;
  }

  // Fase 1: magnitudes explícitas (medidores clásicos)…
  const explicit = {
    voltage: pick(rawMap, [...DP_CATALOG.voltageL1, ...DP_CATALOG.voltageSingle]),
    voltageL2: pick(rawMap, DP_CATALOG.voltageL2),
    voltageL3: pick(rawMap, DP_CATALOG.voltageL3),
    current: pick(rawMap, DP_CATALOG.current),
    power: pick(rawMap, DP_CATALOG.power),
  };

  // …Fase 2: paquetes phase_a/b/c (disyuntores dlq)
  const decoded = decodePhases(rawMap);

  const voltage_l1 = explicit.voltage ?? decoded[0]?.voltage ?? null;
  const voltage_l2 = explicit.voltageL2 ?? decoded[1]?.voltage ?? null;
  const voltage_l3 = explicit.voltageL3 ?? decoded[2]?.voltage ?? null;

  const current = explicit.current ?? (decoded.length ? sum(decoded, 'current') : null);
  const power = explicit.power ?? (decoded.length ? sum(decoded, 'power') : null);

  // Energía: raw × escala del DP (spec «scale») × TUYA_ENERGY_SCALE.
  let energy = null;
  let energyCode = null;
  for (const code of DP_CATALOG.energy) {
    if (code in rawMap) {
      const n = toFiniteNumber(rawMap[code]);
      if (n !== null) {
        energy = n;
        energyCode = code;
        break;
      }
    }
  }
  if (energy !== null) {
    const dpScale = energyCode ? DP_ENERGY_SCALES[energyCode] ?? 1 : 1;
    energy = Number((energy * dpScale * energyScale).toFixed(6));
  }

  // Saldo de energía prepagado (p. ej. balance_energy en disyuntores dlq).
  let balance = null;
  for (const code of balanceAliases) {
    if (code in rawMap) {
      const n = toFiniteNumber(rawMap[code]);
      if (n !== null) {
        const dpScale = DP_ENERGY_SCALES[code] ?? 1;
        balance = Number((n * dpScale * energyScale).toFixed(6));
        break;
      }
    }
  }

  const temperature = pick(rawMap, DP_CATALOG.temperature);
  const safeTemp = temperature !== null && temperature >= -40 && temperature <= 150 ? temperature : null;

  // --- Estado del relé y corte de suministro -------------------------------
  // Disyuntores con prepago: cuando el saldo llega a 0 el medidor abre el relé
  // interno y deja de pasar corriente → corriente y potencia deben presentar 0.
  let switchOn = null;
  for (const code of switchAliases) {
    if (code in rawMap) {
      const raw = rawMap[code];
      if (raw === true || raw === 1 || raw === '1' || raw === 'true' || raw === 'on') switchOn = true;
      else if (raw === false || raw === 0 || raw === '0' || raw === 'false' || raw === 'off') switchOn = false;
      break;
    }
  }
  const balanceZero = balance !== null && balance <= 0;
  // Corte: relé abierto, o saldo 0 sin relé confirmado encendido.
  const cutoff = switchOn === false || (balanceZero && switchOn !== true);

  let currentF = current;
  let powerF = power;
  if (cutoff) {
    currentF = currentF === null ? null : 0;
    powerF = powerF === null ? null : 0;
  }

  return {
    ts: Date.now(),
    device_id,
    source,
    online,
    voltage_l1,
    voltage_l2,
    voltage_l3,
    current: currentF,
    power: powerF,
    power_factor: pick(rawMap, DP_CATALOG.powerFactor),
    temperature: safeTemp,
    energy_kwh: energy,
    balance_kwh: balance,
    switch_on: switchOn,
    cutoff,
  };
}

function sum(list, key) {
  const total = list.reduce((acc, item) => acc + (typeof item[key] === 'number' ? item[key] : 0), 0);
  return Number(total.toFixed(3));
}
