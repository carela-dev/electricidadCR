import { useEffect, useRef, useState } from 'react';

/**
 * Modal para introducir el PIN de una casa bloqueada.
 */
export default function PinModal({ house, error, busy, onSubmit, onClose }) {
  const [pin, setPin] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    if (inputRef.current) inputRef.current.focus();
  }, []);

  const submit = (e) => {
    e.preventDefault();
    if (!busy && pin.trim()) onSubmit(pin.trim());
  };

  return (
    <div className="modal-backdrop" onClick={busy ? undefined : onClose}>
      <div className="pin-modal card" onClick={(e) => e.stopPropagation()}>
        <div className="pin-head">
          <span className="pin-lock">🔒</span>
          <div>
            <h3>Desbloquear {house?.name || 'casa'}</h3>
            <p>Introduce el PIN de esta casa para ver sus datos.</p>
          </div>
        </div>
        <form onSubmit={submit}>
          <input
            ref={inputRef}
            type="password"
            inputMode="numeric"
            autoComplete="off"
            placeholder="PIN"
            value={pin}
            onChange={(e) => {
              setPin(e.target.value);
            }}
          />
          {error && <div className="pin-error">{error}</div>}
          <div className="pin-actions">
            <button type="button" className="btn ghost" onClick={onClose} disabled={busy}>
              Cancelar
            </button>
            <button type="submit" className="btn primary" disabled={busy || !pin.trim()}>
              {busy ? 'Comprobando…' : 'Desbloquear'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
