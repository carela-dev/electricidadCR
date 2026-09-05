/**
 * Estado global de medición del dashboard.
 *
 * - Se conecta por Socket.IO para recibir cada lectura en vivo (`reading`),
 *   el estado del sondeo (`poll`) y el resumen inicial (`hello`).
 * - Mantiene un anillo de lecturas recientes (cap ~960) que alimenta las
 *   vistas «Tiempo real» y «1 h» con actualización instantánea.
 * - Para rangos largos (6 h / 24 h / 7 d) consulta el historial por REST
 *   (con remuestreo en el servidor) y lo refresca cada 60 s.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { fetchDevice, fetchHistory, fetchLatest, fetchStatus } from '../lib/api.js';
import { viewById, isLiveView } from '../lib/series.js';

const RING_CAP = 960;
const HISTORY_AUTO_REFRESH_MS = 60_000;
const HISTORY_POINTS = 600;

export default function useMeter() {
  const [device, setDevice] = useState(null);
  const [status, setStatus] = useState(null);
  const [latest, setLatest] = useState(null);
  const [ring, setRing] = useState([]);
  const [view, setView] = useState('live');
  const [hist, setHist] = useState({ points: [], loading: false, error: null, updatedAt: 0 });
  const [socketConnected, setSocketConnected] = useState(false);
  const [seedError, setSeedError] = useState(null);

  const viewRef = useRef(view);
  viewRef.current = view;
  const histSeq = useRef(0);

  const applyReading = useCallback((snap) => {
    if (!snap || typeof snap.ts !== 'number') return;
    setLatest(snap);
    setRing((prev) => {
      if (prev.length && prev[prev.length - 1].ts === snap.ts) return prev;
      const next = [...prev, snap];
      return next.length > RING_CAP ? next.slice(next.length - RING_CAP) : next;
    });
  }, []);

  // ---- Socket.IO (canal en vivo) -----------------------------------------
  useEffect(() => {
    const socket = io({ path: '/socket.io', transports: ['websocket', 'polling'] });
    socket.on('connect', () => setSocketConnected(true));
    socket.on('disconnect', () => setSocketConnected(false));
    socket.on('hello', (payload) => {
      if (payload?.device) setDevice(payload.device);
      if (payload?.status) setStatus(payload.status);
      if (payload?.latest) applyReading(payload.latest);
    });
    socket.on('reading', applyReading);
    socket.on('poll', (s) => s && setStatus(s));
    return () => socket.disconnect();
  }, [applyReading]);

  // ---- Carga inicial por REST (fallback si el socket aún no responde) ----
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [dev, stat, lat] = await Promise.all([fetchDevice(), fetchStatus(), fetchLatest()]);
        if (!alive) return;
        setDevice(dev);
        setStatus(stat);
        if (lat) applyReading(lat);
      } catch (err) {
        if (alive) setSeedError(err.message);
      }
    })();
    return () => {
      alive = false;
    };
  }, [applyReading]);

  // ---- Histórico (rangos no en vivo) -------------------------------------
  const refreshHistory = useCallback(async () => {
    const current = viewRef.current;
    if (isLiveView(current)) return;
    const seq = ++histSeq.current;
    setHist((h) => ({ ...h, loading: true, error: null }));
    try {
      const to = Date.now();
      const w = viewById(current);
      const data = await fetchHistory({ from: to - w.windowMs, to, points: HISTORY_POINTS });
      if (seq !== histSeq.current) return;
      setHist({ points: data.points, loading: false, error: null, updatedAt: Date.now() });
    } catch (err) {
      if (seq !== histSeq.current) return;
      setHist((h) => ({ ...h, loading: false, error: err.message }));
    }
  }, []);

  useEffect(() => {
    if (isLiveView(view)) {
      // Rellena el anillo con el histórico reciente para que las curvas en
      // vivo no arranquen vacías (el socket sigue añadiendo lecturas nuevas).
      const seq = ++histSeq.current;
      let alive = true;
      const w = viewById(view);
      (async () => {
        try {
          const to = Date.now();
          const data = await fetchHistory({ from: to - w.windowMs, to, points: 600 });
          if (!alive || seq !== histSeq.current || !data.points.length) return;
          setRing((prev) => {
            const merged = new Map();
            for (const p of [...prev, ...data.points]) {
              if (p && typeof p.ts === 'number') merged.set(p.ts, p);
            }
            const arr = [...merged.values()].sort((a, b) => a.ts - b.ts);
            return arr.length > RING_CAP ? arr.slice(arr.length - RING_CAP) : arr;
          });
        } catch {
          /* el socket seguirá alimentando el anillo igualmente */
        }
      })();
      return () => {
        alive = false;
      };
    }
    refreshHistory();
  }, [view, refreshHistory]);

  useEffect(() => {
    if (isLiveView(viewRef.current)) return undefined;
    const timer = setInterval(() => {
      if (!document.hidden) refreshHistory();
    }, HISTORY_AUTO_REFRESH_MS);
    return () => clearInterval(timer);
  }, [refreshHistory]);

  // ---- Serie presentada según la vista -----------------------------------
  const series = useMemo(() => {
    const w = viewById(view);
    if (!w.live) return hist.points;
    const cut = Date.now() - w.windowMs;
    return ring.filter((p) => p.ts >= cut);
  }, [view, ring, hist.points]);

  const prevPoint = series.length >= 2 ? series[series.length - 2] : null;

  return {
    device,
    status,
    latest,
    view,
    setView,
    series,
    prevPoint,
    histLoading: hist.loading,
    histError: hist.error,
    histUpdatedAt: hist.updatedAt,
    refreshHistory,
    socketConnected,
    seedError,
  };
}
