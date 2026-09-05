/**
 * Tarjetas de métricas principales (perfil operativo del panel):
 *   Balance de energía (saldo prepagado, si el dispositivo lo reporta)
 *   Consumo total acumulado
 *   Corriente
 *   Potencia activa
 *
 * El voltaje por fase y la temperatura no se muestran como tarjetas (el
 * voltaje se ve en su gráfico en vivo; la temperatura del disyuntor es un
 * valor fijo/umbral sin utilidad). La tarjeta de balance es adaptativa:
 * aparece solo cuando el dispositivo reporta `balance_kwh`.
 */
import { fmtNumber, fmtPower } from '../lib/format.js';
import { CurrentIcon, BoltIcon, EnergyIcon, CoinsIcon } from './icons.jsx';

/** Texto del delta (variación vs lectura anterior) + clase de dirección. */
function deltaParts(key, current, prev) {
  if (
    current === null || current === undefined ||
    prev === null || prev === undefined ||
    !Number.isFinite(current) || !Number.isFinite(prev)
  ) {
    return { text: '—', cls: '' };
  }
  const d = current - prev;
  if (d === 0) return { text: 'sin cambios', cls: '' };
  const abs = Math.abs(d);
  let text;
  if (key === 'power') {
    text = abs >= 1000 ? `${(abs / 1000).toFixed(2)} kW` : `${abs.toFixed(0)} W`;
  } else {
    text = `${abs.toFixed(2)} A`;
  }
  return { text: `${d > 0 ? '▲ +' : '▼ −'}${text}`, cls: d > 0 ? 'up' : 'down' };
}

function MetricCard({ item }) {
  const hasValue = Boolean(item.valueText) && item.valueText !== '—';
  return (
    <div className="metric card" style={{ ['--tone']: item.tone }}>
      <div className="label">
        {item.label}
        <span className="icon">
          <item.icon size={15} />
        </span>
      </div>
      <div className={`value${hasValue ? '' : ' placeholder'}`}>
        {hasValue ? (
          <>
            {item.valueText}
            {item.unit && <span className="unit">{item.unit}</span>}
          </>
        ) : (
          <>—</>
        )}
      </div>
      <div className={`delta ${item.delta?.cls || ''}`} title={item.hint}>
        {item.delta ? (
          <>
            <span className={item.delta.cls ? '' : 'dim'}>{item.delta.text}</span>
            {item.delta.cls ? <span className="dim"> vs anterior</span> : null}
          </>
        ) : (
          <span className="dim">{item.hint || '—'}</span>
        )}
      </div>
    </div>
  );
}

export default function MetricCards({ latest, prev }) {
  const v = (k) => (latest ? latest[k] : null);
  const p = (k) => (prev ? prev[k] : null);
  const delta = (k) => deltaParts(k, v(k), p(k));

  const items = [];

  // 1) Balance de energía (solo si el dispositivo lo reporta)
  const showBalance = latest ? latest.balance_kwh !== null && latest.balance_kwh !== undefined : true;
  if (showBalance) {
    items.push({
      key: 'balance_kwh', label: 'Balance de energía', icon: CoinsIcon, tone: 'var(--c-lime)',
      valueText: fmtNumber(v('balance_kwh'), 2), unit: 'kWh', delta: null,
      hint: 'Saldo de energía prepagado restante (kWh)',
    });
  }

  // 2) Consumo total acumulado
  items.push({
    key: 'energy_kwh', label: 'Consumo total', icon: EnergyIcon, tone: 'var(--c-energy)',
    valueText: fmtNumber(v('energy_kwh'), 2), unit: 'kWh', delta: null,
    hint: 'Energía acumulada desde la instalación (contador interno)',
  });

  // 3) Corriente
  items.push({
    key: 'current', label: 'Corriente', icon: CurrentIcon, tone: 'var(--c-current)',
    valueText: fmtNumber(v('current'), 2), unit: 'A', delta: delta('current'),
    hint: 'Corriente total de la carga',
  });

  // 4) Potencia activa
  const power = fmtPower(v('power'));
  items.push({
    key: 'power', label: 'Potencia activa', icon: BoltIcon, tone: 'var(--c-power)',
    valueText: power.value, unit: power.unit, delta: delta('power'),
    hint: 'Potencia activa instantánea total (W)',
  });

  return (
    <div className="metric-grid">
      {items.map((it) => (
        <MetricCard key={it.key} item={it} />
      ))}
    </div>
  );
}
