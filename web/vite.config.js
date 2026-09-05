import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const PROXY_TARGET = process.env.VITE_PROXY_TARGET || 'http://localhost:4000';

// En desarrollo, Vite (5173) reenvía /api y /socket.io al backend (4000),
// así no hay problemas de CORS. En producción el backend sirve web/dist.
export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: PROXY_TARGET, changeOrigin: true },
      '/socket.io': { target: PROXY_TARGET, changeOrigin: true, ws: true },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    target: 'es2020',
  },
});
