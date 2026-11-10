#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const root = path.resolve(__dirname, '..', '..');
const backend = path.join(root, 'backend');
const checks = [];
function add(id, status, detail, next = null) { checks.push({ id, status, detail, next }); }
function exists(rel) { return fs.existsSync(path.join(root, rel)); }
function text(rel) { return fs.readFileSync(path.join(root, rel), 'utf8'); }
function semver(v) { return String(v).split('.').map(x => Number(x) || 0); }
function gte(a, b) { const A=semver(a),B=semver(b); for(let i=0;i<3;i++){ if(A[i]!==B[i]) return A[i]>B[i]; } return true; }
const pkg = JSON.parse(text('backend/package.json'));
const mobilePkg = JSON.parse(text('mobile/package.json'));
const nodeRequired = (pkg.engines?.node || '').match(/>=(\d+)\.(\d+)\.(\d+)/)?.[0] || '22.23.4';
const nodeActual = process.versions.node;
add('node-engine', gte(nodeActual, nodeRequired) ? 'PASS' : 'UNVERIFIED', `required=${nodeRequired}; actual=${nodeActual}`, `Run under Node ${nodeRequired}+ for release certification.`);
add('backend-lockfile', exists('backend/package-lock.json') ? 'PASS' : 'FAIL', 'Committed backend package-lock.json required for deterministic install.');
add('mobile-lockfile', exists('mobile/package-lock.json') ? 'PASS' : 'FAIL', 'Committed mobile package-lock.json required for deterministic install.');
const docker = text('backend/docker/Dockerfile');
add('docker-node-pin', /FROM node:22\.23\.4-bookworm-slim/.test(docker) ? 'PASS' : 'FAIL', 'Docker image pins the declared Node release.');
add('docker-non-root', /USER node\b/.test(docker) ? 'PASS' : 'FAIL', 'Container switches to a non-root runtime user.');
add('docker-healthcheck', /HEALTHCHECK\b/.test(docker) ? 'PASS' : 'FAIL', 'Container exposes a healthcheck against /api/health.');
const workflow = text('.github/workflows/opscore-secure-release.yml');
add('ci-node-pin', /node-version:\s*["']22\.23\.4["']/.test(workflow) ? 'PASS' : 'FAIL', 'CI pins Node 22.23.4.');
add('ci-lockfile-install', /npm ci --ignore-scripts/.test(workflow) ? 'PASS' : 'FAIL', 'CI installs from lockfiles.');
add('ci-audit', /npm audit --audit-level=high/.test(workflow) ? 'PASS' : 'FAIL', 'CI performs high-severity dependency audits.');
add('ci-attestation', /uses:\s*actions\/attest@[^\s#]+/.test(workflow) ? 'PASS' : 'FAIL', 'CI prepares cryptographic release attestation.');
const hasDocker = (() => { try { cp.execFileSync('docker',['--version'],{stdio:'pipe'}); return true; } catch { return false; }})();
add('docker-runtime', hasDocker ? 'PASS' : 'UNVERIFIED', hasDocker ? 'Docker CLI available.' : 'Docker CLI unavailable in this execution environment.', 'Run docker build and container smoke test in the release runner.');
const envChecks = [
  ['postgres-live', Boolean(process.env.DATABASE_URL), process.env.DATABASE_URL ? 'DATABASE_URL provided; live PostgreSQL validation can run.' : 'DATABASE_URL not provided in this environment.', 'Provide DATABASE_URL in a controlled validation environment.'],
  ['oidc-live', Boolean(process.env.OIDC_ISSUER && process.env.OIDC_AUDIENCE && process.env.OIDC_TOKEN), (process.env.OIDC_ISSUER && process.env.OIDC_AUDIENCE && process.env.OIDC_TOKEN) ? 'OIDC inputs supplied.' : 'Real OIDC inputs not provided in this environment.', 'Provide real IdP issuer/audience/token in a controlled validation environment.'],
  ['shared-rate-state', Boolean(process.env.OPSC_EXPECTED_INSTANCES) ? (Number(process.env.OPSC_EXPECTED_INSTANCES) === 1 || process.env.OPSC_SHARED_STATE_CONFIRMED === 'true') : false, process.env.OPSC_EXPECTED_INSTANCES ? 'Explicit expected instance count supplied; distributed state is required when count exceeds one.' : 'OPSC_EXPECTED_INSTANCES is not declared, so rate-limit deployment shape is unverified.', 'Set OPSC_EXPECTED_INSTANCES explicitly; for more than one instance also use FIREWALL_RATE_STATE=database and OPSC_SHARED_STATE_CONFIRMED=true.'],
  ['network-edge', false, 'TLS termination, WAF/reverse proxy, segmentation and DNS controls are deployment-bound.', 'Validate at the buyer edge.'],
  ['external-observability', false, 'Central logs/metrics/traces and alert routing are deployment-bound.', 'Connect the buyer observability stack.'],
  ['mobile-signing', false, 'Signed Android/iOS artifacts require real signing credentials and build services.', 'Run signed builds on the buyer/build environment.'],
  ['physical-mobile', false, 'Physical-device behavior requires device validation.', 'Run field-device acceptance on representative devices.']
];
for (const [id, ok, detail, next] of envChecks) add(id, ok ? 'PASS' : 'UNVERIFIED', detail, next);

// --- Automated Gate-Purge: static mock / hardcoded response scan (production purity) ---
(function mockHardcodePurgeGate() {
  const scanRoots = [
    path.join(backend, 'src'),
    path.join(backend, 'web'),
    path.join(backend, 'scripts')
  ];
  const denyPatterns = [
    { id: 'hardcoded-mock-array', re: /\b(?:MOCK_[A-Z0-9_]+|mockData|fakeResponse|dummyResponse)\b/ },
    { id: 'todo-mock-return', re: /return\s+\{\s*mock\s*:\s*true\b/i },
    { id: 'placeholder-not-implemented', re: /NOT_IMPLEMENTED_PLACEHOLDER/ },
    { id: 'hardcoded-demo-seed', re: /DEMO_ONLY_HARDCODED_SEED/ }
  ];
  const allowPath = (rel) => /(?:test\/|\.test\.js$|production-readiness|sector-neutrality|CHANGELOG)/i.test(rel);
  const hits = [];
  function walk(dir) {
    if (!fs.existsSync(dir)) return;
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, ent.name);
      const rel = path.relative(backend, abs).replace(/\\/g, '/');
      if (ent.isDirectory()) {
        if (ent.name === 'node_modules' || ent.name === 'data' || ent.name === '.git') continue;
        walk(abs);
      } else if (/\.(js|mjs|cjs)$/.test(ent.name) && !allowPath(rel)) {
        let text = '';
        try { text = fs.readFileSync(abs, 'utf8'); } catch { continue; }
        for (const ptn of denyPatterns) {
          if (ptn.re.test(text)) hits.push({ file: rel, pattern: ptn.id });
        }
      }
    }
  }
  for (const r of scanRoots) walk(r);
  add(
    'mock-hardcode-purge',
    hits.length === 0 ? 'PASS' : 'FAIL',
    hits.length === 0
      ? 'No mock/hardcoded cosmetic markers detected in runtime src/web/scripts.'
      : `Found ${hits.length} mock/hardcode marker(s): ${hits.slice(0, 8).map(h => h.file + ':' + h.pattern).join('; ')}`,
    hits.length ? 'Remove mock markers before production promote.' : null
  );
})();

const fatal = checks.filter(x => x.status === 'FAIL');
const report = {
  schemaVersion: 'opscore.production-readiness.v1',
  generatedAt: new Date().toISOString(),
  release: pkg.version,
  mobileVersion: mobilePkg.version,
  status: fatal.length ? 'FAIL' : checks.some(x => x.status === 'UNVERIFIED') ? 'CONDITIONAL' : 'PASS',
  checks,
  truthBoundary: 'Static gates and locally available runtime checks only. Infrastructure-bound items remain explicitly unverified until exercised in the target environment.'
};
const out = path.join(root, 'docs', 'verification', 'PRODUCTION_READINESS_RESULT.json');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
process.exitCode = fatal.length ? 1 : 0;
