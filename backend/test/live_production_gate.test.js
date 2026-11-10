const test = require('node:test');
const assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');
const path = require('node:path');
const script = path.join(__dirname, '..', 'scripts', 'live-production-gate.js');

test('live production gate self-test passes without external services', () => {
  const r = spawnSync(process.execPath, [script, '--self-test'], {encoding:'utf8'});
  assert.equal(r.status, 0, r.stderr || r.stdout);
});

test('live production gate stays unverified without real PostgreSQL/OIDC inputs', () => {
  const env = {...process.env};
  delete env.DATABASE_URL; delete env.OIDC_ISSUER; delete env.OIDC_AUDIENCE; delete env.OIDC_TOKEN;
  const r = spawnSync(process.execPath, [script], {encoding:'utf8', env});
  assert.equal(r.status, 0, r.stderr || r.stdout);
  const out = JSON.parse(r.stdout);
  assert.equal(out.status, 'UNVERIFIED');
  assert.equal(out.productionCertification, 'NOT_ESTABLISHED');
});
