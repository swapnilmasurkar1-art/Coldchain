# FreshShield — From Farm to Fresh

Cold-chain monitoring platform with four role-based dashboards (Farmer, Logistics, Buyer, Admin), live sensor streaming, breach alerts and evidence-based dispute resolution.

## Run it (Windows, Mac or Linux)

```
npm install
npm start
```

Open http://localhost:3000 and pick a role.

Needs Node 18 or newer. There are no native modules, so no Visual Studio / Python / compiler is needed, and it works on Node 24.

## Tech

- Backend: Node.js, Express, Socket.IO
- Storage: a JSON file at `data/freshshield.json` (created on first run, deleted data = fresh demo data)
- Frontend: plain HTML, CSS and JavaScript in `public/`

## Notes

- Sensor readings are simulated on the server every 2 seconds. To use real devices, post readings into the same update loop (for example from an MQTT subscriber).
- Login is a demo role picker, not real authentication. Add real auth before exposing it publicly.
- `POST /api/reset` restores the demo data.

## API

| Method | Endpoint | Purpose |
|---|---|---|
| POST | /api/login | Demo login by role |
| GET / POST | /api/shipments | List / create shipments |
| GET | /api/shipments/:id/logs | Recent sensor readings |
| GET / POST | /api/fleet | List / add vehicles |
| GET | /api/alerts, POST /api/alerts/read-all | Alerts |
| GET | /api/payments | Farmer payments |
| GET / POST | /api/disputes, POST /api/disputes/:id/resolve | Disputes |
| GET | /api/analytics, /api/users | Admin data |
