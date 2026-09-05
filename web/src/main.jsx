import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import './styles.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);

// Errores asíncronos (fuera del árbol React) también visibles en consola.
window.addEventListener('error', (e) => console.error('[window.error]', e.message, e.filename, e.lineno));
window.addEventListener('unhandledrejection', (e) => console.error('[unhandledrejection]', e.reason));
