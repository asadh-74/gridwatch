# GridWatch

Energy monitoring dashboard. Devices send voltage/current readings, PostgreSQL computes power and energy, and a vanilla-JS dashboard visualises it.

**Stack:** PostgreSQL, Node.js, Express, vanilla JavaScript (Canvas chart), Render.

## SQL highlights
- Normalised schema with foreign keys, `CHECK` constraints and a composite index `(device_id, ts DESC)`
- Generated column: `power_w = voltage * current_a`
- View `device_summary` using `LEFT JOIN` + aggregates
- Window function: 3-hour moving average over hourly kWh
- `generate_series` to seed 48 hours of realistic data
- Parameterised queries throughout (no SQL injection)

## API
| Method | Route | Purpose |
|---|---|---|
| GET | /api/devices | Device summaries |
| POST | /api/devices | Add device |
| DELETE | /api/devices/:id | Remove device |
| POST | /api/readings | Add reading |
| GET | /api/readings/recent | Last 10 readings |
| GET | /api/hourly?hours=24&device=1 | Hourly kWh + moving average |
| POST | /api/seed | Load demo data |

## Run locally
```
createdb gridwatch
npm install
DATABASE_URL=postgres://localhost:5432/gridwatch npm start
```
Open http://localhost:3000 and click "Load demo data".

## Deploy on Render
1. Push this folder to a GitHub repo.
2. Render dashboard > New > Blueprint > select the repo. `render.yaml` creates the Postgres database and web service and wires `DATABASE_URL`.
3. Wait for the deploy, open the URL, click "Load demo data".

Note: free Render Postgres instances expire after a limited period, and free web services sleep when idle, so the first request may be slow.
