#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');

const root = path.resolve(__dirname, '..');
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'opscore-recovery-gate-'));
const db = path.join(work, 'opscore.sqlite');
const env = { ...process.env, NODE_ENV: 'development', SQLITE_PATH: db, OPSC_DEMO_PASSWORD_ADMIN: 'RecoveryAdmin-2026!', OPSC_DEMO_PASSWORD_DISPATCHER: 'RecoveryDispatcher-2026!', OPSC_DEMO_PASSWORD_TECHNICIAN: 'RecoveryTechnician-2026!', OPSC_DEMO_PASSWORD_VIEWER: 'RecoveryViewer-2026!' };
let status = 'PASS';
let detail = null;
try {
  cp.execFileSync(process.execPath, ['scripts/seed-demo.js'], { cwd: root, env, stdio: 'pipe' });
  const out = cp.execFileSync(process.execPath, ['scripts/recovery-drill.js'], { cwd: root, env: { ...process.env, SQLITE_PATH: db }, encoding: 'utf8' });
  const result = JSON.parse(out);
  if (result.status !== 'PASS') throw new Error(`RECOVERY_DRILL_${result.error || 'FAILED'}`);
  detail = result;
} catch (e) {
  status = 'FAIL';
  detail = { error: e.message, stdout: e.stdout?.toString?.() || '', stderr: e.stderr?.toString?.() || '' };
} finally {
  fs.rmSync(work, { recursive: true, force: true });
}
const report = {
  schemaVersion: 'opscore.recovery-gate.v1',
  generatedAt: new Date().toISOString(),
  status,
  source: 'ephemeral non-production demo database',
  detail
};
const outDir = path.join(root, 'docs', 'verification');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'RECOVERY_GATE_RESULT.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
process.exitCode = status === 'PASS' ? 0 : 1;
