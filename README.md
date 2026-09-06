# ⚡ Dashboard del medidor Tuya WiFi LY-C100A

Aplicación web full-stack que muestra **en tiempo real y en histórico** las mediciones de un
medidor de energía inteligente **Tuya WiFi LY-C100A** (fases L1/L2): voltaje por fase,
corriente, potencia activa, temperatura y consumo total acumulado.

- **Backend** (Node.js ≥ 18): sondea la **Tuya Cloud API** (IoT Core) con firma HMAC-SHA256
  implementada a mano, guarda un historial local (NDJSON) y lo **sincroniza opcionalmente con
  Supabase o Firebase**. Expone una **REST API** y un canal **Socket.IO** para el tiempo real.
- **Frontend** (React + Vite + Recharts): dashboard **modo oscuro**, responsive y profesional,
  con tarjetas de métricas, gráficos interactivos comparando **L1 vs L2** y la curva de consumo,
  y selector de rango (tiempo real / 1 h / 6 h / 24 h / 7 días).
- **Modo demo** integrado: sin hardware ni credenciales puedes ver la UI funcionando con datos
  sintéticos de 2 fases.

```
┌──────────────┐   ┌──────────────────────────── server (Node) ────────────────────────────┐
│  Medidor     │   │  Tuya Cloud API ──► TuyaCloudClient (firma HMAC-SHA256)                 │
│  LY-C100A    │   │        │  poller (cada 10 s, backoff)                                   │
│  (Tuya WiFi) │   │        ▼                                                               │
└──────────────┘   │  normalizeStatus (mapea DPs → métricas L1/L2…)                          │
                   │        │                                                                │
                   │        ├──► ReadingStore (memoria + data/readings.ndjson)               │
                   │        ├──► Syncers (Supabase / Firebase, opcionales)                   │
                   │        ├──► Socket.IO emit('reading')                                   │
                   │        └──► REST /api/history …                                         │
                   │        ▲                                                                │
                   │  web (React+Vite) ◄──── REST + Socket.IO                                │
                   └─────────────────────────────────────────────────────────────────────────┘
```

---

## 1. Requisitos

- Node.js **≥ 18.17** (usa `fetch` nativo) y npm.
- *(Opcional)* Proyecto en la [plataforma Tuya IoT](https://iot.tuya.com) con el dispositivo
  vinculado, o una base Supabase/Firebase para la sync.

## 2. Instalación

```bash
cd tuya
npm install            # instala server + web (workspaces)
cp .env.example .env   # y rellena credenciales (ver abajo)
```

## 3. Arranque rápido

### Con datos simulados (sin hardware) — recomendado para probar

```bash
npm run demo          # backend + frontend con simulador
# o si quieres el backend solo:
npm run demo:dev      # igual que demo pero con Vite en modo desarrollo
```

Abre **http://localhost:5173** (desarrollo) o **http://localhost:4000** (si compilaste el
frontend). En modo demo el servidor siembra 7 días de histórico para que los rangos
**6 h / 24 h / 7 días** ya tengan curvas.

### Con el medidor real (Tuya Cloud API)

1. Rellena `.env` (ver §4).
2. `npm run dev` → backend en `:4000` + frontend en `:5173`.

> ⚠️ El plan básico de Tuya tiene límites de tasa. Mantén `TUYA_POLL_INTERVAL_MS ≥ 10000`.

### Producción (frontend servido por el mismo backend)

```bash
npm run build
npm start             # sirve web/dist + API en http://localhost:4000
```

---

## 4. Configuración de Tuya Cloud (paso a paso)

1. Crea una cuenta en [iot.tuya.com](https://iot.tuya.com) y entra en **Cloud → Create Cloud
   Project** (elige la región correcta: EU/US/CN/IN). Guarda el **Access ID / Access Secret**
   → `TUYA_CLIENT_ID` / `TUYA_CLIENT_SECRET`.
2. En **Cloud → API (Autorizaciones de API)**, añade al proyecto el servicio **IoT Core**
   (o *Smart Home Basic*). Para solo lectura de estado bastan los permisos de *device/status*.
3. Vincula el medidor al proyecto: **Devices → Link Tuya App Account**, escanea/inicia sesión
   con la app con la que emparejaste el LY-C100A y acepta compartir los dispositivos.
4. Copia el **Device ID** → `TUYA_DEVICE_ID`.
5. Región en el `.env`: `TUYA_REGION=eu|us|cn|in` (debe coincidir con la del proyecto).

### Sobre los códigos DP del LY-C100A

Tuya no documenta públicamente el firmware de cada OEM, pero la interfaz es **tolerante**: el
backend (en `server/src/tuya/dps.js`) reconoce automáticamente los códigos de la plantilla
habitual de medidores de energía — entre ellos `cur_voltage`, `cur_current`, `cur_power`,
`cur_power_factor`, `add_ele` (kWh) y `temperature` — **y variantes por fase**
(`cur_voltage_l1`/`l2`, `voltage_1`/`2`, `phase_a`/`b`, etc.).

Al arrancar, el servidor imprime en la consola los **DPs detectados** en tu dispositivo, por
ejemplo:

```
DPs detectados (8): cur_voltage_l1 [Tensión], cur_voltage_l2 [Tensión], cur_current [Corriente], ...
```

Si tu medidor usa nombres distintos, añádelos a la lista del catálogo en
`server/src/tuya/dps.js` (la primera coincidencia gana). También puedes verificar los códigos
en iot.tuya.com → proyecto → **Dispositivos** → pestaña *Registros de DP*.

**Comportamiento por fase:** si solo existe una tensión (`cur_voltage`), la interfaz se adapta
y muestra una única tarjeta/curva «L1». Si detecta una segunda (o tercera), muestra las
tarjetas y líneas **L1/L2** (o L1/L2/L3) — justo el caso de un LY-C100A bifásico.

### Perfil «disyuntor inteligente con medición» (categoría `dlq`)

Algunos dispositivos Tuya (p. ej. los disyuntores/RCBO DIN con prepago que la app registra
como *«Breaker»*) **no exponen las magnitudes como DPs numéricos**: envían un paquete binario
en **Base64 dentro del DP `phase_a`** (o `phase_b`/`phase_c` si son multifásicos). Este proyecto
lo decodifica automáticamente en `server/src/tuya/breaker.js`:

- Paquete de 8 bytes (monofásico): tensión `[0:2] × 0.1` V · corriente `[3:5] × 0.001` A · potencia `[6:8]` W.
- Paquete ≥ 18 bytes (RCBO): tensión `[2:4] × 0.1` V · corriente `[4:7] × 0.001` A · potencia `[7:10]` W.

Particularidades de estos dispositivos:

- `total_forward_energy` / `reverse_energy_total` llevan escala `×0.01` según la especificación
  (dígitos decimales) → el dashboard muestra kWh ya escalados (p. ej. raw `11` → `0.11 kWh`).
  Si tu app muestra el valor crudo, ajusta `TUYA_ENERGY_SCALE` (p. ej. `100`).
- `temp_current` se interpreta como temperatura en °C si está en un rango plausible (−40…150).
- Suelen ser **monofásicos** (solo `phase_a`): la interfaz se adapta sola y muestra una única
  tarjeta/curva de voltaje.

## 5. Variables de entorno (resumen)

| Variable | Por defecto | Descripción |
| --- | --- | --- |
| `PORT` | `4000` | Puerto del backend |
| `TUYA_REGION` | `eu` | `eu` · `us` · `cn` · `in` |
| `TUYA_CLIENT_ID` | — | Access ID del proyecto cloud Tuya |
| `TUYA_CLIENT_SECRET` | — | Access Secret del proyecto cloud Tuya |
| `TUYA_DEVICE_ID` | — | ID del dispositivo LY-C100A |
| `TUYA_DEMO` | — | `1` → simulador de 2 fases sin hardware |
| `TUYA_POLL_INTERVAL_MS` | `10000` | Intervalo de sondeo (mín. 3000) |
| `TUYA_ENERGY_SCALE` | `1` | Escala del contador (`0.001` si tu medidor reporta Wh) |
| `DATA_DIR` | `server/data` | Carpeta del historial NDJSON |
| `HISTORY_RETENTION_DAYS` | `7` | Días conservados en el historial local |
| `SYNC_SUPABASE_URL` | — | URL del proyecto Supabase |
| `SYNC_SUPABASE_SERVICE_KEY` | — | Clave `service_role` |
| `SYNC_SUPABASE_TABLE` | `readings` | Tabla destino |
| `SYNC_FIREBASE_SERVICE_ACCOUNT` | — | Ruta al JSON de cuenta de servicio |
| `SYNC_FIREBASE_COLLECTION` | `readings` | Colección Firestore |
| `CORS_ORIGIN` | *(todos)* | Orígenes permitidos (separados por coma) |

El archivo `.env` puede vivir en la raíz del repo, en `server/` o en el cwd; el backend lo
localiza solo.

## 5.1 Varias casas (TUYA_DEVICES) y acceso por PIN

Con el mismo proyecto de Tuya (misma cuenta/app y mismas credenciales) puedes vigilar
**varias casas** definiendo la variable `TUYA_DEVICES` (JSON):

```jsonc
// .env (una línea) o variable de Render
TUYA_DEVICES=[{"id":"casa4","name":"Casa 4","deviceId":"eb7be0c43951c24d39olwx","pin":"1111"},
              {"id":"casa2","name":"Casa 2","deviceId":"<device_id_del_otro_breaker>","pin":"2222"}]
```

- Cada casa recibe su **sondeo independiente**, su **historial** (`data/<id>.ndjson`) y su estado.
- `pin` (opcional) **bloquea la casa**: los endpoints de datos y el canal en vivo exigen ese PIN
  (cabeceras `X-House-Id` / `X-House-Pin`), de modo que cada dueño solo ve su casa.
- La interfaz muestra un **selector de casas** en la cabecera; cada navegador desbloquea las
  suyas con su PIN (queda recordado en ese dispositivo).
- Supabase no cambia: las filas de todas las casas conviven en `readings` separadas por
  `device_id`.

## 6. Sincronización opcional hacia Supabase o Firebase

La sync se activa sola al definir las variables correspondientes; cada lectura se escribe en
paralelo sin bloquear el sondeo. Estado en `/api/status` → `sync`.

### Supabase

```sql
-- ejecuta una vez: supabase-schema.sql (raíz del repo)
```
```bash
SYNC_SUPABASE_URL=https://xxxx.supabase.co
SYNC_SUPABASE_SERVICE_KEY=eyJ…            # service_role (settings → API)
```

### Firebase (Cloud Firestore)

```bash
npm install -w server firebase-admin       # paquete opcional, no instalado por defecto
SYNC_FIREBASE_SERVICE_ACCOUNT=/ruta/serviceAccountKey.json
```
Crea la cuenta de servicio en **Firebase → Project settings → Service accounts → Generate
new private key**.

> 📌 Nota de arquitectura: la lectura de históricos del dashboard siempre se sirve desde el
> **historial local del backend** (rápido y barato). Supabase/Firebase funcionan como **espejo
> duradero** de las mediciones para análisis externos, alertas, Grafana, etc.

## 7. API REST

| Ruta | Descripción |
| --- | --- |
| `GET /api/health` | Estado del servicio y uptime |
| `GET /api/device` | Metadatos del medidor (nombre, modelo, online, fases detectadas) |
| `GET /api/status` | Modo (tuya/demo), sondeo, errores, DPs detectados, sync |
| `GET /api/latest` | Última lectura normalizada |
| `GET /api/history?from&to&points` | Serie histórica con remuestreo (≤ 2000 puntos) |

**Eventos Socket.IO** (canal raíz, path `/socket.io`): al conectar recibes `hello`
(`{device,status,latest}`); después el servidor emite `reading` con cada snapshot y `poll`
tras cada intento de sondeo.

**Forma de una lectura (snapshot):**

```jsonc
{
  "ts": 1738660000000,          // epoch ms
  "device_id": "…", "source": "tuya", "online": true,
  "voltage_l1": 230.1, "voltage_l2": 228.6,   // V (null si no reportada)
  "current": 8.42,                            // A total
  "power": 1935.2,                            // W activa
  "power_factor": 0.97,
  "temperature": 41.3,                        // °C
  "energy_kwh": 1042.173                       // kWh acumulado
}
```

## 8. Docker

```bash
docker build -t lyc100a-dashboard .
docker run -p 4000:4000 --env-file .env -v tuya-data:/app/server/data lyc100a-dashboard
```

## 9. Estructura del proyecto

```
tuya/
├── server/                  # Backend Node (sin dependencias externas de red salvo express/socket.io)
│   └── src/
│       ├── index.js         # arranque, orquestación y sondeo con backoff
│       ├── config.js        # entorno (.env) y configuración
│       ├── payloads.js      # serializadores REST/socket
│       ├── store.js         # historial en memoria + NDJSON
│       ├── socket.js        # canal Socket.IO
│       ├── routes/api.js    # REST
│       ├── sync/            # adapters Supabase + Firebase
│       └── tuya/
│           ├── client.js    # cliente Tuya Open API (firma oficial HMAC-SHA256)
│           ├── dps.js       # ⚙️ catálogo de códigos DP (calibración LY-C100A)
│           ├── normalize.js # DPs → snapshot tipado por fase
│           └── sources.js   # fuente Tuya real + simulador demo
├── web/                     # Frontend React + Vite + Recharts
│   └── src/
│       ├── App.jsx          # composición
│       ├── hooks/useMeter.js# estado en vivo + histórico (socket + REST)
│       ├── lib/             # formato es-ES, series/colores, api
│       └── components/      # header, tarjetas, gráficos, iconos
├── supabase-schema.sql      # esquema SQL de Supabase
├── Dockerfile
└── .env.example
```

## 10. Seguridad y notas de despliegue

- El dashboard no trae autenticación (entorno doméstico/red local). Si lo expones a internet,
  ponlo detrás de un proxy con auth básica (p. ej. Caddy/Traefik) y acota `CORS_ORIGIN`.
- Nunca compartas `.env` (contiene el secreto de Tuya y la clave `service_role`).
- El historial local crece ~1 línea/lectura; con 10 s de sondeo son ~8 640 líneas/día
  (~1–2 MB/día). La retención por defecto es de 7 días.
- **Límites de Tuya:** el plan gratuito limita el número de llamadas; sube
  `TUYA_POLL_INTERVAL_MS` si recibes avisos de cuota (código `1106`/limitaciones).

## 11. Solución de problemas

| Síntoma | Causa probable / solución |
| --- | --- |
| Log `sign invalid (1004)` | Revisa `TUYA_CLIENT_ID` / `TUYA_CLIENT_SECRET` |
| Log `28841107 No permission… data center is suspended` o `2007 cross-region` | `TUYA_REGION` no coincide con el centro de datos habilitado en tu proyecto (Cloud → Data Center). Prueba `us`, `eu`, `in` o `cn` |
| Log `permission deny (1106)` | El proyecto no tiene la API **IoT Core** autorizada o el dispositivo no está vinculado |
| Log `device not exist (2010)` | `TUYA_DEVICE_ID` incorrecto |
| Log `device is offline (2001)` | El medidor no responde; se conserva la última telemetría |
| Sin tarjeta L2 | El medidor solo reporta una tensión (monofásico) → la UI se adapta sola; o revisa DPs en consola |
| Valores de kWh sospechosos | Ajusta `TUYA_ENERGY_SCALE` (Wh → `0.001`) |
| `HTTP 401/404` de Supabase | Clave/service_role mal puesta, tabla sin crear (ejecuta `supabase-schema.sql`) |
| Firebase no arranca | `npm install -w server firebase-admin` y ruta correcta al JSON de cuenta de servicio |
| El navegador no recibe datos | Verifica el proxy de Vite (`/api` y `/socket.io` → `:4000`) en `web/vite.config.js` |

---

Licencia MIT. Proyecto de ejemplo sin afiliación con Tuya ni con el fabricante del LY-C100A.

---

## 12. Publicar en internet (Render + Supabase + Firebase)

Arquitectura final: el **backend Node corre 24/7 en Render** (sirve el panel + API y
sondea Tuya), y cada lectura se **espeja en Supabase y/o Firebase**. Una sola URL pública.

### 12.1 Sube el código a GitHub

```bash
cd /home/eddyc/DeepSeekHarnessF/tuya
git init
git add .
git commit -m "Dashboard LY-C100A"
# crea un repo en github.com → luego:
git remote add origin https://github.com/TU-USUARIO/ly-c100a-dashboard.git
git push -u origin main
```
> El `.gitignore` ya excluye `.env`, `node_modules/`, `web/dist/`, `data/` y secretos.
> No subas nunca tu `.env` ni el archivo `.env.txt` que quedó en la raíz (bórralo).

### 12.2 Crea el servicio en Render

1. Entra en **https://dashboard.render.com** → **New → Web Service** → conecta el repo.
2. Configura:
   - **Build Command:** `npm install && npm run build`
   - **Start Command:** `npm start`
   - **Health Check Path:** `/api/health`
   - Plan **Free** (o Starter para que nunca duerma).
3. En **Environment**, define (botón *Add Environment Variable*):

| Variable | Valor |
| --- | --- |
| `TUYA_REGION` | `us` |
| `TUYA_CLIENT_ID` | tu Access ID |
| `TUYA_CLIENT_SECRET` | tu Access Secret |
| `TUYA_DEVICE_ID` | `eb7be0c43951c24d39olwx` |
| `TUYA_POLL_INTERVAL_MS` | `10000` |
| `TUYA_ENERGY_SCALE` | `1` (o el que uses) |
| `SYNC_SUPABASE_URL` | ver 12.3 |
| `SYNC_SUPABASE_SERVICE_KEY` | ver 12.3 |
| `SYNC_FIREBASE_SERVICE_ACCOUNT` | ver 12.4 (JSON completo o Base64) |

4. **Deploy** → Render te da la URL pública `https://tu-app.onrender.com`.
   Ábrela: verás el panel en vivo con los datos del medidor.

> Alternativa con plantilla: sube el repo y usa **New → Blueprint** con el `render.yaml`
> incluido (los secretos se completan después en el dashboard).

### 12.3 Supabase (espejo del historial)

1. Crea el proyecto en **https://supabase.com/dashboard** (elige región cerca de ti).
2. En **SQL Editor**, pega y ejecuta el contenido de **`supabase-schema.sql`** (raíz del repo).
3. En **Project Settings → API**, copia:
   - `Project URL` → `SYNC_SUPABASE_URL`
   - `service_role` (Settings → API → service_role) → `SYNC_SUPABASE_SERVICE_KEY`
   > La clave `service_role` da acceso total: úsala solo en el backend, nunca en el frontend.

### 12.4 Firebase (espejo del historial)

1. Crea el proyecto en **https://console.firebase.google.com** (plan Spark, gratis).
2. Menú **Build → Firestore Database → Create database** (modo producción).
3. **Project settings → Service accounts → Generate new private key** → te descarga un JSON.
4. En Render, pega **el contenido JSON completo** en `SYNC_FIREBASE_SERVICE_ACCOUNT`
   (o codifícalo en Base64 y pega eso). El backend acepta ruta, JSON literal o Base64.
   Opcional: `SYNC_FIREBASE_COLLECTION=readings`.

### 12.5 Verificar

- `https://tu-app.onrender.com/` → panel con datos en vivo.
- `/api/status` → `"mode":"tuya"`, `"sync":{"supabase":true,"firebase":true}` y
  `dpsCodes` con los 16 DPs del disyuntor.
- En Supabase: tabla `readings` creciendo cada 10 s. En Firestore: colección `readings`.

### 12.6 Notas sobre el plan Free de Render

- El servicio **duerme tras ~15 min sin tráfico**; al entrar, despierta y reanuda el sondeo.
- Para mantenerlo activo puedes añadir un **Cron Job** de Render (gratis) que haga una
  petición GET a `/api/health` cada 10 min, o pasar a plan Starter (siempre activo, ~7 $/mes).
- El historial local (NDJSON) es efímero en Render; el **histórico duradero vive en
  Supabase/Firebase** vía sync.
- El puerto: Render inyecta `PORT` automáticamente (no hace falta configurarlo).

### 12.7 Seguridad

- Las claves (`TUYA_CLIENT_SECRET`, `service_role`, cuenta de servicio Firebase) viven solo
  en las variables de Render; nunca en el código ni en el repo.
- Para acceso público recomendable añadir autenticación simple (proxy con Basic Auth) si
  expones datos energéticos.
