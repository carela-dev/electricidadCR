/**
 * Almacén de lecturas: memoria + persistencia en archivo NDJSON.
 * Cada lectura es una línea JSON. Al superar el límite de retención se
 * poda en memoria y se reescribe el archivo.
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

export const NUMERIC_KEYS = [
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

export class ReadingStore {
  constructor({ file, retentionDays = 7, log }) {
    this.file = file;
    this.retentionMs = retentionDays * 86_400_000;
    this.log = log;
    this.points = [];
    this.writeChain = Promise.resolve();
    this.appendCount = 0;
  }

  async load() {
    try {
      await fsp.mkdir(path.dirname(this.file), { recursive: true });
      const text = await fsp.readFile(this.file, 'utf8');
      const cut = Date.now() - this.retentionMs;
      for (const line of text.split('\n')) {
        if (!line.trim()) continue;
        try {
          const p = JSON.parse(line);
          if (p && typeof p.ts === 'number' && p.ts >= cut) this.points.push(p);
        } catch {
          /* línea corrupta: se ignora */
        }
      }
      this.points.sort((a, b) => a.ts - b.ts);
      this.log.info(`Historial cargado: ${this.points.length} lecturas en ${this.file}`);
    } catch (err) {
      if (err.code !== 'ENOENT') this.log.warn(`No se pudo cargar el historial: ${err.message}`);
    }
    return this;
  }

  getLatest() {
    return this.points.length ? this.points[this.points.length - 1] : null;
  }

  #prune(now = Date.now()) {
    const cut = now - this.retentionMs;
    const before = this.points.length;
    this.points = this.points.filter((p) => p.ts >= cut);
    return before - this.points.length;
  }

  /** Añade una lectura y la persiste (serializado para no pisar escrituras). */
  append(snapshot) {
    this.points.push(snapshot);
    this.appendCount += 1;
    if (this.appendCount % 250 === 0) this.#maybeRewrite();
    this.writeChain = this.writeChain
      .then(() => fsp.appendFile(this.file, JSON.stringify(snapshot) + '\n', 'utf8'))
      .catch((err) => this.log.error(`Fallo al persistir lectura: ${err.message}`));
    return this.writeChain;
  }

  /** Inserta un lote histórico (arranque en modo demo, p. ej.) en una sola escritura. */
  async appendMany(snapshots) {
    if (!snapshots.length) return;
    this.points.push(...snapshots);
    const blob = snapshots.map((s) => JSON.stringify(s)).join('\n') + '\n';
    this.writeChain = this.writeChain
      .then(() => fsp.appendFile(this.file, blob, 'utf8'))
      .catch((err) => this.log.error(`Fallo al persistir lote: ${err.message}`));
    await this.writeChain;
  }

  #maybeRewrite() {
    const removed = this.#prune();
    if (removed <= 0) return;
    this.log.info(`Poda del historial: ${removed} lecturas antiguas eliminadas`);
    const blob = this.points.map((p) => JSON.stringify(p)).join('\n') + '\n';
    this.writeChain = this.writeChain
      .then(() => fsp.writeFile(this.file, blob, 'utf8'))
      .catch((err) => this.log.error(`Fallo al reescribir historial: ${err.message}`));
  }

  /**
   * Consulta histórica con remuestreo por cajas (media) cuando hay más
   * puntos que maxPoints, para mantener los gráficos ligeros.
   */
  query({ from, to = Date.now(), maxPoints = 600 } = {}) {
    const f = Number.isFinite(from) ? from : to - 3_600_000;
    const cap = Math.min(4000, Math.max(10, Math.trunc(maxPoints)));
    const rows = this.points.filter((p) => p.ts >= f && p.ts <= to);
    const total = rows.length;
    return { total, points: rows.length > cap ? aggregateBins(rows, Math.ceil(rows.length / cap)) : rows };
  }
}

/** Media por caja de `step` lecturas; conserva ts del punto central. */
function aggregateBins(rows, step) {
  const out = [];
  for (let i = 0; i < rows.length; i += step) {
    const chunk = rows.slice(i, i + step);
    const sums = {};
    const counts = {};
    for (const r of chunk) {
      for (const key of NUMERIC_KEYS) {
        const v = r[key];
        if (typeof v === 'number' && Number.isFinite(v)) {
          sums[key] = (sums[key] || 0) + v;
          counts[key] = (counts[key] || 0) + 1;
        }
      }
    }
    const mid = chunk[Math.floor(chunk.length / 2)];
    const point = {
      ts: mid.ts,
      device_id: mid.device_id,
      source: mid.source,
      online: mid.online,
    };
    for (const key of NUMERIC_KEYS) {
      point[key] = counts[key] ? Number((sums[key] / counts[key]).toFixed(4)) : null;
    }
    out.push(point);
  }
  return out;
}
