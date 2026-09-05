import { Component } from 'react';

/**
 * Captura errores de renderizado y muestra el mensaje en pantalla
 * (evita la «pantalla en blanco» y facilita el diagnóstico).
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info?.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            maxWidth: 720,
            margin: '90px auto',
            padding: '24px 28px',
            borderRadius: 14,
            border: '1px solid rgba(248,113,113,.4)',
            background: 'rgba(248,113,113,.07)',
            color: '#fecaca',
            fontFamily: 'system-ui, sans-serif',
          }}
        >
          <h2 style={{ marginTop: 0 }}>⚠️ Error al renderizar el panel</h2>
          <pre
            style={{
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              background: 'rgba(0,0,0,.25)',
              padding: 12,
              borderRadius: 8,
              fontSize: 12.5,
              maxHeight: 260,
              overflow: 'auto',
            }}
          >
            {String(this.state.error?.stack || this.state.error)}
          </pre>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              marginTop: 12,
              padding: '8px 16px',
              borderRadius: 8,
              border: 0,
              background: '#22d3ee',
              color: '#06202a',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Recargar página
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
