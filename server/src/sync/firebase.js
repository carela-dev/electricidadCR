/**
 * Sync a Firebase (Cloud Firestore) usando firebase-admin.
 *
 * La cuenta de servicio se puede indicar de tres formas (útil en plataformas
 * como Render, donde no se pueden montar archivos):
 *   1. Ruta a un archivo JSON local  (desarrollo)
 *   2. Contenido JSON pegado en la variable
 *   3. JSON codificado en Base64
 *
 * Configuración:
 *   SYNC_FIREBASE_SERVICE_ACCOUNT=/ruta/serviceAccountKey.json   (o JSON/base64)
 *   SYNC_FIREBASE_COLLECTION=readings                            (opcional)
 */
import fs from 'node:fs';
import { NUMERIC_KEYS } from '../store.js';

function resolveServiceAccount(rawValue) {
  const v = String(rawValue || '').trim();
  if (!v) throw new Error('SYNC_FIREBASE_SERVICE_ACCOUNT está vacío');

  const tryParse = (text) => {
    try {
      const obj = JSON.parse(text);
      if (obj && obj.project_id && obj.client_email && obj.private_key) return obj;
    } catch {
      /* no es JSON */
    }
    return null;
  };

  if (v.startsWith('{')) {
    const obj = tryParse(v);
    if (obj) return obj;
    throw new Error('SYNC_FIREBASE_SERVICE_ACCOUNT parece JSON pero no es válido');
  }

  if (fs.existsSync(v)) {
    const obj = tryParse(fs.readFileSync(v, 'utf8'));
    if (obj) return obj;
    throw new Error(`El archivo ${v} no contiene una cuenta de servicio válida`);
  }

  // ¿Base64?
  try {
    const decoded = Buffer.from(v, 'base64').toString('utf8');
    const obj = tryParse(decoded);
    if (obj) return obj;
  } catch {
    /* no era base64 */
  }
  throw new Error(
    'No se pudo interpretar SYNC_FIREBASE_SERVICE_ACCOUNT (usa una ruta, JSON literal o Base64)'
  );
}

export async function createFirebaseSyncer({ serviceAccountValue, collection, log }) {
  try {
    const { initializeApp, cert } = await import('firebase-admin/app');
    const { getFirestore } = await import('firebase-admin/firestore');

    const serviceAccount = resolveServiceAccount(serviceAccountValue);
    const app = initializeApp({
      credential: cert(serviceAccount),
      projectId: serviceAccount.project_id,
    });
    const db = getFirestore(app);
    log.info(`Sync Firebase activado → ${collection} (proyecto ${serviceAccount.project_id})`);

    const docId = (snapshot) => `${snapshot.device_id}_${snapshot.ts}`;
    const rowOf = (snapshot) => {
      const row = {
        device_id: snapshot.device_id,
        ts: new Date(snapshot.ts).toISOString(),
        source: snapshot.source,
        online: snapshot.online,
      };
      for (const k of NUMERIC_KEYS) row[k] = snapshot[k];
      return row;
    };

    return async function pushToFirebase(snapshot) {
      await db.collection(collection).doc(docId(snapshot)).set(rowOf(snapshot));
    };
  } catch (err) {
    throw new Error(`Firebase no disponible: ${err.message}`);
  }
}
