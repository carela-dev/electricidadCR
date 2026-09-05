/**
 * Cliente ligero para la Tuya Open API (IoT Core), sin dependencias externas.
 *
 * Firma HMAC-SHA256 replicada 1:1 del SDK oficial `@tuya/tuya-connector-nodejs`
 * (src/core/client.ts). Resumen del algoritmo (v2 actual):
 *
 *   Token inicial  GET /v1.0/token?grant_type=1
 *     stringToSign = "GET\n" + sha256hex("") + "\n\n" + "/v1.0/token?grant_type=1"
 *     sign = HMAC-SHA256(secret, clientId + t + stringToSign).hex.upper()
 *
 *   Petición autenticada (p. ej. estado del dispositivo):
 *     contentHash   = sha256hex(JSON.stringify(body || {}))
 *     stringToSign  = METHOD + "\n" + contentHash + "\n\n" + path
 *     sign = HMAC-SHA256(secret, clientId + accessToken + t + stringToSign).hex.upper()
 *     headers: client_id, t, sign_method, access_token, sign, Dev_channel, Dev_lang
 *
 *   Renovación  GET /v1.0/token/{refresh_token}
 *     sign = HMAC-SHA256(secret, clientId + t).hex.upper()
 *
 * Códigos de error globales relevantes (documentación oficial):
 *   1004 sign inválido · 1010 token expirado · 1011 token inválido ·
 *   1106 permiso denegado · 2001 dispositivo offline · 2010 dispositivo inexistente
 */
import crypto from 'node:crypto';

const sha256hex = (str) => crypto.createHash('sha256').update(str, 'utf8').digest('hex');
const hmacSign = (secret, str) =>
  crypto.createHmac('sha256', secret).update(str, 'utf8').digest('hex').toUpperCase();

export class TuyaApiError extends Error {
  constructor(code, msg) {
    super(`Tuya API error ${code}: ${msg || 'sin detalle'}`);
    this.name = 'TuyaApiError';
    this.code = code;
    this.msg = msg || '';
  }
}

/** Códigos que indican un problema de autenticación/token: fuerzan re-login. */
const AUTH_RETRY_CODES = new Set([1010, 1011, 1106]);

export class TuyaCloudClient {
  constructor({ clientId, secret, baseUrl }) {
    if (!clientId || !secret || !baseUrl) {
      throw new Error('TuyaCloudClient requiere clientId, secret y baseUrl');
    }
    this.clientId = clientId;
    this.secret = secret;
    this.baseUrl = baseUrl;
    this.accessToken = '';
    this.refreshToken = '';
    this.expiresAt = 0; // epoch ms
  }

  get hasToken() {
    return Boolean(this.accessToken) && Date.now() < this.expiresAt;
  }

  #authHeaders(t, includeToken) {
    const h = {
      client_id: this.clientId,
      sign_method: 'HMAC-SHA256',
      t,
      Dev_channel: 'SaaSFramework',
      Dev_lang: 'Nodejs',
    };
    if (includeToken && this.accessToken) h.access_token = this.accessToken;
    return h;
  }

  async #httpGet(path, headers) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
      const res = await fetch(this.baseUrl + path, {
        method: 'GET',
        signal: controller.signal,
        headers,
      });
      if (!res.ok) {
        const body = (await res.text().catch(() => '')).slice(0, 300);
        throw new Error(`HTTP ${res.status} desde Tuya: ${body}`);
      }
      return await res.json();
    } finally {
      clearTimeout(timer);
    }
  }

  /** Solicita un token nuevo o renueva el refresh token guardado. */
  async #tokenRequest(useRefresh) {
    const t = Date.now().toString();
    const path = useRefresh
      ? `/v1.0/token/${encodeURIComponent(this.refreshToken)}`
      : '/v1.0/token?grant_type=1';

    // --- token inicial: estilo v2 del conector oficial ---
    // --- renovación: estilo v1 del conector oficial (HMAC(clientId + t)) ---
    let sign;
    if (useRefresh) {
      sign = hmacSign(this.secret, this.clientId + t);
    } else {
      const stringToSign = ['GET', sha256hex(''), '', '/v1.0/token?grant_type=1'].join('\n');
      sign = hmacSign(this.secret, this.clientId + t + stringToSign);
    }

    const headers = { ...this.#authHeaders(t, false), sign };
    const data = await this.#httpGet(path, headers);
    if (!data.success) throw new TuyaApiError(data.code, data.msg);
    const r = data.result;
    this.accessToken = r.access_token;
    this.refreshToken = r.refresh_token;
    // Renovamos 5 min antes de la expiración para evitar cortes.
    this.expiresAt = Date.now() + (Number(r.expire_time) - 300) * 1000;
    return data;
  }

  async #ensureToken() {
    if (this.hasToken) return;
    if (this.refreshToken) {
      try {
        await this.#tokenRequest(true);
        return;
      } catch (err) {
        this.refreshToken = '';
        this.accessToken = '';
      }
    }
    await this.#tokenRequest(false);
  }

  /** Firma una petición autenticada y la ejecuta. */
  async request({ method = 'GET', path, body, retry = true }) {
    await this.#ensureToken();

    const t = Date.now().toString();
    // Empíricamente (probado contra la API real): un GET sin cuerpo se firma
    // con sha256 de la cadena vacía, NO de "{}".
    const hasBody = body !== undefined && body !== null;
    const contentHash = hasBody ? sha256hex(JSON.stringify(body)) : sha256hex('');
    const stringToSign = [method.toUpperCase(), contentHash, '', path].join('\n');
    const sign = hmacSign(this.secret, this.clientId + this.accessToken + t + stringToSign);

    const headers = { ...this.#authHeaders(t, true), sign };
    let data;
    try {
      data = await this.#httpGet(path, headers);
    } catch (err) {
      if (err instanceof TuyaApiError) throw err;
      throw new Error(`Fallo de red con Tuya Open API: ${err.message}`);
    }

    if (!data.success) {
      const err = new TuyaApiError(data.code, data.msg);
      if (retry && AUTH_RETRY_CODES.has(data.code)) {
        // Token caducado/denegado: intentamos renovar y reintentamos una vez.
        this.accessToken = '';
        try {
          if (this.refreshToken) {
            await this.#tokenRequest(true);
          } else {
            await this.#tokenRequest(false);
          }
        } catch {
          // Si la renovación falla, forzamos token nuevo desde cero.
          this.refreshToken = '';
          await this.#tokenRequest(false);
        }
        return this.request({ method, path, body, retry: false });
      }
      throw err;
    }
    return data;
  }

  /**
   * Detalle del dispositivo. result: { id, name, online, category,
   * product_id, product_name, ip, ... }
   */
  async getDeviceDetail(deviceId) {
    const data = await this.request({ path: `/v1.0/iot-03/devices/${encodeURIComponent(deviceId)}` });
    return data.result;
  }

  /**
   * Estado (DPs) del dispositivo. result: [{ code, value }, ...]
   */
  async getDeviceStatus(deviceId) {
    const data = await this.request({ path: `/v1.0/iot-03/devices/${encodeURIComponent(deviceId)}/status` });
    return data.result;
  }
}
