#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');

const root = path.resolve(__dirname, '..');
const repoRoot = path.resolve(root, '..');
let failures = 0;
function check(id, ok, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${id}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}
function read(rel) { return fs.readFileSync(path.join(root, rel), 'utf8'); }
const pkg = JSON.parse(read('package.json'));

check('package-version', /^\d+\.\d+\.\d+$/.test(pkg.version), `version=${pkg.version}`);
check('public-package-metadata', pkg.private === false, `private=${pkg.private}`);
check('node-engine-bounded', pkg.engines?.node === '>=22.23.4 <23', `engines.node=${pkg.engines?.node}`);
check('lint-config-present', fs.existsSync(path.join(repoRoot, 'eslint.config.js')));
check('prettier-config-present', fs.existsSync(path.join(repoRoot, '.prettierrc.json')));
check('secure-release-workflow-present', fs.existsSync(path.join(repoRoot, '.github/workflows/opscore-secure-release.yml')));

const seed = read('scripts/seed-demo.js');
check('demo-seed-no-hardcoded-passwords', !/password:\s*['"][^'"]+['"]/.test(seed), 'demo passwords must come from environment');
check('demo-seed-production-block', /DEMO_SEED_FORBIDDEN_IN_PRODUCTION/.test(seed));
const cli = read('bin/opscore.js');
check('cli-demo-no-hardcoded-passwords', !/password:\s*['"][^'"]+['"]/.test(cli), 'demo owner password must come from environment');
const runbook = fs.readFileSync(path.join(repoRoot, 'docs', '00-START-HERE', 'DEMO_RUNBOOK.md'), 'utf8');
const legacyDemoCredentialMarker = ['Demo', 'Owner', '2026', 'Local!'].join('-');
check('demo-runbook-no-legacy-password', !runbook.includes(legacyDemoCredentialMarker), 'runbook must not ship demo credentials');
check('proprietary-license-present', fs.existsSync(path.join(repoRoot, 'PROPRIETARY_LICENSE.txt')));

const config = read('src/config.js');
check('storage-provider-explicit', /storageProvider/.test(config) && /STORAGE_PROVIDER/.test(config), 'unsupported providers fail closed');
check('async-scrypt-login-path', /verifyPasswordAsync/.test(read('src/security.js')) && /loginAsync\(/.test(read('src/store.js')) && /store\.loginAsync/.test(read('src/server.js')));

for (const rel of ['src/security.js','src/store.js','src/server.js','scripts/seed-demo.js','bin/opscore.js','scripts/recovery-gate.js','scripts/release-hardening-gate.js']) {
  try { cp.execFileSync(process.execPath, ['--check', path.join(root, rel)], {stdio:'pipe'}); check(`syntax:${rel}`, true); }
  catch (e) { check(`syntax:${rel}`, false, (e.stderr || e.stdout || e.message || '').toString().trim()); }
}


// Strict telemetry & audit boundary — production must not log live SQL / secrets
(function telemetryBoundaryGate() {
  const srcDir = path.join(root, 'src');
  const deny = [
    { id: 'console-sql-dump', re: /console\.(log|debug|info)\s*\(\s*.*(?:SELECT\s+|INSERT\s+INTO|UPDATE\s+)/i },
    { id: 'log-password-field', re: /(?:warn|info|console\.\w+)\s*\([^;]*(?:password|passwd)\s*:/i },
    { id: 'raw-query-in-log', re: /(?:warn|info)\s*\(\s*['"][^'"]*query[^'"]*['"]\s*,\s*\{[^}]*sql\s*:/i }
  ];
  const hits = [];
  function walk(dir) {
    if (!fs.existsSync(dir)) return;
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        if (ent.name === 'node_modules' || ent.name === 'test') continue;
        walk(abs);
      } else if (/\.js$/.test(ent.name)) {
        const text = fs.readFileSync(abs, 'utf8');
        for (const p of deny) {
          if (p.re.test(text)) hits.push({ file: path.relative(root, abs), pattern: p.id });
        }
      }
    }
  }
  walk(srcDir);
  // observability must export production boundary helpers
  const obs = fs.readFileSync(path.join(srcDir, 'observability.js'), 'utf8');
  check('telemetry-production-boundary', /productionBoundary/.test(obs) && /isProduction/.test(obs), 'observability.js must enforce production telemetry boundary');
  check('telemetry-no-sql-console', hits.length === 0, hits.length ? hits.slice(0, 5).map(h => h.file + ':' + h.pattern).join('; ') : 'clean');
})();
// Exit status is decided last so checks appended by the telemetry gate above are counted too.
process.exitCode = failures ? 1 : 0;
