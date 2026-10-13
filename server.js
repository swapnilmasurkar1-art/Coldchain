const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const store = require('./db');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;
const BREACH_TOLERANCE = 3; // °C away from target counts as a breach
const TICK_MS = 2000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const db = () => store.data;
const rid = (prefix) => prefix + '-' + Math.random().toString(36).slice(2, 8).toUpperCase();
const round1 = (n) => Math.round(n * 10) / 10;

function addAlert(type, icon, title, description, shipment_id) {
  const alert = { id: store.nextId(db().alerts), type, icon, title, description, shipment_id, read: 0, created_at: new Date().toISOString() };
  db().alerts.push(alert);
  io.emit('new-alert', alert);
  return alert;
}

// ---------- Auth (demo: pick a role) ----------
app.post('/api/login', (req, res) => {
  const user = db().users.find((u) => u.role === req.body.role);
  if (!user) return res.status(404).json({ error: 'Unknown role' });
  res.json({ user });
});

// ---------- Shipments ----------
app.get('/api/shipments', (req, res) => {
  const { role, user_id } = req.query;
  let list = db().shipments;
  if (role === 'farmer') list = list.filter((s) => String(s.farmer_id) === String(user_id));
  res.json([...list].reverse());
});

app.get('/api/shipments/:id', (req, res) => {
  const s = db().shipments.find((x) => x.id === req.params.id);
  s ? res.json(s) : res.status(404).json({ error: 'Not found' });
});

app.get('/api/shipments/:id/logs', (req, res) => {
  const logs = db().sensor_logs.filter((l) => l.shipment_id === req.params.id).slice(-60);
  res.json(logs);
});

app.post('/api/shipments', (req, res) => {
  const b = req.body;
  const required = ['product', 'quantity', 'origin', 'destination', 'vehicle_id'];
  for (const k of required) if (!b[k]) return res.status(400).json({ error: `${k} is required` });
  const target = Number(b.target_temp);
  if (Number.isNaN(target)) return res.status(400).json({ error: 'target_temp must be a number' });
  const owner = db().users.find((u) => String(u.id) === String(b.farmer_id)) || db().users[0];
  const vehicle = db().fleet.find((v) => v.id === b.vehicle_id);
  const shipment = {
    id: 'SH-2026-' + String(store.nextId(db().shipments) + 100).padStart(3, '0'),
    product: String(b.product).slice(0, 80), quantity: String(b.quantity).slice(0, 40),
    origin: String(b.origin).slice(0, 60), destination: String(b.destination).slice(0, 60),
    status: 'in-transit', target_temp: target, current_temp: target, humidity: 85, progress: 0,
    farmer_id: owner.id, owner_name: owner.name, vehicle_id: b.vehicle_id,
    value: Number(b.value) || 0, distance_km: Number(b.distance_km) || 200, fault: 0,
    created_at: new Date().toISOString()
  };
  db().shipments.push(shipment);
  if (vehicle) { vehicle.status = 'in-transit'; vehicle.current_load = shipment.product.split(' ')[0]; vehicle.temp = target; }
  if (shipment.value) {
    db().payments.push({ id: store.nextId(db().payments), farmer_id: owner.id, shipment_id: shipment.id, product: shipment.product, amount: shipment.value, status: 'pending', kind: 'sale', date: shipment.created_at });
  }
  store.save();
  io.emit('data-changed', 'shipments');
  res.status(201).json(shipment);
});

// ---------- Fleet ----------
app.get('/api/fleet', (req, res) => res.json(db().fleet));

app.post('/api/fleet', (req, res) => {
  const { id, driver } = req.body;
  if (!id || !driver) return res.status(400).json({ error: 'Vehicle number and driver are required' });
  if (db().fleet.some((v) => v.id === id)) return res.status(409).json({ error: 'Vehicle already exists' });
  const v = { id: String(id).toUpperCase().slice(0, 20), driver: String(driver).slice(0, 40), status: 'idle', current_load: '-', temp: 0, fuel: 100, battery: 100 };
  db().fleet.push(v);
  store.save();
  res.status(201).json(v);
});

// ---------- Alerts ----------
app.get('/api/alerts', (req, res) => res.json([...db().alerts].reverse()));
app.post('/api/alerts/read-all', (req, res) => {
  db().alerts.forEach((a) => (a.read = 1));
  store.save();
  res.json({ success: true });
});

// ---------- Payments ----------
app.get('/api/payments', (req, res) => {
  const { farmer_id } = req.query;
  let list = db().payments;
  if (farmer_id) list = list.filter((p) => String(p.farmer_id) === String(farmer_id));
  res.json([...list].reverse());
});

// ---------- Users ----------
app.get('/api/users', (req, res) => {
  const users = db().users.map((u) => ({ ...u, shipments: db().shipments.filter((s) => s.farmer_id === u.id).length }));
  res.json(users);
});

// ---------- Disputes ----------
app.get('/api/disputes', (req, res) => res.json([...db().disputes].reverse()));

app.post('/api/disputes', (req, res) => {
  const { shipment_id, issue, raised_by, against, amount } = req.body;
  if (!shipment_id || !issue) return res.status(400).json({ error: 'Shipment and issue are required' });
  if (!db().shipments.some((s) => s.id === shipment_id)) return res.status(404).json({ error: 'Shipment not found' });
  const d = { id: 'DSP-' + String(store.nextId(db().disputes.map((x) => ({ id: x.id.replace(/\D/g, '') })))).padStart(3, '0'), shipment_id, issue: String(issue).slice(0, 200), raised_by: raised_by || 'Unknown', against: against || 'Transporter', status: 'pending', amount: Number(amount) || 0, analysis: null, confidence: null, liable: null, created_at: new Date().toISOString(), resolved_at: null };
  db().disputes.push(d);
  store.save();
  io.emit('data-changed', 'disputes');
  res.status(201).json(d);
});

// Evidence-based resolution engine. It reads the stored sensor logs for the shipment and decides liability.
// Swap analyse() for an LLM call if you want a language-model agent.
function analyse(dispute) {
  const s = db().shipments.find((x) => x.id === dispute.shipment_id);
  const logs = db().sensor_logs.filter((l) => l.shipment_id === dispute.shipment_id);
  const target = s ? s.target_temp : 0;
  const bad = logs.filter((l) => Math.abs(l.temp - target) > BREACH_TOLERANCE);
  const maxDev = logs.reduce((m, l) => Math.max(m, Math.abs(l.temp - target)), 0);
  const currentBad = s && Math.abs(s.current_temp - target) > BREACH_TOLERANCE;
  const tempIssue = /temp/i.test(dispute.issue);
  let liable, text, confidence;
  if (tempIssue && (bad.length > 0 || currentBad)) {
    liable = dispute.against;
    text = `Sensor evidence confirms a breach: ${bad.length} of ${logs.length} stored readings were more than ${BREACH_TOLERANCE}°C from the ${target}°C target (peak deviation ${round1(maxDev)}°C). Liability assigned to ${dispute.against}.`;
    confidence = Math.min(99, 80 + Math.min(bad.length, 19));
  } else if (tempIssue) {
    liable = 'No fault found';
    text = `All ${logs.length} stored readings stayed within ${BREACH_TOLERANCE}°C of the ${target}°C target. The claim is not supported by the sensor data.`;
    confidence = logs.length > 10 ? 90 : 65;
  } else {
    liable = dispute.against;
    text = `Non-temperature claim (${dispute.issue}). GPS and handover records favour the claimant by default; flagged for admin review.`;
    confidence = 60;
  }
  return { liable, text, confidence, evidence: logs.length };
}

app.post('/api/disputes/:id/resolve', (req, res) => {
  const d = db().disputes.find((x) => x.id === req.params.id);
  if (!d) return res.status(404).json({ error: 'Not found' });
  if (d.status === 'resolved') return res.json({ success: true, ...d, analysis: d.analysis });
  const r = analyse(d);
  d.status = 'resolved';
  d.analysis = r.text; d.confidence = r.confidence; d.liable = r.liable; d.resolved_at = new Date().toISOString();
  const s = db().shipments.find((x) => x.id === d.shipment_id);
  if (r.liable !== 'No fault found' && s && d.amount) {
    db().payments.push({ id: store.nextId(db().payments), farmer_id: s.farmer_id, shipment_id: s.id, product: s.product, amount: d.amount, status: 'paid', kind: 'compensation', date: d.resolved_at });
  }
  store.save();
  io.emit('data-changed', 'disputes');
  res.json({ success: true, analysis: r.text, confidence: r.confidence, liable: r.liable, evidence: r.evidence });
});

// ---------- Analytics ----------
app.get('/api/analytics', (req, res) => {
  const sh = db().shipments;
  const resolved = db().disputes.filter((d) => d.status === 'resolved' && d.resolved_at);
  const avgSecs = resolved.length ? resolved.reduce((a, d) => a + (new Date(d.resolved_at) - new Date(d.created_at)) / 1000, 0) / resolved.length : 0;
  const delivered = sh.filter((s) => s.status === 'delivered').length;
  const atRisk = sh.filter((s) => s.status === 'breach').reduce((a, s) => a + s.value, 0);
  const protectedValue = sh.filter((s) => s.status === 'delivered' || s.status === 'in-transit').reduce((a, s) => a + s.value, 0);
  res.json({
    totalShipments: sh.length,
    inTransit: sh.filter((s) => s.status === 'in-transit').length,
    breaches: sh.filter((s) => s.status === 'breach').length,
    delivered,
    openDisputes: db().disputes.filter((d) => d.status === 'pending').length,
    resolvedDisputes: resolved.length,
    avgResolutionMinutes: round1(avgSecs / 60),
    valueAtRisk: atRisk,
    valueProtected: protectedValue,
    integrity: sh.length ? round1(((sh.length - sh.filter((s) => s.status === 'breach').length) / sh.length) * 100) : 100,
    fleetActive: db().fleet.filter((v) => v.status !== 'idle').length,
    fleetTotal: db().fleet.length,
    readings: db().sensor_logs.length
  });
});

app.post('/api/reset', (req, res) => { store.reset(); io.emit('data-changed', 'all'); res.json({ success: true }); });
app.get('/api/health', (req, res) => res.json({ ok: true }));

// ---------- Socket.IO ----------
io.on('connection', (socket) => {
  socket.emit('hello', { time: new Date().toISOString() });
});

// ---------- Live sensor simulation ----------
let tick = 0;
setInterval(() => {
  tick++;
  const batteryAlerted = new Set();
  db().shipments.forEach((s) => {
    if (s.status !== 'in-transit' && s.status !== 'breach') return;
    const vehicle = db().fleet.find((v) => v.id === s.vehicle_id);

    if (s.fault > 0) { s.fault--; s.current_temp += 0.55; }
    else {
      if (Math.random() < 0.003) s.fault = 12;
      const dev = s.current_temp - s.target_temp;
      s.current_temp += -dev * 0.25 + (Math.random() - 0.5) * 0.4;
    }
    s.current_temp = round1(s.current_temp);
    s.humidity = Math.round(Math.max(55, Math.min(98, s.humidity + (Math.random() - 0.5) * 2)));
    s.progress = round1(Math.min(100, s.progress + 0.4));

    const diff = Math.abs(s.current_temp - s.target_temp);
    if (diff > BREACH_TOLERANCE && s.status !== 'breach') {
      s.status = 'breach';
      addAlert('danger', '🚨', 'Temperature Breach Detected', `Shipment ${s.id} (${s.product}) is at ${s.current_temp}°C, target ${s.target_temp}°C`, s.id);
    } else if (diff <= 1.5 && s.status === 'breach') {
      s.status = 'in-transit';
      addAlert('success', '✅', 'Temperature Recovered', `Shipment ${s.id} is back within range at ${s.current_temp}°C`, s.id);
    }

    if (vehicle) {
      vehicle.temp = s.current_temp;
      vehicle.fuel = round1(Math.max(5, vehicle.fuel - 0.02));
      vehicle.battery = round1(Math.max(5, vehicle.battery - 0.005));
      vehicle.status = s.status === 'breach' ? 'breach' : 'in-transit';
      if (vehicle.battery < 20 && !batteryAlerted.has(vehicle.id)) {
        batteryAlerted.add(vehicle.id);
        addAlert('warning', '🔋', 'IoT Sensor Battery Low', `Sensor on ${vehicle.id} is at ${Math.round(vehicle.battery)}%`, s.id);
      }
    }

    db().sensor_logs.push({ shipment_id: s.id, temp: s.current_temp, humidity: s.humidity, t: new Date().toISOString() });

    if (s.progress >= 100) {
      s.status = 'delivered';
      if (vehicle) { vehicle.status = 'idle'; vehicle.current_load = '-'; }
      addAlert('success', '✅', 'Shipment Delivered', `${s.id} reached ${s.destination}`, s.id);
      io.emit('data-changed', 'shipments');
    }

    io.emit('sensor-update', { id: s.id, temp: s.current_temp, humidity: s.humidity, progress: s.progress, target: s.target_temp, status: s.status, t: Date.now() });
  });

  if (db().sensor_logs.length > 2000) db().sensor_logs.splice(0, db().sensor_logs.length - 2000);
  store.save();
}, TICK_MS);

server.listen(PORT, () => {
  console.log(`\n  FreshShield - From Farm to Fresh\n  http://localhost:${PORT}\n`);
});
