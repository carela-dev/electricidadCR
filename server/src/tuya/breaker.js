/**
 * Decodificador del paquete binario que usan los disyuntores/RCBO Tuya con
 * medición (categoría dlq, p. ej. «Breaker», modelos DIN con prepago).
 *
 * El DP `phase_a` (también `phase_b`/`phase_c` en modelos multifásicos) no es
 * un número: es un payload Base64 de 2 bytes por magnitud. Formato documentado
 * por la comunidad (localtuya #1193, Home Assistant):
 *
 *   Paquete corto (8 bytes, monofásico):
 *     [0:2]  tensión  ×0.1    → V
 *     [3:5]  corriente ×0.001 → A
 *     [6:8]  potencia         → W
 *   Paquete largo (≥18 bytes, RCBO):
 *     [2:4]  tensión  ×0.1    → V      (be2)
 *     [4:7]  corriente ×0.001 → A      (be3)
 *     [7:10] potencia         → W      (be3)
 *
 * La decodificación se valida contra rangos físicos plausibles y contra la
 * relación V·I ≈ P.
 */
const round = (n, d = 2) => Number(n.toFixed(d));

function readBE(buf, offset, bytes) {
  if (buf.length < offset + bytes) return null;
  let v = 0;
  for (let i = 0; i < bytes; i += 1) v = v * 256 + buf[offset + i];
  return v;
}

function plausible(v, i, p) {
  return (
    v !== null && i !== null && p !== null &&
    v >= 40 && v <= 480 &&      // V
    i >= 0 && i <= 10000 &&     // A
    p >= 0 && p <= 500000       // W
  );
}

/**
 * @param {string|undefined} b64  valor del DP (Base64)
 * @returns {{voltage:number,current:number,power:number}|null}
 */
export function decodePhasePacket(b64) {
  if (!b64 || typeof b64 !== 'string' || b64.length < 4) return null;
  let buf;
  try {
    buf = Buffer.from(b64, 'base64');
  } catch {
    return null;
  }
  if (!buf.length) return null;

  // --- paquete corto (8 bytes): la mayoría de disyuntores monofásicos ---
  if (buf.length >= 8 && buf.length < 18) {
    const voltage = round(readBE(buf, 0, 2) / 10, 1);
    const current = round(readBE(buf, 3, 2) / 1000, 3);
    const power = readBE(buf, 6, 2); // W
    if (plausible(voltage, current, power)) {
      return { voltage, current, power };
    }
    return null;
  }

  // --- paquete largo (≥18 bytes): RCBO con medición completa ---
  if (buf.length >= 18) {
    const voltage = round(readBE(buf, 2, 2) / 10, 1);
    const current = round(readBE(buf, 4, 3) / 1000, 3);
    const power = readBE(buf, 7, 3); // W
    if (plausible(voltage, current, power)) {
      return { voltage, current, power };
    }
    return null;
  }

  return null;
}

/** Códigos DP que contienen estos paquetes por fase (en orden). */
export const PHASE_PACKET_CODES = ['phase_a', 'phase_b', 'phase_c', 'phase_1', 'phase_2', 'phase_3'];
