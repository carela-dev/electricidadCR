/**
 * Curva de consumo instantáneo: potencia activa (W) con área rellena.
 */
import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { chartTheme, colorOf, tickTime, yDomainPad } from '../lib/series.js';
import { ChartTip } from './ChartBits.jsx';

export default function PowerChart({ points, view, loading = false }) {
  const theme = chartTheme();
  const c = colorOf('power');
  const def = { key: 'power', label: 'Potencia activa', color: c, unit: 'W', fmt: (x) => `${Number(x).toLocaleString('es-ES', { maximumFractionDigits: 0 })} W` };
  const hasData = points.some((p) => p.power !== null && p.power !== undefined);

  return (
    <div className="card chart-card">
      <div className="chart-head">
        <div>
          <h3>Potencia activa</h3>
          <div className="hint">Curva de consumo instantáneo · unidad W</div>
        </div>
      </div>
      <div className="chart-wrap" style={{ height: 250 }}>
        {hasData ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={points} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="gradPower" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={c} stopOpacity={0.45} />
                  <stop offset="100%" stopColor={c} stopOpacity={0.02} />
                </linearGradient>
              </defs>
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
                domain={yDomainPad(40)}
                tickFormatter={(x) => (Math.abs(x) >= 1000 ? `${(x / 1000).toFixed(1)}k` : x.toFixed(0))}
                tick={{ fill: theme.tick, fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={42}
              />
              <Tooltip
                content={<ChartTip defsByKey={{ power: def }} />}
                cursor={{ stroke: theme.cursor, strokeDasharray: '4 4' }}
              />
              <Area type="monotone" dataKey="power" stroke={c} strokeWidth={2.2} fill="url(#gradPower)" dot={false} connectNulls isAnimationActive={false} activeDot={{ r: 4 }} />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="state-note">
            {loading ? <div className="spinner" /> : null}
            <span>{loading ? 'Cargando…' : 'Esperando lecturas de potencia…'}</span>
          </div>
        )}
      </div>
    </div>
  );
}
