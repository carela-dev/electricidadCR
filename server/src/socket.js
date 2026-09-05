/**
 * Canal de tiempo real (Socket.IO).
 * Eventos:
 *   server → client  hello    {device, status, latest}  al conectar
 *                     reading {snapshot}                 cada nueva lectura
 *                     poll    {lastPollAt, lastPollOk, lastError} tras cada sondeo
 *   client → server  (sin eventos por ahora)
 */
import { helloPayload, statusPayload } from './payloads.js';

export function attachSocket(io, ctx) {
  io.on('connection', (socket) => {
    socket.emit('hello', helloPayload(ctx));
  });

  return {
    emitReading(snapshot) {
      io.emit('reading', snapshot);
    },
    emitPoll() {
      io.emit('poll', statusPayload(ctx));
    },
  };
}
