/**
 * Catálogo de códigos DP (data points) de medidores de energía Tuya.
 *
 * PUNTO DE CALIBRACIÓN PARA TU MEDIDOR LY-C100A
 * ---------------------------------------------
 * Los códigos reales se ven en iot.tuya.com > Cloud > tu proyecto >
 * Dispositivos > (dispositivo) > pestaña «Registros de DP» o «Instrucciones».
 * Este catálogo cubre los códigos más comunes de la plantilla «medidor de
 * energía» (kg / electric-meters). Si tu dispositivo usa otros nombres,
 * añádelos a la lista correspondiente: la primera coincidencia gana.
 *
 * Convenciones soportadas por fase:
 *   - cur_voltage_l1 / cur_voltage_l2 / cur_voltage_l3   (prefijo cur_)
 *   - voltage_l1 / voltage_l2 / voltage_l3
 *   - l1_voltage / l2_voltage / l3_voltage
 *   - cur_voltage_1..3, voltage_1..3, voltage1..3, cur_voltage1..3
 *   - phase_a/b/c (cur_voltage_a, voltage_a, a_voltage, ...)
 *
 * Si el medidor es monofásico (solo `cur_voltage`), el backend lo trata como
 * fase única (L1) y la interfaz oculta automáticamente las tarjetas L2/L3.
 */
export const DP_CATALOG = {
  /** Medición única de tensión (monofásica o total). */
  voltageSingle: ['cur_voltage', 'voltage', 'voltage_total', 'cur_voltage_total', 'main_voltage'],

  voltageL1: [
    'cur_voltage_l1', 'voltage_l1', 'l1_voltage',
    'cur_voltage_1', 'voltage_1', 'voltage1', 'cur_voltage1', 'phase1_voltage',
    'cur_voltage_a', 'voltage_a', 'a_voltage', 'phase_a_voltage',
  ],

  voltageL2: [
    'cur_voltage_l2', 'voltage_l2', 'l2_voltage',
    'cur_voltage_2', 'voltage_2', 'voltage2', 'cur_voltage2', 'phase2_voltage',
    'cur_voltage_b', 'voltage_b', 'b_voltage', 'phase_b_voltage',
  ],

  voltageL3: [
    'cur_voltage_l3', 'voltage_l3', 'l3_voltage',
    'cur_voltage_3', 'voltage_3', 'voltage3', 'cur_voltage3', 'phase3_voltage',
    'cur_voltage_c', 'voltage_c', 'c_voltage', 'phase_c_voltage',
  ],

  /** Corriente total (A). */
  current: ['cur_current', 'current', 'total_current', 'cur_current_total', 'current_l'],

  /** Potencia activa total (W). */
  power: [
    'cur_power', 'power', 'active_power', 'cur_active_power',
    'power_total', 'cur_power_total', 'total_power',
  ],

  /** Energía acumulada (kWh, salvo TUYA_ENERGY_SCALE). */
  energy: [
    'total_forward_energy', 'reverse_energy_total', 'total_reverse_energy',
    'add_ele', 'cur_energy', 'energy', 'electricity',
    'energy_total', 'total_energy', 'total_kwh', 'kwh', 'add_energy',
  ],

  /** Factor de potencia (0..1). */
  powerFactor: ['cur_power_factor', 'power_factor', 'factor', 'pf'],

  /** Temperatura interna del medidor (°C). */
  temperature: ['temperature', 'device_temperature', 'cur_temperature', 'temp', 'work_temperature', 'temp_current'],
};

/**
 * Escala decimal de algunos contadores de energía: la especificación DP de
 * Tuya indica «scale» (dígitos decimales), p. ej. 2 → valor real = raw × 0.01
 * kWh. Se aplica ANTES de TUYA_ENERGY_SCALE.
 */
export const DP_ENERGY_SCALES = {
  total_forward_energy: 0.01,
  reverse_energy_total: 0.01,
  total_reverse_energy: 0.01,
  balance_energy: 0.01,
  charge_energy: 0.01,
  // add_ele y la mayoría de medidores de kWh ya reportan en kWh (escala 1).
};

/** Saldo de energía (medidores/disyuntores con prepago). */
export const balanceAliases = ['balance_energy', 'remain_energy', 'balance'];

/** Estado del relé/contacto principal (true = cerrado/suministrando). */
export const switchAliases = ['switch', 'switch_1', 'relay'];

/** Etiquetas legibles de los códigos detectados (para depuración). */
export function codeLabel(code) {
  const table = {
    cur_voltage: 'Tensión', cur_current: 'Corriente', cur_power: 'Potencia activa',
    cur_power_factor: 'Factor de potencia', add_ele: 'Energía acumulada',
    temperature: 'Temperatura', cur_temperature: 'Temperatura',
  };
  return table[code] || code;
}
