CREATE TABLE IF NOT EXISTS devices (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  location TEXT NOT NULL DEFAULT 'Unassigned',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS readings (
  id BIGSERIAL PRIMARY KEY,
  device_id INT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  voltage NUMERIC(6,2) NOT NULL CHECK (voltage BETWEEN 0 AND 500),
  current_a NUMERIC(6,3) NOT NULL CHECK (current_a >= 0),
  power_w NUMERIC(10,2) GENERATED ALWAYS AS (voltage * current_a) STORED,
  ts TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_readings_device_ts ON readings (device_id, ts DESC);

-- Readings arrive every 5 minutes, so kWh = watts * (5/60) / 1000
CREATE OR REPLACE VIEW device_summary AS
SELECT d.id, d.name, d.location,
       COUNT(r.id)                                   AS readings,
       ROUND(COALESCE(SUM(r.power_w) * 5 / 60 / 1000, 0), 2) AS total_kwh,
       ROUND(COALESCE(AVG(r.power_w), 0), 1)         AS avg_watts,
       COALESCE(MAX(r.power_w), 0)                   AS peak_watts,
       MAX(r.ts)                                     AS last_seen
FROM devices d
LEFT JOIN readings r ON r.device_id = d.id
GROUP BY d.id;
