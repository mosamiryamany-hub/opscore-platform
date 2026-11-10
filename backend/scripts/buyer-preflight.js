///usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const releaseRoot = path.resolve(root, '..');
const checks = [];
function add(name, pass, detail = '') {
  checks.push({
    name,
    pass: Boolean(pass),
    detail
  });
}
function run(args, env = {}) {
  try {
    return {
      ok: true,
      out: cp.execFileSync(process.execPath, args, {
        cwd: root,
        env: {
          ...process.env,
          ...env
        },
        encoding: 'utf8',
        stdio: 'pipe'
      })
    };
  } catch (e) {
    return {
      ok: false,
      out: String(e.stdout || e.stderr || e.message || e)
    };
  }
}
const required = [
  'package.json',
  'package-lock.json',
  'README.md',
  'SALES_README.md',
  'BUYER_QUICKSTART.md',
  'src/server.js',
  'src/store.js',
  'src/security.js',
  'web/index.html',
  'web/portal.html',
  'scripts/seed-demo.js',
  'scripts/clean-demo-data.js',
  'scripts/buyer-acceptance.js',
  'scripts/verify-backup.js',
  'scripts/verify-export.js',
  'scripts/recovery-drill.js'
];
for (const rel of required)
  add(`required artifact: ${ rel }`, fs.existsSync(path.join(root, rel)));
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const actual = process.versions.node.split('.').map(Number);
const nodeOK = actual[0] === 22 && (actual[1] > 23 || actual[1] === 23 && actual[2] >= 4);
add(`Node satisfies declared engine ${ pkg.engines?.node || 'unspecified' }`, nodeOK, `runtime=${ process.versions.node }; required range is >=22.23.4 <23`);
const pgDeclared = pkg.dependencies?.pg === '8.23.1';
add('PostgreSQL driver pg@8.23.1 is a pinned runtime dependency', pgDeclared, `dependencies.pg=${pkg.dependencies?.pg || 'missing'}`);
let pgRuntimeOK = false;
try { pgRuntimeOK = typeof require('pg').Pool === 'function'; } catch {}
add('PostgreSQL driver is loadable from the installed package', pgRuntimeOK, pgRuntimeOK ? 'pg.Pool is available' : 'Run npm ci from the backend directory; no manual install should be needed');
const cleanup = run(['scripts/clean-demo-data.js'], {
  OPSC_DEMO_CLEANUP: 'CONFIRM',
  NODE_ENV: 'test'
});
add('demo runtime cleanup before evaluation', cleanup.ok, cleanup.ok ? 'PASS' : 'cleanup failed');
const demoData = path.join(root, 'data');
const attachments = path.join(demoData, 'files');
add('no bundled runtime attachment artifacts', !fs.existsSync(attachments) || fs.readdirSync(attachments).length === 0);
add('demo seed is explicitly non-production', /non-production/i.test(fs.readFileSync(path.join(root, 'scripts', 'seed-demo.js'), 'utf8')));
add('production blocks demo seed', /process\.env\.NODE_ENV\s*===\s*['"]production['"].*DEMO_SEED_FORBIDDEN_IN_PRODUCTION/s.test(fs.readFileSync(path.join(root, 'scripts', 'seed-demo.js'), 'utf8')));
for (const rel of [
    'src/server.js',
    'src/store.js',
    'src/security.js',
    'scripts/seed-demo.js',
    'scripts/clean-demo-data.js',
    'scripts/buyer-acceptance.js',
    'scripts/verify-backup.js',
    'scripts/verify-export.js',
    'scripts/recovery-drill.js'
  ]) {
  const r = run([
    '--check',
    rel
  ]);
  add(`syntax: ${ rel }`, r.ok, r.ok ? '' : 'syntax check failed');
}
const buyer = run(['scripts/buyer-acceptance.js']);
add('buyer acceptance harness', buyer.ok, buyer.ok ? 'PASS' : 'See command output');
const cleanupAfter = run(['scripts/clean-demo-data.js'], {
  OPSC_DEMO_CLEANUP: 'CONFIRM',
  NODE_ENV: 'test'
});
add('demo runtime cleanup after evaluation', cleanupAfter.ok, cleanupAfter.ok ? 'PASS' : 'cleanup failed');
const attachmentsAfter = path.join(demoData, 'files');
add('no runtime attachments after evaluation', !fs.existsSync(attachmentsAfter) || fs.readdirSync(attachmentsAfter).length === 0);
const filesToHash = [
  'package.json',
  'package-lock.json',
  'src/server.js',
  'src/store.js',
  'src/security.js',
  'web/index.html',
  'web/portal.html',
  'scripts/buyer-preflight.js'
];
const hashes = {};
for (const rel of filesToHash) {
  const f = path.join(root, rel);
  if (fs.existsSync(f))
    hashes[rel] = crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
}
const hardFailures = checks.filter(x => !x.pass);
const environmentWarnings = checks.filter(x => !x.pass && x.name.startsWith('Node satisfies'));
const report = {
  schema: 'opscore.buyer-preflight.v1',
  version: pkg.version,
  generatedAt: new Date().toISOString(),
  status: hardFailures.length ? 'FAIL' : 'PASS',
  checks,
  hashedArtifacts: hashes,
  environmentWarnings,
  truthBoundary: {
    localDemo: 'VERIFIABLE',
    productionInfrastructure: 'ENVIRONMENT_DEPENDENT',
    signedMobileArtifacts: 'UNVERIFIED',
    appStoreApproval: 'UNVERIFIED',
    externalProviderDelivery: 'ENVIRONMENT_DEPENDENT'
  }
};
const verificationDir = path.join(releaseRoot, 'docs', 'verification');
fs.mkdirSync(verificationDir, { recursive: true });
const out = path.join(verificationDir, 'BUYER_PREFLIGHT_RESULT.json');
fs.writeFileSync(out, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
process.exitCode = report.status === 'PASS' ? 0 : 1;
