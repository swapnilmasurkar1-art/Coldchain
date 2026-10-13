// Tiny JSON-file datastore: no native modules, works on any Node version / OS.
const fs = require('fs');
const path = require('path');

const FILE = process.env.DATA_FILE || path.join(__dirname, 'data', 'freshshield.json');

const iso = (minsAgo = 0) => new Date(Date.now() - minsAgo * 60000).toISOString();

function seed() {
  return {
    users: [
      { id: 1, name: 'Ramesh Kumar', role: 'farmer', location: 'Nashik, MH', avatar: 'R' },
      { id: 2, name: 'SwiftCold Fleet', role: 'logistics', location: 'Mumbai Hub', avatar: 'S' },
      { id: 3, name: 'FreshMart Pvt Ltd', role: 'buyer', location: 'Pune, MH', avatar: 'F' },
      { id: 4, name: 'FreshShield Admin', role: 'admin', location: 'Head Office', avatar: 'A' },
      { id: 5, name: 'Suresh Patil', role: 'farmer', location: 'Ratnagiri, MH', avatar: 'S' },
      { id: 6, name: 'BioPharma Ltd', role: 'shipper', location: 'Pune, MH', avatar: 'B' }
    ],
    shipments: [
      { id: 'SH-2026-001', product: 'Grapes (Black Seedless)', quantity: '2,500 kg', origin: 'Nashik', destination: 'Mumbai', status: 'in-transit', target_temp: -2, current_temp: -1.8, humidity: 85, progress: 65, farmer_id: 1, owner_name: 'Ramesh Kumar', vehicle_id: 'MH-14-AB-1234', value: 125000, distance_km: 165, fault: 0, created_at: iso(300) },
      { id: 'SH-2026-002', product: 'Alphonso Mangoes', quantity: '1,800 kg', origin: 'Ratnagiri', destination: 'Pune', status: 'in-transit', target_temp: 8, current_temp: 7.2, humidity: 88, progress: 40, farmer_id: 5, owner_name: 'Suresh Patil', vehicle_id: 'MH-08-CD-5678', value: 216000, distance_km: 330, fault: 0, created_at: iso(240) },
      { id: 'SH-2026-003', product: 'Green Peas', quantity: '3,200 kg', origin: 'Nashik', destination: 'Delhi', status: 'delivered', target_temp: 0, current_temp: 0.5, humidity: 82, progress: 100, farmer_id: 1, owner_name: 'Ramesh Kumar', vehicle_id: 'MH-14-EF-9012', value: 96000, distance_km: 1400, fault: 0, created_at: iso(2000) },
      { id: 'SH-2026-004', product: 'Insulin Vials', quantity: '500 units', origin: 'Pune', destination: 'Nagpur', status: 'breach', target_temp: 5, current_temp: 9.4, humidity: 70, progress: 55, farmer_id: 6, owner_name: 'BioPharma Ltd', vehicle_id: 'MH-12-GH-3456', value: 450000, distance_km: 720, fault: 25, created_at: iso(400) },
      { id: 'SH-2026-005', product: 'Fresh Fish (Bombay Duck)', quantity: '800 kg', origin: 'Mumbai', destination: 'Ahmedabad', status: 'in-transit', target_temp: 0, current_temp: -0.5, humidity: 90, progress: 25, farmer_id: 5, owner_name: 'Suresh Patil', vehicle_id: 'GJ-06-IJ-7890', value: 64000, distance_km: 530, fault: 0, created_at: iso(120) }
    ],
    fleet: [
      { id: 'MH-14-AB-1234', driver: 'Anil Sharma', status: 'in-transit', current_load: 'Grapes', temp: -1.8, fuel: 78, battery: 92 },
      { id: 'MH-08-CD-5678', driver: 'Ravi Kumar', status: 'in-transit', current_load: 'Mangoes', temp: 7.2, fuel: 65, battery: 88 },
      { id: 'MH-14-EF-9012', driver: 'Suresh Yadav', status: 'idle', current_load: '-', temp: 0.5, fuel: 92, battery: 95 },
      { id: 'MH-12-GH-3456', driver: 'Manoj Tiwari', status: 'breach', current_load: 'Insulin', temp: 9.4, fuel: 45, battery: 78 },
      { id: 'GJ-06-IJ-7890', driver: 'Kiran Patel', status: 'in-transit', current_load: 'Fish', temp: -0.5, fuel: 58, battery: 85 }
    ],
    alerts: [
      { id: 1, type: 'danger', icon: '🚨', title: 'Temperature Breach Detected', description: 'Shipment SH-2026-004 (Insulin) is above its 5°C limit', shipment_id: 'SH-2026-004', read: 0, created_at: iso(2) },
      { id: 2, type: 'warning', icon: '⚠️', title: 'Reefer Vibration Anomaly', description: 'Vehicle MH-14-AB-1234 shows an irregular compressor pattern', shipment_id: 'SH-2026-001', read: 0, created_at: iso(18) },
      { id: 3, type: 'warning', icon: '🔋', title: 'IoT Sensor Battery Low', description: 'Sensor on SH-2026-005 is at 22% battery', shipment_id: 'SH-2026-005', read: 0, created_at: iso(60) },
      { id: 4, type: 'success', icon: '✅', title: 'Delivered With Intact Cold Chain', description: 'SH-2026-003 reached Delhi within its temperature range', shipment_id: 'SH-2026-003', read: 1, created_at: iso(180) }
    ],
    disputes: [
      { id: 'DSP-001', shipment_id: 'SH-2026-004', issue: 'Temperature breach during transit', raised_by: 'BioPharma Ltd', against: 'SwiftCold Fleet', status: 'pending', amount: 450000, analysis: null, confidence: null, liable: null, created_at: iso(30), resolved_at: null },
      { id: 'DSP-002', shipment_id: 'SH-2026-003', issue: 'Delivery delayed by 14 hours', raised_by: 'FreshMart Pvt Ltd', against: 'SwiftCold Fleet', status: 'resolved', amount: 18000, analysis: 'GPS trace shows an unscheduled 14h halt at a toll plaza. Temperature stayed in range.', confidence: 96.4, liable: 'SwiftCold Fleet', created_at: iso(4000), resolved_at: iso(3995) }
    ],
    payments: [
      { id: 1, farmer_id: 1, shipment_id: 'SH-2026-003', product: 'Green Peas', amount: 96000, status: 'paid', kind: 'sale', date: iso(1500) },
      { id: 2, farmer_id: 1, shipment_id: 'SH-2026-008', product: 'Onions', amount: 145000, status: 'paid', kind: 'sale', date: iso(4300) },
      { id: 3, farmer_id: 1, shipment_id: 'SH-2026-015', product: 'Tomatoes', amount: 78000, status: 'paid', kind: 'sale', date: iso(7000) },
      { id: 4, farmer_id: 1, shipment_id: 'SH-2026-001', product: 'Grapes (Black Seedless)', amount: 125000, status: 'pending', kind: 'sale', date: iso(300) },
      { id: 5, farmer_id: 5, shipment_id: 'SH-2026-002', product: 'Alphonso Mangoes', amount: 216000, status: 'pending', kind: 'sale', date: iso(240) }
    ],
    sensor_logs: []
  };
}

let data;
try {
  data = JSON.parse(fs.readFileSync(FILE, 'utf8'));
} catch (e) {
  data = seed();
}

let timer = null;
function save() {
  clearTimeout(timer);
  timer = setTimeout(flush, 500);
}
function flush() {
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(data));
  } catch (e) {
    console.error('Could not save data:', e.message);
  }
}
function nextId(list) {
  return list.reduce((m, r) => Math.max(m, Number(r.id) || 0), 0) + 1;
}
function reset() {
  data = seed();
  flush();
}

process.on('SIGINT', () => { flush(); process.exit(0); });
process.on('SIGTERM', () => { flush(); process.exit(0); });

module.exports = { get data() { return data; }, save, flush, nextId, reset };
