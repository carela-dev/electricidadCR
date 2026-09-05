/**
 * Piezas compartidas de gráficos: leyenda, selector de rango, tooltip
 * personalizado y estados vacíos.
 */
import { VIEWS, tickFull } from '../lib/series.js';

export function LegendChips({ defs }) {
  return (
    <div className="legend">
      {defs.map((d) => (
        <span key={d.key} title={d.label}>
          <i style={{ background: d.color }} />
          {d.label}
        </span>
      ))}
    </div>
  );
}

export function RangePicker({ view, onChange }) {
  return (
    <div className="range-picker" role="tablist" aria-label="Rango temporal">
      {VIEWS.map((v) => (
        <button
          key={v.id}
          role="tab"
          aria-selected={view === v.id}
          className={view === v.id ? 'active' : ''}
          onClick={() => onChange(v.id)}
        >
          {v.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Tooltip oscuro de Recharts. `defs` = [{key,label,color,unit,fmt}] y los
 * payloads se alinean por dataKey.
 */
export function ChartTip({ active, payload, label, defs, defsByKey }) {
  if (!active || !payload || !payload.length) return null;
  const rows = payload.filter((p) => p && p.value !== null && p.value !== undefined);
  if (!rows.length) return null;
  return (
    <div className="rt-tip">
      <div className="t">{tickFull(label)}</div>
      {rows.map((p) => {
        const def = (defsByKey || {})[p.dataKey];
        if (!def) return null;
        const value = def.fmt ? def.fmt(p.value) : `${Number(p.value).toFixed(2)} ${def.unit || ''}`.trim();
        return (
          <div className="row" key={p.dataKey}>
            <i style={{ background: def.color }} />
            {def.label}
            <span className="v">{value}</span>
          </div>
        );
      })}
    </div>
  );
}

export function EmptyNote({ loading, error, hasData, onRetry, children }) {
  if (loading) {
    return (
      <div className="state-note">
        <div className="spinner" />
        <span>Cargando datos…</span>
      </div>
    );
  }
  if (error) {
    return (
      <div className="state-note">
        <span>No se pudo obtener el historial.</span>
        <span style={{ fontSize: 12 }}>{error}</span>
        {onRetry ? (
          <button type="button" className="btn small" onClick={onRetry}>
            Reintentar
          </button>
        ) : null}
      </div>
    );
  }
  if (!hasData) return <div className="state-note">{children || <span>Esperando lecturas…</span>}</div>;
  return null;
}
