/**
 * LY-C100A Energy Dashboard — composición principal.
 */
import { useEffect, useState } from 'react';
import useMeter from './hooks/useMeter.js';
import Header from './components/Header.jsx';
import MetricCards from './components/MetricCards.jsx';
import VoltageChart from './components/VoltageChart.jsx';
import PowerChart from './components/PowerChart.jsx';
import EnergyChart from './components/EnergyChart.jsx';
import { RangePicker } from './components/ChartBits.jsx';
import { AlertIcon, RefreshIcon } from './components/icons.jsx';
import { isLiveView, viewById } from './lib/series.js';
import { shortDeviceId, clock } from './lib/format.js';

const THEME_KEY = 'lyc100a-theme';

function readTheme() {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch { /* sin localStorage */ }
  return 'dark';
}

export default function App() {
  const [theme, setTheme] = useState(readTheme);
  const [now, setNow] = useState(() => Date.now());

  const meter = useMeter();
  const { device, status, latest, view, setView, series, prevPoint, histLoading, histError, histUpdatedAt, refreshHistory, socketConnected, seedError } = meter;

  const w = viewById(view);
  const live = w.live;

  const phase2 = !device ? true : device.phase2 !== false;
  const phase3 = Boolean(device?.phase3);
  const phaseChip = latest ? (phase3 ? 'L1·L2·L3' : phase2 ? 'L1·L2' : 'L1') : null;

  // Corte de suministro: relé abierto o saldo prepagado agotado.
  const balanceExhausted = latest && latest.balance_kwh !== null && latest.balance_kwh !== undefined && latest.balance_kwh <= 0;
  const supplyOff = Boolean(latest && (latest.switch_on === false || balanceExhausted));
  const cutoffReason =
    balanceExhausted
      ? 'saldo de energía agotado'
      : latest?.switch_on === false
        ? 'relé abierto (corte manual o por protección)'
        : null;

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch { /* sin localStorage */ }
  }, [theme]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const sourceName = status?.mode === 'demo' ? 'Demo (simulación)' : status?.mode === 'tuya' ? 'Tuya Cloud API' : 'Sin configurar';

  return (
    <div className="app">
      <Header
        device={device}
        status={status}
        latest={latest}
        socketConnected={socketConnected}
        now={now}
        theme={theme}
        onToggleTheme={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
      />

      {seedError && (
        <div className="banner err">
          <AlertIcon size={16} />
          <span>
            No se pudo conectar con el backend en <code>/api</code>. Verifica que el servidor esté
            corriendo (<code>npm run dev</code> en la raíz) y que el proxy apunte al puerto correcto.{' '}
            {seedError}
          </span>
        </div>
      )}

      {status?.lastError && (
        <div className="banner warn">
          <AlertIcon size={16} />
          <span>
            El sondeo del medidor reporta un problema: <b>{status.lastError}</b>
            {status.lastPollAt ? ` (último intento ${clock(status.lastPollAt)})` : ''}. La interfaz sigue
            mostrando la última telemetría válida.
          </span>
        </div>
      )}

      {supplyOff && (
        <div className="banner warn">
          <AlertIcon size={16} />
          <span>
            ⚡ <b>Suministro cortado</b> — {cutoffReason}. El medidor abrió el contacto y deja de
            pasar corriente: la potencia activa y la corriente se presentan en <b>0 W / 0 A</b> y el
            consumo acumulado no aumenta. Recarga el saldo para restablecer el servicio.
          </span>
        </div>
      )}

      <div className="section-title">
        <h2>Métricas en tiempo real</h2>
        <div className="chart-meta">
          {phaseChip && <span className="chip">Fases detectadas: <b>{phaseChip}</b></span>}
        </div>
      </div>

      <MetricCards latest={latest} prev={prevPoint} />

      <div className="section-title">
        <h2>Historial y tendencias</h2>
        <div className="chart-meta">
          {!live && (
            <span className="chip" title="Última sincronización del historial">
              {histUpdatedAt ? `Actualizado ${clock(histUpdatedAt)}` : 'Histórico'}
            </span>
          )}
          {!live && (
            <button type="button" className="btn small" onClick={refreshHistory} disabled={histLoading} title="Recargar historial">
              <RefreshIcon size={12} /> {histLoading ? 'Cargando…' : 'Actualizar'}
            </button>
          )}
          <RangePicker view={view} onChange={setView} />
        </div>
      </div>

      {!live && histError && (
        <div className="banner err">
          <AlertIcon size={16} />
          <span>No se pudo cargar el historial del rango seleccionado: {histError}</span>
        </div>
      )}

      <div className="chart-stack">
        <VoltageChart points={series} view={view} phase2={phase2} phase3={phase3} loading={!live && histLoading} />

        <div className="chart-pair">
          <PowerChart points={series} view={view} loading={!live && histLoading} />
          <EnergyChart points={series} view={view} latest={latest} loading={!live && histLoading} />
        </div>
      </div>

      <footer className="footer-note">
        <div className="left">
          <span>
            Dispositivo <code>{device ? shortDeviceId(device.id) : '—'}</code>
          </span>
          <span>Modelo <code>{device?.model || 'LY-C100A'}</code></span>
          <span>Fuente <code>{sourceName}</code></span>
          {status?.mode === 'tuya' && <span>Región <code>{status.region}</code></span>}
          <span>
            Sondeo cada <code>{Math.round((status?.pollIntervalMs || 0) / 1000)} s</code>
          </span>
          <span>
            Sync <code>Supabase {status?.sync?.supabase ? 'ON' : 'off'} · Firebase {status?.sync?.firebase ? 'ON' : 'off'}</code>
          </span>
        </div>
        <div className="right">
          {status?.sync?.lastSyncError ? <span title={status.sync.lastSyncError}>⚠ sync con errores</span> : null}
          <span>
            Servidor {status ? clock(status.serverTime) : '—'} · uptime {status?.uptime ?? 0} s ·{' '}
            {status?.dpsCodes?.length ? `${status.dpsCodes.length} DPs` : ''}
          </span>
        </div>
      </footer>
    </div>
  );
}
