const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), {execFileSync} = require('node:child_process');
const root = path.resolve(__dirname, '..');
const run = (args, options = {}) => execFileSync(process.execPath, args, {
  cwd: root,
  stdio: 'pipe',
  encoding: 'utf8',
  timeout: options.timeout || 90000,
  env: { ...process.env, ...(options.env || {}) }
});
const checks = [];
const add = (name, pass, detail = '') => checks.push({
  name,
  pass: !!pass,
  detail: String(detail || '').slice(0, 800)
});

const requiredTests = [
  'test/security_cross_tenant.test.js',
  'test/security_hardening.test.js',
  'test/buyer_value_pack.test.js',
  'test/req_pdf_signoff.test.js',
  'test/req_notify_dispatch_map.test.js',
  'test/demo_closeout_path.test.js'
];

for (const f of requiredTests)
  add(`test exists: ${f}`, fs.existsSync(path.join(root, f)));

// Isolate buyer acceptance tests exactly as the release runner does. Running several
// server/database tests in one Node test process caused shared handles and mutable state
// to make this preflight hang, even though the individual files passed in isolation.
for (const testFile of requiredTests) {
  const releaseRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'opscore-buyer-acceptance-'));
  try {
    const out = run(['--test', '--test-force-exit', testFile], {
      timeout: 90000,
      env: {
        OPSC_REPOSITORY_PATH: releaseRepo,
        OPSC_RELEASE_VERIFICATION_ROOT: releaseRepo,
        OPSC_TEST_SCRYPT_N: process.env.OPSC_TEST_SCRYPT_N || '32768',
        NODE_ENV: 'test'
      }
    });
    const tests = Number(/# tests\s+(\d+)/i.exec(out)?.[1] || 0);
    const pass = Number(/# pass\s+(\d+)/i.exec(out)?.[1] || 0);
    const fail = Number(/# fail\s+(\d+)/i.exec(out)?.[1] || 0);
    const cancelled = Number(/# cancelled\s+(\d+)/i.exec(out)?.[1] || 0);
    add(`buyer acceptance: ${testFile}`, tests > 0 && pass === tests && fail === 0 && cancelled === 0, out.slice(-1200));
  } catch (e) {
    add(`buyer acceptance: ${testFile}`, false, String(e.stdout || e.stderr || e).slice(-1200));
  } finally {
    try { fs.rmSync(releaseRepo, { recursive: true, force: true }); } catch {}
  }
}

for (const f of [
  'src/store.js',
  'src/server.js',
  'src/pdf.js',
  'src/adapters/notifications.js',
  'scripts/backup.js',
  'scripts/restore.js'
]) {
  try {
    run(['--check', f]);
    add(`syntax: ${f}`, true);
  } catch {
    add(`syntax: ${f}`, false);
  }
}

// static contract checks
const storeSrc = fs.readFileSync(path.join(root, 'src/store.js'), 'utf8');
add('dispatcherMap present', storeSrc.includes('dispatcherMap('));
add('runDemoCloseoutPath present', storeSrc.includes('runDemoCloseoutPath('));
add('outboxEventCatalog present', storeSrc.includes('outboxEventCatalog('));
const notifySrc = fs.readFileSync(path.join(root, 'src/adapters/notifications.js'), 'utf8');
add('notification fail-closed codes', notifySrc.includes('EMAIL_PROVIDER_NOT_CONFIGURED'));
const pdfSrc = fs.readFileSync(path.join(root, 'src/pdf.js'), 'utf8');
add('pdf content sha footer', pdfSrc.includes('Content SHA-256') || pdfSrc.includes('contentSha256'));

const report = {
  version: require(path.join(root, 'package.json')).version,
  generatedAt: new Date().toISOString(),
  checks,
  summary: {
    total: checks.length,
    passed: checks.filter(x => x.pass).length,
    failed: checks.filter(x => !x.pass).length
  }
};
console.log(JSON.stringify(report, null, 2));
if (checks.some(x => !x.pass)) process.exitCode = 1;
