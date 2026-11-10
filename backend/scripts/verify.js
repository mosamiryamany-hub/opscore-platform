const cp = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
function run(command, args = [], cwd = root) {
  if (!Array.isArray(args) || args.some(x => typeof x !== 'string')) return 'FAIL';
  try {
    cp.execFileSync(command, args, { stdio: 'pipe', cwd });
    return 'PASS';
  } catch (e) {
    return 'FAIL';
  }
}
function fileVersion(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8')).info.version;
}
function sha256File(p) {
  return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
}
const root = path.join(__dirname, '..');
const pkg = require(path.join(root, 'package.json'));
const checks = [];
function add(label, ok) {
  checks.push([
    label,
    ok ? 'PASS' : 'FAIL'
  ]);
}
const manifestPath = path.join(root, 'SALES_PACKAGE_MANIFEST.json');
const fileSumsPath = path.join(root, 'RELEASE_FILE_SHA256SUMS.txt');
const componentSumsPath = path.join(root, 'RELEASE_COMPONENT_SHA256SUMS.txt');
const manifestExists = fs.existsSync(manifestPath);
const fileSumsExists = fs.existsSync(fileSumsPath);
const componentSumsExists = fs.existsSync(componentSumsPath);
add('provenance manifest present', manifestExists);
add('release file SHA-256 manifest present', fileSumsExists);
add('release component SHA-256 manifest present', componentSumsExists);
let manifest = null;
if (manifestExists) {
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    add('provenance manifest parseable', true);
  } catch {
    add('provenance manifest parseable', false);
  }
} else
  add('provenance manifest parseable', false);
add('package/openapi version', pkg.version === fileVersion(path.join(root, 'docs', 'openapi.json')));
if (manifest) {
  add('package/manifest version', manifest.version === pkg.version);
} else
  add('package/manifest version', false);
let releaseDocPolicy = null;
try {
  releaseDocPolicy = JSON.parse(fs.readFileSync(path.join(root, 'docs', 'RELEASE_DOCUMENTATION_POLICY.json'), 'utf8'));
  add('release documentation policy parseable', true);
} catch {
  add('release documentation policy parseable', false);
}
add('current-facing release document policy version', !!releaseDocPolicy && releaseDocPolicy.currentRelease === pkg.version);
if (releaseDocPolicy) {
  for (const doc of releaseDocPolicy.currentFacingDocuments) {
    let ok = false;
    try {
      const text = fs.readFileSync(path.join(root, doc.path), 'utf8');
      ok = text.startsWith(doc.requiredHeading);
    } catch {
    }
    add(`current-facing doc: ${ doc.path }`, ok);
  }
}
add('README current release marker', new RegExp('^# OpsCore \u2014 Operational SaaS Starter Kit v' + pkg.version.replaceAll('.', '\\.') + '\\s*$', 'm').test(fs.readFileSync(path.join(root, 'README.md'), 'utf8')));
add('UI current release marker', new RegExp('v' + pkg.version.replaceAll('.', '\\.')).test(fs.readFileSync(path.join(root, 'web', 'index.html'), 'utf8')));
const controlPlaneHtml = fs.readFileSync(path.join(root, 'web', 'control-plane.html'), 'utf8');
const controlPlaneJs = fs.readFileSync(path.join(root, 'web', 'control-plane.js'), 'utf8');
add('authenticated control-plane evidence DOM and safety controls',
  /id="controlPlane"/.test(controlPlaneHtml) &&
  /id="cpAnomalyList"/.test(controlPlaneHtml) &&
  /id="cpFlagsList"/.test(controlPlaneHtml) &&
  /id="cpHash"/.test(controlPlaneHtml) &&
  /id="toggleSafeMode"/.test(controlPlaneHtml) &&
  /id="downloadRecovery"/.test(controlPlaneHtml) &&
  /\/api\/v1\/control-plane\/safe-mode/.test(controlPlaneJs) &&
  /\/api\/v1\/control-plane\/recovery-bundle/.test(controlPlaneJs));
add('browser token not persisted in localStorage', !/localStorage\.setItem\('opscore_token'/.test(fs.readFileSync(path.join(root, 'web', 'app.js'), 'utf8')));
add('demo seed script exists', fs.existsSync(path.join(__dirname, 'seed-demo.js')));
add('reset demo script guarded', /RESET_DEMO_FORBIDDEN_IN_PRODUCTION/.test(fs.readFileSync(path.join(__dirname, 'reset-demo.js'), 'utf8')) && /RESET_DEMO_PATH_NOT_ALLOWED/.test(fs.readFileSync(path.join(__dirname, 'reset-demo.js'), 'utf8')));
add('cross-tenant regression test exists', fs.existsSync(path.join(root, 'test', 'security_cross_tenant.test.js')));
add('customer CSV fixtures exist', fs.existsSync(path.join(root, 'fixtures', 'demo-customers.csv')) && fs.existsSync(path.join(root, 'fixtures', 'demo-customers-invalid.csv')));
add('backup/restore scripts exist', fs.existsSync(path.join(__dirname, 'backup.js')) && fs.existsSync(path.join(__dirname, 'restore.js')));
add('recovery drill harness exists', fs.existsSync(path.join(__dirname, 'recovery-drill.js')));
add('export verification harness exists', fs.existsSync(path.join(__dirname, 'verify-export.js')));
add('postgres compose optional', fs.existsSync(path.join(root, 'docker-compose.postgres.yml')));
add('audit chain implementation', /eventHash|verifyAuditChain/.test(fs.readFileSync(path.join(root, 'src', 'audit.js'), 'utf8')));
add('webhook status event enqueue', /work_order\.status_changed/.test(fs.readFileSync(path.join(root, 'src', 'store.js'), 'utf8')));
add('portal script externalized', /src="\/portal\.js"/.test(fs.readFileSync(path.join(root, 'web', 'portal.html'), 'utf8')));
add('webhook SSRF guard present', /validateWebhookUrl|resolvePublicWebhookHost|httpsPostPinned/.test(fs.readFileSync(path.join(root, 'src', 'security.js'), 'utf8')));
add('OIDC verifier is implemented and configuration-gated', /async function verifyOidcIdToken[\s\S]*oidcIssuerConfig\(\)/.test(fs.readFileSync(path.join(root, 'src', 'security.js'), 'utf8')) && /if \(mode === 'oidc'\) oidcIssuerConfig\(\)/.test(fs.readFileSync(path.join(root, 'src', 'security.js'), 'utf8')));
add('security regression suite exists', fs.existsSync(path.join(root, 'test', 'security_hardening.test.js')));
add('work-order cross-tenant reference guard', /_validateWorkOrderReferences/.test(fs.readFileSync(path.join(root, 'src', 'store.js'), 'utf8')));
add('route-plan input cap', /ids\.length\s*>\s*100/.test(fs.readFileSync(path.join(root, 'src', 'store.js'), 'utf8')));
add('route-plan API read scope', /route-plan[\s\S]{0,400}requireScope\s*\(\s*c\s*,\s*'read'\s*\)/.test(fs.readFileSync(path.join(root, 'src', 'server.js'), 'utf8')));
add('deep security regression suite exists', fs.existsSync(path.join(root, 'test', 'security_deep_pass.test.js')));
add('portal HTTP exchange route wired', /url\.pathname\s*===\s*'\/api\/v1\/portal\/exchange'/.test(fs.readFileSync(path.join(root, 'src', 'server.js'), 'utf8')));
add('portal HTTP regression test exists', fs.existsSync(path.join(root, 'test', 'portal-http.test.js')));
add('portal exchange documented in OpenAPI', /"\/api\/v1\/portal\/exchange"/.test(fs.readFileSync(path.join(root, 'docs', 'openapi.json'), 'utf8')));
add('portal uses HttpOnly cookie exchange', /__opscore_portal/.test(fs.readFileSync(path.join(root, 'src', 'server.js'), 'utf8')) && /credentials:'include'/.test(fs.readFileSync(path.join(root, 'web', 'portal.js'), 'utf8')));
add('Stripe billing adapter implementation', fs.existsSync(path.join(root, 'src', 'stripe-billing.js')) && /Stripe-Signature|STRIPE_SIGNATURE_INVALID/.test(fs.readFileSync(path.join(root, 'src', 'stripe-billing.js'), 'utf8')));
add('Stripe webhook route wired', /\/api\/v1\/billing\/stripe\/webhook/.test(fs.readFileSync(path.join(root, 'src', 'server.js'), 'utf8')));
add('Stripe billing paths documented in OpenAPI', /\/api\/v1\/billing\/stripe/.test(fs.readFileSync(path.join(root, 'docs', 'openapi.json'), 'utf8')));
add('Stripe billing regression suite exists', fs.existsSync(path.join(root, 'test', 'stripe-billing.test.js')));
add('Stripe webhook secret boundary documented', /STRIPE_WEBHOOK_SECRET/.test(fs.readFileSync(path.join(root, '.env.example'), 'utf8')));
add('field today API wired', /\/api\/v1\/field\/today/.test(fs.readFileSync(path.join(root, 'src', 'server.js'), 'utf8')) && /fieldToday/.test(fs.readFileSync(path.join(root, 'src', 'store.js'), 'utf8')));
add('dispatch board API wired', /\/api\/v1\/dispatch-board/.test(fs.readFileSync(path.join(root, 'src', 'server.js'), 'utf8')) && /dispatchBoard/.test(fs.readFileSync(path.join(root, 'src', 'store.js'), 'utf8')));
add('work-order timeline API wired', /work-orders[^\n]*timeline/.test(fs.readFileSync(path.join(root, 'src', 'server.js'), 'utf8')) && /workOrderTimeline/.test(fs.readFileSync(path.join(root, 'src', 'store.js'), 'utf8')));
add('work-order server-side search wired', /url.searchParams.get\('q'\)/.test(fs.readFileSync(path.join(root, 'src', 'server.js'), 'utf8')) && /filters.q/.test(fs.readFileSync(path.join(root, 'src', 'store.js'), 'utf8')));
add('on-my-way API wired', /\/on-my-way/.test(fs.readFileSync(path.join(root, 'src', 'server.js'), 'utf8')) && /onMyWay/.test(fs.readFileSync(path.join(root, 'src', 'store.js'), 'utf8')));
add('completion package API wired', /completion-package/.test(fs.readFileSync(path.join(root, 'src', 'server.js'), 'utf8')) && /completionPackage/.test(fs.readFileSync(path.join(root, 'src', 'store.js'), 'utf8')));
add('operational doctor API wired', /operations\/doctor/.test(fs.readFileSync(path.join(root, 'src', 'server.js'), 'utf8')) && /operationalDoctor/.test(fs.readFileSync(path.join(root, 'src', 'store.js'), 'utf8')));
add('machine-readable compatibility gate wired', /MOBILE_VERSION_UNSUPPORTED/.test(fs.readFileSync(path.join(root, 'src', 'store.js'), 'utf8')) && /CLIENT_CONTRACT_MISMATCH/.test(fs.readFileSync(path.join(root, 'src', 'server.js'), 'utf8')));
add('structured rejection reasons wired', /reasons/.test(fs.readFileSync(path.join(root, 'src', 'server.js'), 'utf8')) && /WORKFLOW_TRANSITION_FORBIDDEN/.test(fs.readFileSync(path.join(root, 'src', 'store.js'), 'utf8')));
add('completion package carries integrity hash', /completionSha256/.test(fs.readFileSync(path.join(root, 'src', 'store.js'), 'utf8')));
add('portal live work-order API wired', /portalWo/.test(fs.readFileSync(path.join(root, 'src', 'server.js'), 'utf8')) && /portalWorkOrder/.test(fs.readFileSync(path.join(root, 'src', 'store.js'), 'utf8')));
add('safety checklist APIs wired', /safety-checklists/.test(fs.readFileSync(path.join(root, 'src', 'server.js'), 'utf8')) && /acknowledgeSafety/.test(fs.readFileSync(path.join(root, 'src', 'store.js'), 'utf8')));
add('operational loop regression suite exists', fs.existsSync(path.join(root, 'test', 'operational_loop.test.js')));
add('operational loop documentation exists', fs.existsSync(path.join(root, 'docs', 'OPERATIONAL_LOOP.md')));
const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
add('package-lock version aligned', lock.version === pkg.version && lock.packages?.['']?.version === pkg.version);
const appJs = fs.readFileSync(path.join(root, 'web', 'app.js'), 'utf8');
add('HttpOnly session restore bootstrap', /async function restoreSession\(\)/.test(appJs) && /api\('\/api\/v1\/me'\)/.test(appJs) && !/document\.cookie/.test(appJs));
add('session continuity HTTP regression test', /fresh page context|freshContext/.test(fs.readFileSync(path.join(root, 'test', 'frontend-http-smoke.test.js'), 'utf8')));
// Verify every manifest entry against the extracted package. The three integrity files are excluded to avoid self-hashing.
if (manifest) {
  const excluded = new Set(manifest.integrityExclusions || []);
  const excludedPath = p => [...excluded].some(x => x.endsWith('/**') ? p.startsWith(x.slice(0, -2)) : p === x);
  const entries = Array.isArray(manifest.files) ? manifest.files : [];
  const actual = [];
  function walk(dir, rel = '') {
    for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (e.name === '.git')
        continue;
      const full = path.join(dir, e.name), r = rel ? path.posix.join(rel, e.name) : e.name;
      if (e.isDirectory()) {
        if (r === 'data' || r === 'data/files' || r.startsWith('data/files/'))
          continue;
        walk(full, r);
      } else if (!excludedPath(r))
        actual.push(r);
    }
  }
  walk(root);
  const expected = entries.map(x => x.path).filter(p => !excludedPath(p)).sort();
  const actualComparable = actual.sort();
  add('provenance manifest file-set exact', JSON.stringify(expected) === JSON.stringify(actualComparable));
  let all = true;
  for (const e of entries) {
    if (excludedPath(e.path))
      continue;
    const f = path.join(root, e.path);
    if (!fs.existsSync(f) || !fs.statSync(f).isFile() || sha256File(f) !== e.sha256 || fs.statSync(f).size !== e.bytes) {
      all = false;
      break;
    }
  }
  add('provenance manifest digests and byte-counts', all);
} else {
  add('provenance manifest file-set exact', false);
  add('provenance manifest digests and byte-counts', false);
}
// Validate the line-oriented checksum files too.
function verifySumFile(sumPath) {
  if (!fs.existsSync(sumPath))
    return false;
  let ok = true;
  for (const line of fs.readFileSync(sumPath, 'utf8').split(/\r?\n/)) {
    if (!line.trim())
      continue;
    const m = line.match(/^([0-9a-f]{64})  (.+)$/);
    if (!m) {
      ok = false;
      break;
    }
    const f = path.join(root, m[2]);
    if (!fs.existsSync(f) || sha256File(f) !== m[1]) {
      ok = false;
      break;
    }
  }
  return ok;
}
add('release file SHA-256 digests valid', verifySumFile(fileSumsPath));
add('release component SHA-256 digests valid', verifySumFile(componentSumsPath));
function parseNode(v) {
  const m = String(v).match(/^(\d+)\.(\d+)\.(\d+)/);
  return m ? m.slice(1).map(Number) : null;
}
function gte(a, b) {
  return a && b ? a[0] > b[0] || a[0] === b[0] && (a[1] > b[1] || a[1] === b[1] && a[2] >= b[2]) : false;
}
const engineMatch = String(pkg.engines?.node || '').match(/>=([0-9]+)\.([0-9]+)\.([0-9]+)/);
const engineFloor = engineMatch ? engineMatch.slice(1).map(Number) : null;
const runtime = parseNode(process.versions.node);
function verifyRecordedTestEvidence() {
  const evidencePath = path.join(root, 'docs', 'verification', 'RELEASE_TEST_RUN_RESULT.json');
  if (!fs.existsSync(evidencePath)) return 'FAIL';
  try {
    const evidence = JSON.parse(fs.readFileSync(evidencePath, 'utf8'));
    const pass = evidence.release === pkg.version &&
      evidence.status === 'PASS' &&
      Number(evidence.failedTests) === 0 &&
      Number(evidence.passedTests) === Number(evidence.totalTests) &&
      Number(evidence.totalTests) > 0;
    return pass ? 'PASS' : 'FAIL';
  } catch {
    return 'FAIL';
  }
}
const recordedTestMode = String(process.env.OPSC_VERIFY_RECORDED_TEST_EVIDENCE || '').toLowerCase() === 'true';
const report = {
  version: pkg.version,
  tests: recordedTestMode ? verifyRecordedTestEvidence() : run(process.execPath, ['scripts/release-test-runner.js']),
  syntax: [
    'src/server.js',
    'src/store.js',
    'src/security.js',
    'web/app.js',
    'web/portal.js',
    'web/control-plane.js'
  ].map(f => [
    f,
    run(process.execPath, ['--check', f])
  ]),
  releaseContract: checks,
  runtimeEngine: {
    declared: pkg.engines?.node || null,
    nvmrc: fs.existsSync(path.join(root, '.nvmrc')) ? fs.readFileSync(path.join(root, '.nvmrc'), 'utf8').trim() : null,
    actual: process.versions.node,
    satisfiesDeclaredMinimum: gte(runtime, engineFloor)
  },
  localBackupRestore: 'IMPLEMENTED',
  database: 'UNVERIFIED',
  postgis: 'UNVERIFIED',
  oidc: 'UNVERIFIED',
  productionKms: 'UNVERIFIED',
  backupRestore: 'UNVERIFIED',
  externalWebhook: 'UNVERIFIED',
  productionCertification: 'NOT_ESTABLISHED'
};
console.log(JSON.stringify(report, null, 2));
const failed = checks.filter(([, s]) => s !== 'PASS').length;
if (report.tests !== 'PASS' || failed > 0)
  process.exitCode = 1;
