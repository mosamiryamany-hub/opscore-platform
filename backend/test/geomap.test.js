'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('../web/geomap.js');
const { coversPoint } = require('../src/geofencing');

test('projection round-trips and matches Web Mercator reference values', () => {
  for (const [lng, lat, z] of [[31.2357, 30.0444, 12], [-73.9857, 40.7484, 17], [151.2, -33.87, 5]]) {
    const [x, y] = G.project(lng, lat, z), [l2, a2] = G.unproject(x, y, z);
    assert.ok(Math.abs(l2 - lng) < 1e-9 && Math.abs(a2 - lat) < 1e-9);
  }
  assert.deepEqual(G.project(0, 0, 0).map(Math.round), [128, 128]);
  assert.ok(Math.abs(G.metersPerPixel(0, 0) - 156543.03392) < 1e-3);
  assert.ok(Math.abs(G.metersPerPixel(60, 10) - G.metersPerPixel(0, 10) / 2) < 1e-6);
});

test('haversine matches reference geometry (1 deg lat = 111.195 km; Cairo Tower to Giza pyramid ~ 11.4 km)', () => {
  assert.ok(Math.abs(G.haversineM(31, 30, 31, 31) - 111195) < 20);
  const d = G.haversineM(31.2243, 30.0459, 31.1342, 29.9792);
  assert.ok(d > 11300 && d < 11500, String(d));
  assert.equal(G.haversineM(31, 30, 31, 30), 0);
});

test('client polygon test agrees with the server geofence semantics (boundary in, hole out)', () => {
  const g = { type: 'Polygon', coordinates: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]], [[4, 4], [6, 4], [6, 6], [4, 6], [4, 4]]] };
  for (const p of [[1, 1], [0, 5], [10, 10], [5, 5], [4, 5], [11, 5], [-1, -1]])
    assert.equal(G.inPolygon(p, g), coversPoint(g, p), JSON.stringify(p));
});

test('tile URL wraps X across the antimeridian and rejects out-of-range Y', () => {
  assert.equal(G.tileUrl('/t/{z}/{x}/{y}.png', 3, -1, 2), '/t/3/7/2.png');
  assert.equal(G.tileUrl('/t/{z}/{x}/{y}.png', 3, 8, 2), '/t/3/0/2.png');
  assert.equal(G.tileUrl('/t/{z}/{x}/{y}.png', 3, 0, 8), null);
});

test('clustering merges nearby markers and keeps distant ones apart', () => {
  const c = G.clusterPoints([{ x: 10, y: 10 }, { x: 12, y: 14 }, { x: 300, y: 300 }], 34);
  assert.equal(c.length, 2); assert.equal(c.find(k => k.members.length === 2).members.length, 2);
});

test('freshness classification', () => {
  const now = Date.now();
  assert.equal(G.freshness(new Date(now - 60e3).toISOString(), now), 'fresh');
  assert.equal(G.freshness(new Date(now - 3600e3).toISOString(), now), 'stale');
  assert.equal(G.freshness(new Date(now - 9 * 3600e3).toISOString(), now), 'old');
  assert.equal(G.freshness('garbage', now), 'old');
});

test('GeoMap ingests data, drops invalid / null-island fixes, computes geofence + distance, paints without throwing', () => {
  const calls = [];
  const ctx = new Proxy({}, { get: (t, k) => k === 'measureText' ? () => ({ width: 50 }) : (typeof t[k] === 'undefined' ? (...a) => calls.push(k) : t[k]), set: (t, k, v) => { t[k] = v; return true; } });
  const mk = () => ({ style: {}, classList: { add() {}, remove() {} }, appendChild() {}, setAttribute() {}, addEventListener() {}, getBoundingClientRect: () => ({ width: 800, height: 500, left: 0, top: 0 }), getContext: () => ctx, closest: () => null, set textContent(v) {}, get textContent() { return ''; } });
  global.document = { createElement: mk }; global.Image = class { set src(v) { this.u = v; } };
  const win = { OPSCORE_MAP_CONFIG: undefined, addEventListener() {}, requestAnimationFrame: f => f(), devicePixelRatio: 2 };
  Object.assign(globalThis, { addEventListener() {}, requestAnimationFrame: win.requestAnimationFrame, devicePixelRatio: 2 });
  const m = new G.GeoMap(mk());
  const fence = { name: 'Zone A', enabled: 1, geometry: { type: 'Polygon', coordinates: [[[31.2, 30.0], [31.3, 30.0], [31.3, 30.1], [31.2, 30.1], [31.2, 30.0]]] } };
  const now = new Date().toISOString();
  m.setData({ geofences: [fence], points: [
    { technicianId: 't1', latitude: 30.05, longitude: 31.25, accuracyMeters: 8, checkedInAt: now, siteLatitude: 30.06, siteLongitude: 31.26, siteName: 'S1' },
    { technicianId: 't2', latitude: 0, longitude: 0, accuracyMeters: 5, checkedInAt: now },
    { technicianId: 't3', latitude: 'x', longitude: 31, checkedInAt: now },
    { technicianId: 't4', latitude: 95, longitude: 31, checkedInAt: now },
    { technicianId: 't5', latitude: 30.5, longitude: 31.9, accuracyMeters: 400, checkedInAt: now }] });
  assert.equal(m.techs.length, 2); assert.equal(m.skipped, 3);
  const t1 = m.techs.find(t => t.p.technicianId === 't1');
  assert.deepEqual(t1.fences, ['Zone A']); assert.equal(t1.poor, false);
  assert.ok(t1.distM > 1400 && t1.distM < 1700, String(t1.distM));
  assert.equal(m.techs.find(t => t.p.technicianId === 't5').poor, true);
  m._paint(); assert.ok(calls.includes('arc') && calls.includes('fill'));
  m.zoomBy(2, { x: 100, y: 100 }); m._pan(30, -20); m._paint(); m.fit(); m._paint();
});

test('map provider is disabled by default and unlicensed or non-allowlisted external origins fail closed', () => {
  assert.deepEqual(G.validateMapTileConfig({ tileUrl: '', attribution: '' }).tileUrl, '');
  const missingLicense = G.validateMapTileConfig({
    tileUrl: 'https://tiles.example.test/{z}/{x}/{y}.png',
    attribution: 'Tiles by provider',
    providerConfigured: true,
    licenseAcknowledged: false,
    allowedTileOrigins: ['https://tiles.example.test']
  });
  assert.equal(missingLicense.tileUrl, '');
  assert.equal(missingLicense.externalTilesEnabled, false);
  const missingAllowlist = G.validateMapTileConfig({
    tileUrl: 'https://tiles.example.test/{z}/{x}/{y}.png',
    attribution: 'Tiles by provider',
    providerConfigured: true,
    licenseAcknowledged: true,
    allowedTileOrigins: []
  });
  assert.equal(missingAllowlist.tileUrl, '');
  assert.equal(missingAllowlist.externalTilesEnabled, false);
});

test('map provider enables HTTPS tiles only after explicit license and exact-origin approval', () => {
  const approved = G.validateMapTileConfig({
    tileUrl: 'https://tiles.example.test/{z}/{x}/{y}.png',
    attribution: '© Licensed Provider',
    providerConfigured: true,
    licenseAcknowledged: true,
    allowedTileOrigins: ['https://tiles.example.test']
  });
  assert.equal(approved.tileUrl, 'https://tiles.example.test/{z}/{x}/{y}.png');
  assert.equal(approved.externalTilesEnabled, true);
  assert.deepEqual(approved.allowedTileOrigins, ['https://tiles.example.test']);
  const wrongOrigin = G.validateMapTileConfig({
    tileUrl: 'https://attacker.example.test/{z}/{x}/{y}.png',
    attribution: '© Licensed Provider',
    providerConfigured: true,
    licenseAcknowledged: true,
    allowedTileOrigins: ['https://tiles.example.test']
  });
  assert.equal(wrongOrigin.tileUrl, '');
});

test('map tile template rejects protocol-relative URLs and incomplete path templates', () => {
  for (const tileUrl of ['//tiles.example.test/{z}/{x}/{y}.png', 'javascript:alert(1)', '/tiles/{z}/{x}.png']) {
    assert.equal(G.validateMapTileConfig({
      tileUrl,
      attribution: 'test',
      providerConfigured: true,
      licenseAcknowledged: true,
      allowedTileOrigins: ['https://tiles.example.test']
    }).tileUrl, '');
  }
});

test('map config default is CSP-compatible and external tiles stay disabled until the buyer opts in', () => {
  const fs = require('node:fs'), path = require('node:path');
  const webRoot = path.join(__dirname, '..', 'web');
  const mapConfigSource = fs.readFileSync(path.join(webRoot, 'map-config.js'), 'utf8');
  const vercelJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'vercel.json'), 'utf8'));
  const cspHeader = vercelJson.headers.flatMap(h => h.headers).find(h => h.key === 'Content-Security-Policy').value;
  const imgSrc = cspHeader.split(';').map(d => d.trim()).find(d => d.startsWith('img-src'));
  assert.ok(imgSrc.includes("'self'"), 'CSP img-src must keep same-origin proxy mode working');
  assert.ok(!/https:\/\//.test(mapConfigSource.split('window.OPSCORE_MAP_CONFIG')[1] || ''), 'map-config defaults must not embed an external https origin');
  assert.match(mapConfigSource, /tileUrl: ''/, 'tileUrl default empty');
  assert.match(mapConfigSource, /providerConfigured: false/, 'providerConfigured default false');
  assert.match(mapConfigSource, /licenseAcknowledged: false/, 'licenseAcknowledged default false');
  assert.match(mapConfigSource, /allowedTileOrigins: \[\]/, 'allowedTileOrigins default empty');
  assert.match(mapConfigSource, /'\/tiles\/\{z\}\/\{x\}\/\{y\}\.png'/, 'same-origin proxy pattern documented');
  // Execute the browser file exactly as the browser would, against a stub window,
  // instead of JSON.parse (the object literal has unquoted keys, not valid JSON).
  const stubWindow = {};
  new Function('window', mapConfigSource)(stubWindow);
  const mapDefaults = stubWindow.OPSCORE_MAP_CONFIG;
  assert.equal(G.validateMapTileConfig(mapDefaults).externalTilesEnabled, false, 'defaults must not enable external tiles');
  const proxyPath = G.validateMapTileConfig({ tileUrl: '/tiles/{z}/{x}/{y}.png' });
  assert.equal(proxyPath.externalTilesEnabled, false, 'relative proxy path needs no CSP change and stays internal');
});
