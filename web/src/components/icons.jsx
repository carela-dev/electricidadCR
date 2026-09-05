/**
 * Iconos SVG inline (stroke = color actual), ligeros y sin dependencias.
 */

function StrokeIcon({ children, size = 16, ...rest }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  );
}

/** Símbolo de voltímetro (V) → Voltaje. */
export function VoltIcon(props) {
  return (
    <StrokeIcon {...props}>
      <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
    </StrokeIcon>
  );
}

/** Onda de corriente. */
export function CurrentIcon(props) {
  return (
    <StrokeIcon {...props}>
      <path d="M2 6c.6.5 1.2 1 2.5 1C7 7 7 5 9.5 5c2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1" />
      <path d="M2 12c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1" />
      <path d="M2 18c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1" />
    </StrokeIcon>
  );
}

/** Rayo → Potencia activa. */
export function BoltIcon({ filled = false, ...props }) {
  return filled ? (
    <svg width={props.size || 16} height={props.size || 16} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M13 2 3 14h7l-1 8 10-12h-7l1-8z" />
    </svg>
  ) : (
    <StrokeIcon {...props}>
      <path d="M13 2 3 14h7l-1 8 10-12h-7l1-8z" />
    </StrokeIcon>
  );
}

/** Termómetro → Temperatura. */
export function ThermIcon(props) {
  return (
    <StrokeIcon {...props}>
      <path d="M14 4v10.54a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0Z" />
      <circle cx="12" cy="17.5" r="1.4" fill="currentColor" stroke="none" />
    </StrokeIcon>
  );
}

/** Batería → Energía acumulada. */
export function EnergyIcon(props) {
  return (
    <StrokeIcon {...props}>
      <rect x="2.5" y="7.5" width="17" height="9" rx="2.4" />
      <path d="M22 11v2" />
      <rect x="5" y="10" width="7" height="4" rx="1" fill="currentColor" stroke="none" />
    </StrokeIcon>
  );
}

/** Monedas → Balance / saldo de energía. */
export function CoinsIcon(props) {
  return (
    <StrokeIcon {...props}>
      <circle cx="9" cy="9" r="5.6" />
      <circle cx="15.5" cy="15.5" r="5.6" />
      <circle cx="9" cy="9" r="1.2" fill="currentColor" stroke="none" />
    </StrokeIcon>
  );
}

export function SunIcon(props) {
  return (
    <StrokeIcon {...props}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </StrokeIcon>
  );
}

export function MoonIcon(props) {
  return (
    <StrokeIcon {...props}>
      <path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8Z" />
    </StrokeIcon>
  );
}

export function RefreshIcon(props) {
  return (
    <StrokeIcon {...props}>
      <path d="M21 12a9 9 0 1 1-2.6-6.4" />
      <path d="M21 3v6h-6" />
    </StrokeIcon>
  );
}

export function AlertIcon(props) {
  return (
    <StrokeIcon {...props}>
      <path d="M10.3 3.8 1.9 18a2 2 0 0 0 1.7 3h16.8a2 2 0 0 0 1.7-3L13.7 3.8a2 2 0 0 0-3.4 0Z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </StrokeIcon>
  );
}

export function WifiIcon(props) {
  return (
    <StrokeIcon {...props}>
      <path d="M5 12.5a10 10 0 0 1 14 0" />
      <path d="M8.5 16a5 5 0 0 1 7 0" />
      <circle cx="12" cy="19" r="0.6" fill="currentColor" />
    </StrokeIcon>
  );
}
