/**
 * Consumo acumulado: energía total (kWh) que marca el contador del medidor.
 */
import {
  CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { chartTheme, colorOf, tickTime } from '../lib/series.js';
import { fmtNumber } from '../lib/format.js';
import { ChartTip } from './ChartBits.jsx';

export default function EnergyChart({ points, view, latest, loading = false }) {
  const theme = chartTheme();
  const c = colorOf('energy_kwh');
  const def = { key: 'energy_kwh', label: 'Consumo total', color: c, unit: 'kWh', fmt: (x) => `${Number(x).toFixed(3)} kWh` };
  const hasData = points.some((p) => p.energy_kwh !== null && p.energy_kwh !== undefined);
  const total = latest && latest.energy_kwh !== null && latest.energy_kwh !== undefined ? latest.energy_kwh : null;

  return (
    <div className="card chart-card">
      <div className="chart-head">
        <div>
          <h3>Consumo acumulado</h3>
          <div className="hint">Energía total registrada por el contador · unidad kWh</div>
        </div>
        <div className="chart-meta">
          {total !== null && (
            <span className="chip">
              Total <b>{fmtNumber(total, 2)} kWh</b>
            </span>
          )}
        </div>
      </div>
      <div className="chart-wrap" style={{ height: 250 }}>
        {hasData ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={points} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 6" vertical={false} stroke={theme.grid} />
              <XAxis
                dataKey="ts"
                type="number"
                domain={['dataMin', 'dataMax']}
                scale="time"
                tickFormatter={(ts) => tickTime(ts, view)}
                tick={{ fill: theme.tick, fontSize: 11 }}
                axisLine={{ stroke: theme.grid }}
                tickLine={false}
                minTickGap={40}
              />
              <YAxis
                domain={['auto', 'auto']}
                tickFormatter={(x) => (Math.abs(x) >= 1000 ? `${(x / 1000).toFixed(1)}k` : x.toFixed(1))}
                tick={{ fill: theme.tick, fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={46}
              />
              <Tooltip
                content={<ChartTip defsByKey={{ energy_kwh: def }} />}
                cursor={{ stroke: theme.cursor, strokeDasharray: '4 4' }}
              />
              <Line type="monotone" dataKey="energy_kwh" stroke={c} strokeWidth={2.2} dot={false} connectNulls isAnimationActive={false} activeDot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="state-note">
            {loading ? <div className="spinner" /> : null}
            <span>{loading ? 'Cargando…' : 'Esperando lecturas de energía…'}</span>
          </div>
        )}
      </div>
    </div>
  );
}
