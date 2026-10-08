const express = require('express');
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool();
pool.on('connect', (client) => client.query('SET search_path TO gridwatch'));

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const wrap = (fn) => (req, res) => fn(req, res).catch((e) => { console.error(e); res.status(500).json({ error: 'Server error' }); });
const num = (v) => (v !== '' && v !== null && Number.isFinite(Number(v)) ? Number(v) : null);

app.get('/health', (_, res) => res.send('ok'));

app.get('/api/devices', wrap(async (_, res) => {
  const { rows } = await pool.query('SELECT * FROM device_summary ORDER BY id');
  res.json(rows);
}));

app.post('/api/devices', wrap(async (req, res) => {
  const name = String(req.body.name || '').trim().slice(0, 60);
  const location = String(req.body.location || 'Unassigned').trim().slice(0, 60);
  if (!name) return res.status(400).json({ error: 'Name is required' });
  try {
    const { rows } = await pool.query('INSERT INTO devices (name, location) VALUES ($1,$2) RETURNING *', [name, location]);
    res.status(201).json(rows[0]);
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'Device name already exists' });
    throw e;
  }
}));

app.delete('/api/devices/:id', wrap(async (req, res) => {
  await pool.query('DELETE FROM devices WHERE id = $1', [num(req.params.id)]);
  res.status(204).end();
}));

app.post('/api/readings', wrap(async (req, res) => {
  const device_id = num(req.body.device_id), voltage = num(req.body.voltage), current = num(req.body.current_a);
  if (device_id === null || voltage === null || current === null)
    return res.status(400).json({ error: 'device_id, voltage and current_a must be numbers' });
  try {
    const { rows } = await pool.query(
      'INSERT INTO readings (device_id, voltage, current_a) VALUES ($1,$2,$3) RETURNING *', [device_id, voltage, current]);
    res.status(201).json(rows[0]);
  } catch (e) {
    if (e.code === '23503' || e.code === '23514') return res.status(400).json({ error: 'Invalid device or value out of range' });
    throw e;
  }
}));

app.get('/api/readings/recent', wrap(async (_, res) => {
  const { rows } = await pool.query(
    `SELECT r.id, d.name AS device, r.voltage, r.current_a, r.power_w, r.ts
     FROM readings r JOIN devices d ON d.id = r.device_id
     ORDER BY r.ts DESC LIMIT 10`);
  res.json(rows);
}));

// Hourly energy with a 3-hour moving average (window function)
app.get('/api/hourly', wrap(async (req, res) => {
  const device = num(req.query.device);
  const hours = Math.min(Math.max(num(req.query.hours) || 24, 1), 168);
  const { rows } = await pool.query(
    `SELECT bucket, kwh, ROUND(AVG(kwh) OVER (ORDER BY bucket ROWS BETWEEN 2 PRECEDING AND CURRENT ROW), 3) AS moving_avg
     FROM (
       SELECT date_trunc('hour', ts) AS bucket, ROUND(SUM(power_w) * 5 / 60 / 1000, 3) AS kwh
       FROM readings
       WHERE ts > now() - make_interval(hours => $1) AND ($2::int IS NULL OR device_id = $2)
       GROUP BY 1
     ) h ORDER BY bucket`, [hours, device]);
  res.json(rows);
}));

app.post('/api/seed', wrap(async (_, res) => {
  await pool.query(`INSERT INTO devices (name, location) VALUES
    ('Main Meter','Ground Floor'),('AC Unit','Bedroom'),('Workshop Bench','Garage') ON CONFLICT (name) DO NOTHING`);
  await pool.query(
    `INSERT INTO readings (device_id, voltage, current_a, ts)
     SELECT d.id,
            220 + (random()*8 - 4),
            GREATEST(0.2, base.amps + 3 * sin(extract(hour FROM t) / 24.0 * 2 * pi()) + random() * 1.5),
            t
     FROM devices d
     JOIN (VALUES ('Main Meter', 6.0), ('AC Unit', 5.0), ('Workshop Bench', 2.5)) AS base(name, amps) ON base.name = d.name
     CROSS JOIN generate_series(now() - interval '48 hours', now(), interval '5 minutes') AS t`);
  res.json({ ok: true });
}));

async function init() {
  await pool.query('CREATE SCHEMA IF NOT EXISTS gridwatch');
  await pool.query(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log(`GridWatch listening on ${port}`));
}
init().catch((e) => { console.error('Startup failed:', e); process.exit(1); });
