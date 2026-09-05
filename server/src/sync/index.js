/**
 * Dispatcher de sincronización. Activa los adaptadores según la configuración
 * y agrega la lectura en paralelo sin bloquear el sondeo (quien llama debe
 * encargarse de capturar errores: se registran en lastError).
 */
import { createSupabaseSyncer } from './supabase.js';
import { createFirebaseSyncer } from './firebase.js';

export async function createSyncers(config, log) {
  const pushList = [];
  const state = { supabase: false, firebase: false, lastSyncAt: null, lastSyncError: null };

  if (config.syncSupabaseUrl && config.syncSupabaseKey) {
    pushList.push({
      name: 'supabase',
      push: createSupabaseSyncer({
        url: config.syncSupabaseUrl,
        key: config.syncSupabaseKey,
        table: config.syncSupabaseTable,
        log,
      }),
    });
    state.supabase = true;
  }

  if (config.firebaseServiceAccount) {
    try {
      const push = await createFirebaseSyncer({
        serviceAccountValue: config.firebaseServiceAccount,
        collection: config.firebaseCollection,
        log,
      });
      pushList.push({ name: 'firebase', push });
      state.firebase = true;
    } catch (err) {
      state.lastSyncError = err.message;
      log.error(`Sync Firebase desactivado: ${err.message}`);
    }
  }

  return {
    describe: () => ({
      supabase: state.supabase,
      firebase: state.firebase,
      lastSyncAt: state.lastSyncAt,
      lastSyncError: state.lastSyncError,
    }),
    /** Dispara la escritura en todos los destinos (no espera). */
    push(snapshot) {
      if (!pushList.length) return Promise.resolve();
      return Promise.allSettled(
        pushList.map(({ name, push }) =>
          push(snapshot)
            .then(() => {
              state.lastSyncAt = Date.now();
              state.lastSyncError = null;
            })
            .catch((err) => {
              state.lastSyncError = `${name}: ${err.message}`;
              log.error(`Sync ${name} falló: ${err.message}`);
            })
        )
      );
    },
  };
}
