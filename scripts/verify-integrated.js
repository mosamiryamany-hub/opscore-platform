const cp = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const backend = path.join(root, 'backend'), mobile = path.join(root, 'mobile');
function run(command, args, cwd, env = {}) {
  if (!Array.isArray(args) || args.some(x => typeof x !== 'string')) return false;
  try {
    cp.execFileSync(command, args, { cwd, stdio: 'pipe', env: { ...process.env, ...env } });
    return true;
  } catch (e) {
    return false;
  }
}
function sha(p) {
  return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
}
let fail = 0;
function check(label, ok) {
  console.log(`${ ok ? 'PASS' : 'FAIL' } ${ label }`);
  if (!ok)
    fail++;
}
check('backend package exists', fs.existsSync(path.join(backend, 'package.json')));
check('mobile package exists', fs.existsSync(path.join(mobile, 'package.json')));
check('web landing exists', fs.existsSync(path.join(backend, 'web', 'index.html')));
check('integrated operational loop docs', fs.existsSync(path.join(backend, 'docs', 'OPERATIONAL_LOOP.md')));
check('mobile buyer value docs', fs.existsSync(path.join(mobile, 'docs', 'BUYER_VALUE.md')));
check('release documentation gate', run(process.execPath, ['scripts/release-doc-gate.js'], root));
check('pre-infrastructure readiness gate', run(process.execPath, ['backend/scripts/pre-infrastructure-gate.js'], root));
check('SBOM verification', run(process.execPath, ['scripts/verify-sbom.js'], root));
check('secure release workflow present', fs.existsSync(path.join(root, '.github', 'workflows', 'opscore-secure-release.yml')));
check('security policy present', fs.existsSync(path.join(backend, 'SECURITY.md')));
function treeDigest(dir, predicate = () => true) {
  const hash = crypto.createHash('sha256');
  const walk = d => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true }).sort((a,b)=>a.name.localeCompare(b.name))) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && predicate(full)) { hash.update(path.relative(root, full)); hash.update('\0'); hash.update(fs.readFileSync(full)); }
    }
  };
  walk(dir);
  return hash.digest('hex');
}
const releaseTestEvidencePath = path.join(backend, 'docs', 'verification', 'RELEASE_TEST_RUN_RESULT.json');
const provenanceDigest = treeDigest(backend, f => {
  const rel = path.relative(backend, f).split(path.sep).join('/');
  return rel === 'package.json' || rel === 'package-lock.json' || rel === '.nvmrc' ||
    /^(src|scripts|test|sql|web)\//.test(rel);
});
let releaseTestEvidence = null;
try {
  cp.execFileSync(process.execPath, [path.join(backend, 'scripts', 'release-test-runner.js')], { cwd:backend, encoding:'utf8', env:{...process.env,OPSC_TEST_SCRYPT_N:'32768',OPSC_RELEASE_TEST_CONCURRENCY:process.env.OPSC_RELEASE_TEST_CONCURRENCY || '4'}, stdio:['ignore','pipe','pipe'] });
} catch {}
try { releaseTestEvidence = JSON.parse(fs.readFileSync(releaseTestEvidencePath, 'utf8')); } catch {}
check('fresh backend isolated test run', Boolean(releaseTestEvidence));
check('backend tests evidence bound to current tree', !!releaseTestEvidence && releaseTestEvidence.status === 'PASS' && releaseTestEvidence.failedTests === 0 && releaseTestEvidence.totalTests > 0);
check('mobile dependency audit', run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['audit','--omit=dev','--json'], mobile));

check('cleanup generated runtime attachments', run(process.execPath, ['scripts/clean-demo-data.js','--confirm'], backend, {
  OPSC_DEMO_CLEANUP: 'CONFIRM',
  NODE_ENV: 'test'
}));
check('release artifact gate after tests', run(process.execPath, ['scripts/release-artifact-gate.js'], root));
check('mobile contract', run(process.execPath, ['scripts/verify-mobile.js'], mobile));
check('postgres schema parity', run(process.execPath, ['scripts/postgres-parity-check.js'], backend));
for (const f of [
    'src/server.js',
    'src/store.js',
    'src/security.js',
    'web/app.js',
    'web/portal.js',
    'web/control-plane.js'
  ])
  check(`backend syntax ${ f }`, run(process.execPath, ['--check', f], backend));
const pkg = JSON.parse(fs.readFileSync(path.join(backend, 'package.json'), 'utf8')), mpkg = JSON.parse(fs.readFileSync(path.join(mobile, 'package.json'), 'utf8'));
const docPolicy = JSON.parse(fs.readFileSync(path.join(backend, 'docs', 'RELEASE_DOCUMENTATION_POLICY.json'), 'utf8'));
check(`backend release version ${ pkg.version } matches documentation policy`, pkg.version === docPolicy.currentRelease);
check(`mobile release version ${ mpkg.version }`, mpkg.version === '0.1.16');
check('mobile app version aligned', JSON.parse(fs.readFileSync(path.join(mobile, 'app.json'), 'utf8')).expo.version === mpkg.version);
check('portal live work-order endpoint wired', fs.readFileSync(path.join(backend, 'src', 'server.js'), 'utf8').includes('portalWorkOrder'));
check('organization export endpoint wired', fs.readFileSync(path.join(backend, 'src', 'server.js'), 'utf8').includes('/api/v1/export/organization.json'));
check('buyer acceptance harness exists', fs.existsSync(path.join(backend, 'scripts', 'buyer-acceptance.js')));
check('backup verification harness exists', fs.existsSync(path.join(backend, 'scripts', 'verify-backup.js')));
check('audit chain verification endpoint wired', fs.readFileSync(path.join(backend, 'src', 'server.js'), 'utf8').includes('/api/v1/audit/verify'));
check('audit provenance test exists', fs.existsSync(path.join(backend, 'test', 'audit_provenance.test.js')));
check('recovery drill harness exists', fs.existsSync(path.join(backend, 'scripts', 'recovery-drill.js')));
check('export verification harness exists', fs.existsSync(path.join(backend, 'scripts', 'verify-export.js')));
check('demo cleanup harness exists', fs.existsSync(path.join(backend, 'scripts', 'clean-demo-data.js')));
check('recovery portability regression test exists', fs.existsSync(path.join(backend, 'test', 'recovery_portability.test.js')));
const report = {
  version: pkg.version,
  mobileVersion: mpkg.version,
  backendTests: releaseTestEvidence ? `isolated release-test-runner: ${releaseTestEvidence.totalTests} tests / ${releaseTestEvidence.failedTests} failures` : 'UNVERIFIED',
  mobileContract: 'node scripts/verify-mobile.js',
  physicalDevices: 'UNVERIFIED',
  signedAndroid: 'UNVERIFIED',
  signedIOS: 'UNVERIFIED',
  postgres: 'SCHEMA_PARITY_VERIFIED_RUNTIME_UNVERIFIED',
  productionCertification: 'NOT_ESTABLISHED'
};
fs.writeFileSync(path.join(root, 'INTEGRATED_RELEASE_SCOPE.json'), JSON.stringify(report, null, 2) + '\n');
process.exitCode = fail ? 1 : 0;
