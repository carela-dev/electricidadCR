/**
 * Canal de tiempo real (Socket.IO) autenticado por casa.
 * El cliente conecta con:  io({ auth: { house, pin } })
 *
 * Eventos (solo llegan al socket de la casa autenticada):
 *   server → client  hello    {house, device, status, latest}
 *                     reading {snapshot}
 *                     poll    {…status de sondeo de la casa…}
 */
import { devices } from './config.js';
import { helloPayload, statusPayload } from './payloads.js';

const safeEqual = (a, b) => {
  const x = String(a || '');
  const y = String(b || '');
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i += 1) diff |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return diff === 0;
};

export function attachSocket(io, ctx) {
  // Middleware de autenticación: casa + PIN (o casa única sin PIN)
  io.use((socket, next) => {
    const { house, pin } = socket.handshake.auth || {};
    let device = null;
    if (house) {
      device = devices.find((d) => d.id === String(house)) || null;
    }
    if (!device && devices.length === 1) device = devices[0];
    if (!device) return next(new Error('casa_no_encontrada'));
    if (device.pin && !safeEqual(pin, device.pin)) return next(new Error('pin_incorrecto'));
    socket.data.house = device.id;
    next();
  });

  io.on('connection', (socket) => {
    const house = ctx.houseById.get(socket.data.house);
    socket.join(`house:${socket.data.house}`);
    socket.emit('hello', helloPayload(ctx, house));
  });

  const room = (houseId) => `house:${houseId}`;

  return {
    emitReading(houseId, snapshot) {
      io.to(room(houseId)).emit('reading', snapshot);
    },
    emitPoll(houseId) {
      const house = ctx.houseById.get(houseId);
      io.to(room(houseId)).emit('poll', statusPayload(ctx, house));
    },
  };
}
