-- ============================================================
-- Esquema Supabase para el dashboard LY-C100A
-- Ejecútalo en el SQL Editor de tu proyecto (https://supabase.com/dashboard)
-- La tabla `readings` espeja el historial que sincroniza el backend
-- (server/src/sync/supabase.js).
-- ============================================================

create table if not exists public.readings (
  id           bigint generated always as identity primary key,
  device_id    text not null,
  ts           timestamptz not null,
  source       text not null default 'tuya',
  online       boolean not null default true,

  voltage_l1   numeric(8,2),          -- V   (null si no reportado)
  voltage_l2   numeric(8,2),          -- V
  voltage_l3   numeric(8,2),          -- V
  current      numeric(10,3),         -- A   (total)
  power        numeric(12,2),         -- W   (potencia activa)
  power_factor numeric(5,3),          -- 0..1
  temperature  numeric(6,2),          -- °C
  energy_kwh   numeric(14,6),         -- kWh acumulado
  balance_kwh  numeric(14,6),         -- kWh saldo prepagado (si aplica)

  created_at   timestamptz not null default now(),
  unique (device_id, ts)
);

-- Índices para consultas por rango temporal y por dispositivo
create index if not exists readings_device_ts_idx on public.readings (device_id, ts desc);
create index if not exists readings_ts_idx        on public.readings (ts desc);

-- Función auxiliar: medias por minuto/hora para consultas ligeras
create or replace function public.readings_bucketed(
  p_device text,
  p_from timestamptz,
  p_to timestamptz,
  p_bucket interval default interval '5 minutes'
) returns table (
  bucket timestamptz,
  voltage_l1 numeric,
  voltage_l2 numeric,
  power numeric,
  energy_kwh numeric,
  temperature numeric,
  samples bigint
) language sql stable as $$
  select
    date_trunc('minute', ts) at time zone 'utc'  -- o date_bin según versión
      + floor(extract(epoch from ts) / extract(epoch from p_bucket))::bigint
        * p_bucket as bucket,
    avg(voltage_l1) as voltage_l1,
    avg(voltage_l2) as voltage_l2,
    avg(power) as power,
    max(energy_kwh) as energy_kwh,
    avg(temperature) as temperature,
    count(*) as samples
  from public.readings
  where device_id = p_device and ts between p_from and p_to
  group by bucket
  order by bucket;
$$;

-- Permisos: el backend escribe con la clave service_role (RLS no aplica).
-- Si quieres exponer lecturas a clientes anónimos, activa RLS con una
-- política de solo lectura, por ejemplo:
--   alter table public.readings enable row level security;
--   create policy readings_read on public.readings
--     for select using (true);
