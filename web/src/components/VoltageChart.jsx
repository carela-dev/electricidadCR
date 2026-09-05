/**
 * Gráfico en tiempo real/histórico del voltaje por fase (L1, L2, L3).
 * Muestra una sola línea cuando el medidor es monofásico.
 */
import {
  CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { chartTheme, colorOf, tickTime, yDomainPad } from '../lib/series.js';
import { ChartTip, LegendChips } from './ChartBits.jsx';

export default function VoltageChart({ points, view, phase2 = true, phase3 = false, loading = false }) {
  const theme = chartTheme();
  const c1 = colorOf('voltage_l1');
  const c2 = colorOf('voltage_l2');
  const c3 = colorOf('voltage_l3');

  const defs = [{ key: 'voltage_l1', label: 'Voltaje L1', color: c1, unit: 'V', fmt: (x) => `${Number(x).toFixed(1)} V` }];
  if (phase2) defs.push({ key: 'voltage_l2', label: 'Voltaje L2', color: c2, unit: 'V', fmt: (x) => `${Number(x).toFixed(1)} V` });
  if (phase3) defs.push({ key: 'voltage_l3', label: 'Voltaje L3', color: c3, unit: 'V', fmt: (x) => `${Number(x).toFixed(1)} V` });
  if (defs.length === 1) defs[0].label = 'Voltaje';

  const defsByKey = Object.fromEntries(defs.map((d) => [d.key, d]));
  const hasData = points.length > 0;

  return (
    <div className="card chart-card">
      <div className="chart-head">
        <div>
          <h3>
            {phase2 || phase3 ? 'Voltaje por fase' : 'Voltaje de línea'}
            <LegendChips defs={defs} />
          </h3>
          <div className="hint">Comparativa en vivo de las fases · unidad V</div>
        </div>
      </div>
      <div className="chart-wrap" style={{ height: 280 }}>
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
                minTickGap={46}
              />
              <YAxis
                domain={yDomainPad(1.2)}
                tickFormatter={(x) => x.toFixed(0)}
                tick={{ fill: theme.tick, fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={42}
              />
              <Tooltip
                content={<ChartTip defsByKey={defsByKey} />}
                cursor={{ stroke: theme.cursor, strokeDasharray: '4 4' }}
              />
              <Line type="monotone" dataKey="voltage_l1" stroke={c1} strokeWidth={2.2} dot={false} connectNulls isAnimationActive={false} activeDot={{ r: 4 }} />
              {phase2 && (
                <Line type="monotone" dataKey="voltage_l2" stroke={c2} strokeWidth={2.2} dot={false} connectNulls isAnimationActive={false} activeDot={{ r: 4 }} />
              )}
              {phase3 && (
                <Line type="monotone" dataKey="voltage_l3" stroke={c3} strokeWidth={2} dot={false} connectNulls isAnimationActive={false} activeDot={{ r: 4 }} />
              )}
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="state-note">
            {loading ? <div className="spinner" /> : null}
            <span>{loading ? 'Cargando…' : 'Esperando lecturas de voltaje…'}</span>
          </div>
        )}
      </div>
    </div>
  );
}
