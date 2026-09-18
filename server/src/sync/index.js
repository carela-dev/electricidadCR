/**
 * Dispatcher de sincronización. Activa los adaptadores según la configuración
 * y agrega la lectura en paralelo sin bloquear el sondeo (quien llama debe
 * encargarse de capturar errores: se registran en lastError).
 */
import { createSupabaseClient } from './supabase.js';
import { createFirebaseSyncer } from './firebase.js';

export async function createSyncers(config, log) {
  const pushList = [];
  const state = { supabase: false, firebase: false, lastSyncAt: null, lastSyncError: null };
  let supabaseClient = null;

  if (config.syncSupabaseUrl && config.syncSupabaseKey) {
    supabaseClient = createSupabaseClient({
      url: config.syncSupabaseUrl,
      key: config.syncSupabaseKey,
      table: config.syncSupabaseTable,
      log,
    });
    pushList.push({ name: 'supabase', push: supabaseClient.push });
    state.supabase = true;
    log.info(`Sync Supabase activado → ${config.syncSupabaseTable} (escritura + lectura de respaldo)`);
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
      backfill: Boolean(supabaseClient),
    }),
    /**
     * Recupera las últimas lecturas de Supabase para rellenar el historial
     * local (disco efímero en Render) o mostrar la última telemetría cuando
     * la cuota de la API de Tuya está agotada. null si Supabase no está activo.
     */
    fetchRecent: supabaseClient
      ? (deviceId, limit) => supabaseClient.fetchRecent(deviceId, limit)
      : null,
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
