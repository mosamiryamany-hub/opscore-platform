const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');

test('database schema does not repeat geofence and worker guard DDL', () => {
  const source = fs.readFileSync(path.join(root, 'backend/src/db.js'), 'utf8');
  const geofence = (source.match(/CREATE TABLE IF NOT EXISTS geofences/g) || []).length;
  const guard = (source.match(/CREATE TABLE IF NOT EXISTS worker_guard_events/g) || []).length;
  assert.equal(geofence, 2); // base schema + its migration path
  assert.equal(guard, 2);
});

test('root gitignore protects local secrets and runtime database artifacts', () => {
  const source = fs.readFileSync(path.join(root, '.gitignore'), 'utf8');
  for (const entry of ['.env', 'backend/data/', '*.sqlite', 'node_modules/']) {
    assert.match(source, new RegExp(entry.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('PWA shell exists without caching API responses', () => {
  const sw = fs.readFileSync(path.join(root, 'backend/web/sw.js'), 'utf8');
  assert.match(sw, /startsWith\('\/api\/'\)/);
  assert.match(sw, /cache\.addAll/);
  assert.ok(fs.existsSync(path.join(root, 'backend/web/manifest.webmanifest')));
});
