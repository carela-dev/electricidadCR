#!/usr/bin/env python3
"""
Agente local para los breakers Tuya (lectura por red LAN, SIN Tuya Cloud).

Funciona igual en un Android con Termux y en una Raspberry Pi (Zero 2 W, 3 A+,
4, etc.). Lee los data points por el protocolo local de Tuya y los envía al
backend del panel (`POST /api/ingest`) con el token de su casa. El backend los
decodifica con la misma lógica que el sondeo en la nube, así que el panel, los
PIN y el historial no cambian — pero ya no se consume cuota de API de Tuya.

USO
---
  1) Rellena `config.json` (copia de config.example.json) con:
       - ingestUrl   : URL del backend (Render)
       - ingestToken : token por casa (el mismo que en TUYA_DEVICES del backend)
       - deviceId, ip, localKey, version de cada breaker
  2) Modo descubrimiento (para ver los DP y rellenar `dpMap`):
       python3 local_agent.py discover
  3) Modo normal (bucle continuo):
       python3 local_agent.py run

Termux (Android):  pkg install python && pip install tinytuya
Raspberry Pi:      sudo apt install python3-pip && pip3 install tinytuya
"""

import json
import os
import sys
import time
import urllib.error
import urllib.request

try:
    import tinytuya
except ImportError:
    print("Falta la librería tinytuya. Instálala con:  pip install tinytuya")
    sys.exit(1)

HERE = os.path.dirname(os.path.abspath(__file__))
CONFIG_PATH = os.path.join(HERE, "config.json")


def load_config():
    if not os.path.exists(CONFIG_PATH):
        print(f"No existe {CONFIG_PATH}. Copia config.example.json a config.json y rellénalo.")
        sys.exit(1)
    with open(CONFIG_PATH, encoding="utf-8") as fh:
        return json.load(fh)


def connect(house):
    dev = tinytuya.Device(house["deviceId"], house["ip"], house["localKey"])
    dev.set_version(float(house.get("version", 3.3)))
    dev.set_socketTimeout(int(house.get("timeoutSeconds", 5)))
    return dev


def read_dps(house):
    dev = connect(house)
    data = dev.status()
    if not data or "dps" not in data:
        raise RuntimeError(f"respuesta inesperada del breaker: {data}")
    return data["dps"], data


def map_codes(house, dps):
    dp_map = {str(k): v for k, v in house.get("dpMap", {}).items()}
    out = {}
    for dp_id, value in dps.items():
        code = dp_map.get(str(dp_id))
        if code:
            out[code] = value
    return out


def post_ingest(url, token, payload):
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=body,
        method="POST",
        headers={"Content-Type": "application/json", "X-Ingest-Token": token},
    )
    with urllib.request.urlopen(req, timeout=20) as resp:
        return resp.status, resp.read().decode("utf-8", "replace")[:200]


def discover(cfg):
    for house in cfg["houses"]:
        print(f"\n=== {house['name']} ({house['deviceId']}) @ {house['ip']} ===")
        try:
            dps, _ = read_dps(house)
            for dp_id, value in sorted(dps.items(), key=lambda kv: int(kv[0])):
                shown = value
                if isinstance(value, str) and len(value) > 44:
                    shown = value[:41] + "..."
                print(f"  DP {dp_id:>3}: {shown!r}")
            print("  → Copia a dpMap (config.json) los DP que importan, p. ej.:")
            print('     "dpMap": { "1": "total_forward_energy", "6": "phase_a",')
            print('                 "13": "balance_energy", "16": "switch", "18": "temp_current" }')
        except Exception as err:  # noqa: BLE001
            print("  ERROR:", err)


def run(cfg):
    interval = int(cfg.get("intervalSeconds", 45))
    url = cfg["ingestUrl"]
    print(f"Agente local activo · {len(cfg['houses'])} casa(s) · envío cada {interval}s")
    while True:
        for house in cfg["houses"]:
            try:
                dps, _ = read_dps(house)
                codes = map_codes(house, dps)
                if not codes:
                    print(f"[{house['name']}] sin DPs mapeados (revisa dpMap con el modo discover)")
                    continue
                status, text = post_ingest(
                    url,
                    house["ingestToken"],
                    {"house": house["id"], "ts": int(time.time() * 1000), "dps": codes},
                )
                print(f"[{house['name']}] {len(codes)} DPs → HTTP {status} {text}")
            except urllib.error.HTTPError as err:
                print(f"[{house['name']}] backend respondió HTTP {err.code}: {err.read()[:160]!r}")
            except Exception as err:  # noqa: BLE001
                print(f"[{house['name']}] error de lectura/envío: {err}")
        time.sleep(interval)


if __name__ == "__main__":
    config = load_config()
    mode = sys.argv[1] if len(sys.argv) > 1 else "run"
    if mode == "discover":
        discover(config)
    elif mode == "run":
        run(config)
    else:
        print("Uso: python3 local_agent.py [run|discover]")
        sys.exit(2)
