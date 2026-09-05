/**
 * Barra superior: marca, chips de estado en vivo y conmutador de tema.
 */
import { ago, clock, shortDeviceId } from '../lib/format.js';
import { BoltIcon, MoonIcon, SunIcon, WifiIcon } from './icons.jsx';

function Chip({ dot, tone = 'off', children, title }) {
  return (
    <span className="chip" title={title}>
      {dot && <span className={`dot ${tone}`} />}
      {children}
    </span>
  );
}

export default function Header({ device, status, latest, socketConnected, now, theme, onToggleTheme }) {
  const source = status?.mode || device?.source || 'none';
  const sourceChip =
    source === 'demo' ? (
      <Chip title="Datos sintéticos generados por el servidor (sin hardware)">
        Demo · <b>simulación 2 fases</b>
      </Chip>
    ) : source === 'tuya' ? (
      <Chip dot tone="ok" title="Conectado a la Tuya Cloud API">
        <WifiIcon size={12} /> Tuya Cloud · <b>{shortDeviceId(device?.id || '')}</b>
      </Chip>
    ) : (
      <Chip dot tone="warn" title="Configura credenciales o usa TUYA_DEMO=1">
        Sin fuente de datos
      </Chip>
    );

  const online = latest ? latest.online !== false : device?.online !== false;
  const hasIssue = Boolean(status && status.lastError);
  const updatedAt = latest?.ts || status?.lastPollAt;

  return (
    <header className="topbar">
      <div className="brand">
        <div className="brand-icon">
          <BoltIcon filled size={20} />
        </div>
        <div>
          <h1>Panel de energía · LY-C100A</h1>
          <div className="sub">
            {device?.name || 'Medidor inteligente Tuya WiFi'}
            {device?.model ? ` · ${device.model}` : ''}
          </div>
        </div>
      </div>

      <div className="chips">
        {sourceChip}
        {socketConnected ? (
          <Chip dot tone="ok" title="Canal de tiempo real activo (Socket.IO)">
            En vivo
          </Chip>
        ) : (
          <Chip dot tone="err" title="Reintentando conexión con el servidor…">
            Reconectando…
          </Chip>
        )}
        <Chip dot tone={online ? 'ok' : 'err'} title={online ? 'Medidor reportando lecturas' : 'El medidor no responde'}>
          Medidor {online ? 'en línea' : 'sin conexión'}
        </Chip>
        {hasIssue && (
          <Chip dot tone="warn" title={status?.lastError || ''}>
            Sondeo con avisos
          </Chip>
        )}
        <Chip title={`Última lectura: ${clock(updatedAt)}`}>
          Último dato: <b>{ago(updatedAt, now)}</b>
        </Chip>
        <button type="button" className="icon-btn" onClick={onToggleTheme} title={theme === 'dark' ? 'Tema claro' : 'Tema oscuro'}>
          {theme === 'dark' ? <SunIcon size={16} /> : <MoonIcon size={16} />}
        </button>
      </div>
    </header>
  );
}
