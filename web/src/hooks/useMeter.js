/**
 * Estado global del dashboard (multi-casa).
 *
 * - Carga la lista pública de casas (`/api/devices`) y recuerda la casa activa
 *   y sus PIN desbloqueados (localStorage).
 * - Mientras una casa está bloqueada no se piden datos (ni REST ni socket).
 * - Al desbloquear se conecta por Socket.IO con auth {house, pin} y recibe solo
 *   las lecturas en vivo de esa casa; las vistas históricas largas se piden por
 *   REST con las cabeceras de la casa activa.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { fetchDevices, fetchDevice, fetchHistory, fetchLatest, fetchStatus } from '../lib/api.js';
import { viewById, isLiveView } from '../lib/series.js';

const RING_CAP = 960;
const HISTORY_AUTO_REFRESH_MS = 60_000;
const HISTORY_POINTS = 600;
const LS_HOUSE = 'lyc100a-house';
const LS_PINS = 'lyc100a-pins';

function readJSON(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : fallback;
  } catch {
    return fallback;
  }
}
function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch { /* sin localStorage */ }
}

export default function useMeter() {
  const [houses, setHouses] = useState([]);
  const [pins, setPins] = useState(() => readJSON(LS_PINS, {}));
  const [active, setActive] = useState(null); // house id seleccionada

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
  const activeRef = useRef(active);
  activeRef.current = active;

  // ---------------------------------------------------------------- helpers
  const houseOf = useCallback((id) => houses.find((h) => h.id === id) || null, [houses]);
  const isUnlocked = useCallback(
    (id) => {
      const h = houseOf(id);
      return !h || !h.requiresPin || Boolean(pins[id]);
    },
    [houseOf, pins]
  );
  const access = active && isUnlocked(active) ? { house: active, pin: pins[active] || '' } : null;
  const accessKey = access ? `${access.house}:${access.pin}` : '';

  /** Devuelve true si pudo desbloquear; lanza si el PIN es incorrecto. */
  const unlockHouse = useCallback(
    async (houseId, pin) => {
      await fetchLatest({ house: houseId, pin }); // valida contra el backend
      setPins((prev) => {
        const next = { ...prev, [houseId]: pin };
        writeJSON(LS_PINS, next);
        return next;
      });
      setActive(houseId);
    },
    []
  );

  const forgetPin = useCallback((houseId) => {
    setPins((prev) => {
      const next = { ...prev };
      delete next[houseId];
      writeJSON(LS_PINS, next);
      return next;
    });
  }, []);

  const selectHouse = useCallback((id) => {
    setActive(id);
    try {
      localStorage.setItem(LS_HOUSE, id);
    } catch { /* sin localStorage */ }
  }, []);

  // ---------------------------------------------------------------- lista de casas
  useEffect(() => {
    let alive = true;
    fetchDevices()
      .then((list) => {
        if (!alive || !list.length) return;
        setHouses(list);
        const saved = readJSON(LS_HOUSE, null);
        const id = list.some((h) => h.id === saved) ? saved : list[0].id;
        setActive((cur) => cur || id);
        try {
          localStorage.setItem(LS_HOUSE, id);
        } catch { /* sin localStorage */ }
      })
      .catch((err) => {
        if (alive) setSeedError(`No se pudo obtener la lista de casas: ${err.message}`);
      });
    return () => {
      alive = false;
    };
  }, []);

  const applyReading = useCallback((snap) => {
    if (!snap || typeof snap.ts !== 'number') return;
    setLatest(snap);
    setRing((prev) => {
      if (prev.length && prev[prev.length - 1].ts === snap.ts) return prev;
      const next = [...prev, snap];
      return next.length > RING_CAP ? next.slice(next.length - RING_CAP) : next;
    });
  }, []);

  const resetHouseData = useCallback(() => {
    setDevice(null);
    setStatus(null);
    setLatest(null);
    setRing([]);
    setHist({ points: [], loading: false, error: null, updatedAt: 0 });
    setSeedError(null);
  }, []);

  // ---------------------------------------------------------------- socket (por casa)
  useEffect(() => {
    if (!access) {
      setSocketConnected(false);
      return undefined;
    }
    const socket = io({ auth: { house: access.house, pin: access.pin }, path: '/socket.io', transports: ['websocket', 'polling'] });
    socket.on('connect', () => setSocketConnected(true));
    socket.on('disconnect', () => setSocketConnected(false));
    socket.on('connect_error', (err) => {
      // PIN rechazado por el servidor → olvidar acceso y mostrar el bloqueo
      if (/pin/i.test(err.message || '')) {
        forgetPin(access.house);
        setSocketConnected(false);
      }
    });
    socket.on('hello', (payload) => {
      if (payload?.house !== access.house) return;
      if (payload.device) setDevice(payload.device);
      if (payload.status) setStatus(payload.status);
      if (payload.latest) applyReading(payload.latest);
    });
    socket.on('reading', (snap) => applyReading(snap));
    socket.on('poll', (s) => s && setStatus(s));
    return () => socket.disconnect();
  }, [accessKey, applyReading, forgetPin]);

  // ---------------------------------------------------------------- datos iniciales por casa
  useEffect(() => {
    if (!access) return undefined;
    let alive = true;
    resetHouseData();
    (async () => {
      try {
        const [dev, stat, lat] = await Promise.all([
          fetchDevice(access),
          fetchStatus(access),
          fetchLatest(access),
        ]);
        if (!alive || accessKey !== `${access.house}:${access.pin}`) return;
        setDevice(dev);
        setStatus(stat);
        if (lat) applyReading(lat);
      } catch (err) {
        if (!alive) return;
        if (err.status === 401) {
          forgetPin(access.house);
        } else {
          setSeedError(err.message);
        }
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessKey, resetHouseData, forgetPin, applyReading]);

  // ---------------------------------------------------------------- histórico
  const refreshHistory = useCallback(async () => {
    const current = viewRef.current;
    const currentAccess = accessKey ? access : null;
    if (!currentAccess || isLiveView(current)) return;
    const seq = ++histSeq.current;
    setHist((h) => ({ ...h, loading: true, error: null }));
    try {
      const to = Date.now();
      const w = viewById(current);
      const data = await fetchHistory({ from: to - w.windowMs, to, points: HISTORY_POINTS }, currentAccess);
      if (seq !== histSeq.current) return;
      setHist({ points: data.points, loading: false, error: null, updatedAt: Date.now() });
    } catch (err) {
      if (seq !== histSeq.current) return;
      setHist((h) => ({ ...h, loading: false, error: err.message }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessKey]);

  useEffect(() => {
    if (!access) {
      setHist({ points: [], loading: false, error: null, updatedAt: 0 });
      return;
    }
    if (isLiveView(view)) {
      const seq = ++histSeq.current;
      let alive = true;
      const w = viewById(view);
      (async () => {
        try {
          const to = Date.now();
          const data = await fetchHistory({ from: to - w.windowMs, to, points: 600 }, access);
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
          /* el socket alimenta el anillo igualmente */
        }
      })();
      return () => {
        alive = false;
      };
    }
    refreshHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, accessKey, refreshHistory]);

  useEffect(() => {
    if (!access || isLiveView(viewRef.current)) return undefined;
    const timer = setInterval(() => {
      if (!document.hidden) refreshHistory();
    }, HISTORY_AUTO_REFRESH_MS);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessKey, refreshHistory]);

  // ---------------------------------------------------------------- serie según la vista
  const series = useMemo(() => {
    if (!access) return [];
    const w = viewById(view);
    if (!w.live) return hist.points;
    const cut = Date.now() - w.windowMs;
    return ring.filter((p) => p.ts >= cut);
  }, [view, ring, hist.points, accessKey]);

  const prevPoint = series.length >= 2 ? series[series.length - 2] : null;

  return {
    houses,
    active,
    access,
    isUnlocked,
    unlockHouse,
    forgetPin,
    selectHouse,
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
