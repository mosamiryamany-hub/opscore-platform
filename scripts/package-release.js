const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const crypto = require('node:crypto');
const os = require('node:os');
const COMMIT_SHA_RE = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;
const { summarizeAuditStatus, describeAuditResidual } = require('./release-audit-status');
const root = path.resolve(__dirname, '..');
const backend = path.join(root, 'backend');
const version = JSON.parse(fs.readFileSync(path.join(backend, 'package.json'), 'utf8')).version;
const releaseDir = path.join(root, `OpsCore-FIELD-INTEGRATED-v${ version }`);
const requestedOutput = process.argv[2] ? String(process.argv[2]) : '';
if (requestedOutput && (path.basename(requestedOutput).startsWith('-') || requestedOutput === '-' || requestedOutput === '--')) {
  throw new Error('INVALID_RELEASE_OUTPUT_PATH');
}
const output = requestedOutput ? path.resolve(requestedOutput) : path.join(path.dirname(root), 'OPSCORE.zip');
if (output === root || output.startsWith(`${ root }${ path.sep }`))
  throw new Error('RELEASE_OUTPUT_MUST_BE_OUTSIDE_SOURCE_TREE');
function run(label, cmd, cwd = root, env = {}) {
  console.log(`RUN ${ label }`);
  cp.execFileSync(process.execPath, [
    '-e',
    cmd
  ], {
    cwd,
    stdio: 'inherit',
    env: {
      ...process.env,
      ...env
    }
  });
}

function redactCommercialEvidence(dir) {
  const verDir = path.join(dir, 'backend', 'docs', 'verification');
  if (!fs.existsSync(verDir)) return { redactedFiles: 0 };
  const hostRe = /ep-[a-z0-9-]+\.[a-z0-9.-]*neon\.tech/gi;
  const urlRe = /postgresql:\/\/[^\s"']+/gi;
  const roleRe = /\bopscope_acc\d+\b/g;
  let n = 0;
  for (const name of fs.readdirSync(verDir)) {
    if (!name.endsWith('.json')) continue;
    const fp = path.join(verDir, name);
    let text = fs.readFileSync(fp, 'utf8');
    const before = text;
    text = text.replace(hostRe, '[REDACTED_NEON_HOST]');
    text = text.replace(urlRe, 'postgresql://[REDACTED_ROLE]:***@[REDACTED_HOST]/[REDACTED_DB]');
    text = text.replace(roleRe, '[REDACTED_ACCEPTANCE_ROLE]');
    if (text !== before) {
      try {
        const obj = JSON.parse(text);
        obj.evidenceRedaction = {
          applied: true,
          at: new Date().toISOString(),
          note: 'Neon hosts, connection URLs, and disposable acceptance role names redacted at package time.'
        };
        text = JSON.stringify(obj, null, 2) + '\n';
      } catch (_) {}
      fs.writeFileSync(fp, text);
      n += 1;
    }
  }
  return { redactedFiles: n };
}

function sha(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}
function collect(dir, rel = '') {
  const out = [];
  for (const e of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
    const r = rel ? path.join(rel, e.name) : e.name;
    if (r === 'backend/src/opscore-vercel-release-identity.json') continue;
    if (e.isDirectory()) {
      if (r.split(path.sep).some(part => part === 'node_modules' || part === '.git') || ['backend/data/files', 'data/files', 'backend/data'].includes(r))
        continue;
      out.push(...collect(dir, r));
    } else
      out.push(r.split(path.sep).join('/'));
  }
  return out.sort();
}
// Tests are allowed to create runtime attachment files. Clean the actual backend path explicitly,
// then require a fail-closed gate before staging. The gate itself remains active in verify-integrated.
run('clean generated demo attachments', 'require(\'./backend/scripts/clean-demo-data.js\')', root, {
  OPSC_DEMO_CLEANUP: 'CONFIRM',
  NODE_ENV: 'test'
});
run('buyer installation preflight', 'require(\'./backend/scripts/buyer-preflight.js\')');
run('write current buyer installation verification', 'require(\'./backend/scripts/installation-verification.js\')');
run('generate current CycloneDX SBOM', 'require(\'./scripts/generate-sbom.js\')');
run('verify current CycloneDX SBOM', 'require(\'./scripts/verify-sbom.js\')');
run('release artifact gate', 'require(\'./scripts/release-artifact-gate.js\')');
fs.rmSync(releaseDir, {
  recursive: true,
  force: true
});
fs.mkdirSync(releaseDir, { recursive: true });
const files = collect(root);
const supersededVerificationSnapshots = new Set([
  'backend/docs/verification/COMMERCIAL_CLOSURE_DECISION.json',
  'backend/docs/verification/INSTALLED_PACKAGE_ACCEPTANCE_RESULT.json',
  'backend/docs/verification/MOBILE_DEPENDENCY_AUDIT_RESULT.json',
  'backend/docs/verification/PRODUCTION_ACCEPTANCE_633c9269.json',
  'backend/docs/verification/PRODUCTION_ACCEPTANCE_BEHAVIORAL.json',
  'backend/docs/verification/PRODUCTION_ISOLATION_EXTENDED.json',
  'RELEASE_BLOCKERS_2026-10-25.md',
  'docs/commercial/REMAINING_GATES_AND_OWNERSHIP_2026-10-25.md'
]);
for (const rel of files) {
  if (rel.startsWith('OpsCore-FIELD-INTEGRATED-v') || rel.startsWith('docs/archive/') || supersededVerificationSnapshots.has(rel))
    continue;
  const src = path.join(root, rel), dst = path.join(releaseDir, rel);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
}
// Generate per-build release evidence inside the staged package. The archive's
// own SHA-256 is external evidence and is generated after the ZIP is complete.
const statementPath = path.join(releaseDir, 'docs', 'release', 'COMMERCIAL_RELEASE_STATEMENT.json');
if (!fs.existsSync(statementPath)) throw new Error('COMMERCIAL_RELEASE_STATEMENT_TEMPLATE_MISSING');
let sourceCommit = String(process.env.CI_COMMIT_SHA || '').trim().toLowerCase();
if (!COMMIT_SHA_RE.test(sourceCommit)) {
  try {
    sourceCommit = cp.execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim().toLowerCase();
  } catch {
    sourceCommit = null;
  }
}
if (!COMMIT_SHA_RE.test(sourceCommit || '')) sourceCommit = null;
const pipelineIdText = String(process.env.CI_PIPELINE_ID || '').trim();
const isCommercialCi = process.env.CI_JOB_NAME === 'commercial-closure' && COMMIT_SHA_RE.test(sourceCommit || '') && /^[1-9][0-9]*$/.test(pipelineIdText);
const pipelineId = isCommercialCi ? Number(pipelineIdText) : null;
const projectUrl = String(process.env.CI_PROJECT_URL || '').trim();
const pipelineUrl = isCommercialCi
  ? (String(process.env.CI_PIPELINE_URL || '').trim() ||
     (projectUrl ? projectUrl + '/-/pipelines/' + pipelineId : null))
  : null;
const mobileAuditPath = path.join(root, 'mobile', 'mobile-dependency-audit.json');
if (!fs.existsSync(mobileAuditPath)) throw new Error('CURRENT_MOBILE_DEPENDENCY_AUDIT_ARTIFACT_MISSING');
const mobileAudit = JSON.parse(fs.readFileSync(mobileAuditPath, 'utf8'));
const mobileVulnerabilities = mobileAudit?.metadata?.vulnerabilities;
if (!mobileVulnerabilities || typeof mobileVulnerabilities.total !== 'number')
  throw new Error('CURRENT_MOBILE_DEPENDENCY_AUDIT_ARTIFACT_INCOMPLETE');
const mobileAuditSummary = {
  total: mobileVulnerabilities.total || 0,
  info: mobileVulnerabilities.info || 0,
  low: mobileVulnerabilities.low || 0,
  moderate: mobileVulnerabilities.moderate || 0,
  high: mobileVulnerabilities.high || 0,
  critical: mobileVulnerabilities.critical || 0
};
if (mobileAuditSummary.high > 0 || mobileAuditSummary.critical > 0)
  throw new Error('MOBILE_HIGH_OR_CRITICAL_ADVISORIES_BLOCK_RELEASE');
const mobileAdvisories = Object.entries(mobileAudit.vulnerabilities || {}).map(([name, item]) => ({
  name, severity: item.severity, range: item.range, fixAvailable: item.fixAvailable
}));
const rootAuditPath = path.join(root, 'root-dependency-audit.json');
if (!fs.existsSync(rootAuditPath)) throw new Error('CURRENT_ROOT_DEPENDENCY_AUDIT_ARTIFACT_MISSING');
const rootAudit = JSON.parse(fs.readFileSync(rootAuditPath, 'utf8'));
const rootVulnerabilities = rootAudit?.metadata?.vulnerabilities;
if (!rootVulnerabilities || typeof rootVulnerabilities.total !== 'number')
  throw new Error('CURRENT_ROOT_DEPENDENCY_AUDIT_ARTIFACT_INCOMPLETE');
const rootAuditSummary = {
  total: rootVulnerabilities.total || 0,
  info: rootVulnerabilities.info || 0,
  low: rootVulnerabilities.low || 0,
  moderate: rootVulnerabilities.moderate || 0,
  high: rootVulnerabilities.high || 0,
  critical: rootVulnerabilities.critical || 0
};
if (rootAuditSummary.high > 0 || rootAuditSummary.critical > 0)
  throw new Error('ROOT_RUNTIME_HIGH_OR_CRITICAL_ADVISORIES_BLOCK_RELEASE');
const rootAdvisories = Object.entries(rootAudit.vulnerabilities || {}).map(([name, item]) => ({
  name, severity: item.severity, range: item.range, fixAvailable: item.fixAvailable
}));
const releaseStatement = {
  schemaVersion: 'opscore.commercial-release-statement.v2',
  version,
  releaseTag: String(process.env.CI_COMMIT_TAG || '').trim() || null,
  sourceCommit,
  pipelineId,
  pipelineUrl,
  commercialClosure: isCommercialCi ? 'PASS_WITH_BUYER_RESIDUALS' : 'NOT_ATTESTED',
  productionCertification: false,
  mobileDependencyAudit: { status: summarizeAuditStatus(mobileAuditSummary), sourceArtifact: 'mobile/mobile-dependency-audit.json', summary: mobileAuditSummary, findings: mobileAdvisories },
  rootRuntimeDependencyAudit: { status: summarizeAuditStatus(rootAuditSummary), sourceArtifact: 'root-dependency-audit.json', summary: rootAuditSummary, findings: rootAdvisories },
  productionAcceptance: { status: 'NOT_VERIFIED_AT_BUILD', commit: null, checkedAt: null, evidenceSha256: null, scope: 'Production acceptance must be evaluated after deployment against the exact deployed commit; this in-archive record is build-time evidence only.' },
  packageSha256: null,
  packageSha256Authority: 'dist/COMMERCIAL_RELEASE_STATEMENT.json, generated after ZIP creation; the ZIP cannot contain its own final digest without a self-referential hash.',
  officialRepo: String(process.env.CI_PROJECT_PATH || process.env.GITHUB_REPOSITORY || 'mosamiryamany-hub/opscore-platform'),
  generatedAt: new Date().toISOString(),
  residuals: [
    'Production session, tenant-boundary and recovery acceptance is evaluated after deployment against this exact source commit; NOT_VERIFIED_AT_BUILD is not a claim about the later live endpoint.',
    'Production isolation is not certified merely by isolated-schema RLS tests.',
    describeAuditResidual('Mobile', mobileAuditSummary),
    describeAuditResidual('Root PostgreSQL runtime', rootAuditSummary),
    'Signed Android/iOS store artifacts, buyer-specific EAS accounts, physical-device acceptance and app-store publication remain buyer-owned.',
    'External provider accounts, licenses, credentials and live acceptance for identity, messaging/carrier/call-center services, payments, webhooks, storage, KMS/HSM, maps/road-routing and cloud remain buyer-owned.',
    'Production session/tenant/recovery acceptance and production-wide isolation certification are not established by this build.'
  ]
};
fs.writeFileSync(statementPath, JSON.stringify(releaseStatement, null, 2) + '\n');

const statusSnapshot = [
  '# OpsCore Commercial Release Verification Snapshot',
  '',
  '> Build-generated evidence index. This is not a security certification, warranty, or guarantee of defect-free operation.',
  '',
  '**Package version:** ' + version,
  '**CI closure:** ' + releaseStatement.commercialClosure,
  '**Mobile dependency audit:** ' + summarizeAuditStatus(mobileAuditSummary) + ' — ' + JSON.stringify(mobileAuditSummary),
  '**Root PostgreSQL runtime dependency audit:** ' + summarizeAuditStatus(rootAuditSummary) + ' — ' + JSON.stringify(rootAuditSummary),
  '**Source commit:** ' + (sourceCommit || 'UNVERIFIED'),
  '**CI pipeline:** ' + (pipelineUrl || 'UNVERIFIED'),
  '',
  '## Evidence links',
  '',
  '- CI repository: https://github.com/mosamiryamany-hub/opscore-platform',
  '- Exact CI pipeline: ' + (pipelineUrl || 'UNVERIFIED'),
  '- Vercel production health: https://opscore-platform.vercel.app/api/health',
  '- Vercel deployment identity: https://opscore-platform.vercel.app/api/verify/deployment',
  '- Vercel release proof: https://opscore-platform.vercel.app/api/verify/release',
  '- Vercel database security catalog: https://opscore-platform.vercel.app/api/verify/database-security',
  '',
  'The Vercel endpoint URLs above are locations to check after deployment; this build job does not assert that those live responses passed.',
  '',
  '## Security and buyer boundaries',
  '',
  '- Production-wide tenant-isolation certification: NOT CERTIFIED.',
  '- Production post-deploy behavioral acceptance: NOT VERIFIED BY THIS BUILD.',
  '- PostgreSQL RLS results produced by this pipeline are test-scope evidence, not proof of every live application route.',
  '- Signed Android/iOS store artifacts, buyer-specific EAS/signing, physical-device acceptance and app-store publication remain buyer-owned.',
  '- External identity, messaging/carrier/call-center providers, payment, webhook, storage, KMS/HSM, maps/road-routing and cloud accounts/licenses/credentials/live tests remain buyer-owned.',
  '- Current mobile npm audit summary: ' + JSON.stringify(mobileAuditSummary) + '; see mobile/mobile-dependency-audit.json for the complete report.',
  '- Root PostgreSQL runtime dependency audit summary: ' + JSON.stringify(rootAuditSummary) + '; see root-dependency-audit.json for the complete report.',
  '- The final ZIP SHA-256 and byte length are recorded in external dist/COMMERCIAL_RELEASE_STATEMENT.json; a ZIP cannot reliably contain its own final digest.',
  '- This snapshot proves only the stated facts. A successful CI status does not guarantee zero defects or instant setup in every buyer environment.'
].join('\n') + '\n';
fs.writeFileSync(path.join(releaseDir, 'COMMERCIAL_RELEASE_STATUS.md'), statusSnapshot);

// Runtime stores are excluded even if they are recreated during later commands.
const forbidden = [
  'backend/data/files',
  'data/files'
];
// Runtime storage roots are never release content; remove empty backend/data created by tests.
for (const emptyRuntimeRoot of [path.join(releaseDir, 'backend', 'data')]) {
  if (fs.existsSync(emptyRuntimeRoot) && fs.readdirSync(emptyRuntimeRoot).length === 0)
    fs.rmdirSync(emptyRuntimeRoot);
}
for (const rel of forbidden) {
  if (fs.existsSync(path.join(releaseDir, rel)))
    throw new Error(`FORBIDDEN_RELEASE_PATH_PRESENT:${ rel }`);
}
run('regenerate backend provenance', 'require(\'./scripts/generate-provenance.js\')', path.join(releaseDir, 'backend'));
run('verify staged backend provenance', 'require(\'./scripts/verify.js\')', path.join(releaseDir, 'backend'), { OPSC_VERIFY_RECORDED_TEST_EVIDENCE: 'true' });
// Verification exercises real SQLite/attachment paths. Remove those generated runtime
// artifacts before the staged release gate, so the gate validates the exact tree that
// is about to be shipped rather than the test side effects.
const stagedBackendData = path.join(releaseDir, 'backend', 'data');
if (fs.existsSync(stagedBackendData))
  fs.rmSync(stagedBackendData, {
    recursive: true,
    force: true
  });
if (fs.existsSync(path.join(releaseDir, 'data', 'files')))
  fs.rmSync(path.join(releaseDir, 'data', 'files'), {
    recursive: true,
    force: true
  });
run('release artifact gate after staged runtime cleanup', 'require(\'./scripts/release-artifact-gate.js\')', releaseDir);
// Rebuild the buyer evidence checksum list from the exact staged tree. The evidence list
// excludes itself plus the two top-level integrity metadata files to avoid cyclic hashes;
// the integrated manifest and sums are generated immediately afterward and cover every
// other release file, including this evidence checksum list.
const evidenceRedaction = redactCommercialEvidence(releaseDir);
console.log('COMMERCIAL_EVIDENCE_REDACTION=' + JSON.stringify(evidenceRedaction));
const evidenceSumPath = path.join(releaseDir, 'evidence-pack', 'SHA256SUMS.txt');
if (!fs.existsSync(evidenceSumPath)) throw new Error('EVIDENCE_CHECKSUM_MANIFEST_MISSING');
const evidenceExcluded = new Set([
  'evidence-pack/SHA256SUMS.txt',
  'INTEGRATED_PACKAGE_MANIFEST.json',
  'INTEGRATED_SHA256SUMS.txt'
]);
const evidenceEntries = collect(releaseDir).filter(rel => !evidenceExcluded.has(rel));
fs.writeFileSync(evidenceSumPath, evidenceEntries.map(rel => `${sha(path.join(releaseDir, rel))}  ${rel}`).join('\n') + '\n');
const packagedFiles = collect(releaseDir);
const manifestPath = path.join(releaseDir, 'INTEGRATED_PACKAGE_MANIFEST.json');
const sumPath = path.join(releaseDir, 'INTEGRATED_SHA256SUMS.txt');
const entries = packagedFiles.filter(r => r !== 'INTEGRATED_PACKAGE_MANIFEST.json' && r !== 'INTEGRATED_SHA256SUMS.txt').map(rel => ({
  path: rel,
  sha256: sha(path.join(releaseDir, rel)),
  bytes: fs.statSync(path.join(releaseDir, rel)).size
}));
const manifest = {
  product: 'OpsCore Integrated Field Operations Package',
  version,
  mobileVersion: JSON.parse(fs.readFileSync(path.join(root, 'mobile', 'package.json'), 'utf8')).version,
  generatedAt: new Date().toISOString(),
  integrityExclusions: [
    'INTEGRATED_PACKAGE_MANIFEST.json',
    'INTEGRATED_SHA256SUMS.txt'
  ],
  files: entries
};
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
fs.writeFileSync(sumPath, entries.map(e => `${ e.sha256 }  ${ e.path }`).join('\n') + '\n');
// Validate each manifest against on-disk content before producing the archive.
for (const entry of entries) {
  if (sha(path.join(releaseDir, entry.path)) !== entry.sha256) throw new Error(`INTEGRATED_MANIFEST_HASH_MISMATCH:${entry.path}`);
}
for (const line of fs.readFileSync(evidenceSumPath, 'utf8').split(/\r?\n/).filter(Boolean)) {
  const match = /^([a-f0-9]{64})  (.+)$/.exec(line);
  if (!match) throw new Error('EVIDENCE_CHECKSUM_LINE_INVALID');
  const target = match[2];
  if (!fs.existsSync(path.join(releaseDir, target)) || sha(path.join(releaseDir, target)) !== match[1]) {
    throw new Error(`EVIDENCE_CHECKSUM_MISMATCH:${target}`);
  }
}
run('release artifact gate in staged package', 'require(\'./scripts/release-artifact-gate.js\')', releaseDir);
// Runtime state was removed before the staged gate; keep a final fail-closed assertion.
const stagedBackendDataFinal = path.join(releaseDir, 'backend', 'data');
if (fs.existsSync(stagedBackendDataFinal))
  throw new Error('RUNTIME_DATA_PRESENT_BEFORE_PACKAGE');
const scopeCandidates = [path.join(releaseDir, 'RELEASE_SCOPE.md'), path.join(releaseDir, 'docs', 'release', 'RELEASE_SCOPE.md')];
const releaseScopePath = scopeCandidates.find(p => fs.existsSync(p));
if (!releaseScopePath || !new RegExp(version.replaceAll('.', '\\.')).test(fs.readFileSync(releaseScopePath, 'utf8')))
  throw new Error('RELEASE_VERSION_MARKER_MISSING');
fs.rmSync(output, { force: true });
cp.execFileSync('zip', [
  '-qr',
  '-X',
  output,
  path.basename(releaseDir)
], {
  cwd: path.dirname(releaseDir),
  stdio: 'inherit'
});

// Verify the exact completed archive, not only its staging directory.
const verifyRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opscore-release-roundtrip-'));
try {
  cp.execFileSync('unzip', ['-tq', output], { stdio: 'inherit' });
  cp.execFileSync('unzip', ['-q', output, '-d', verifyRoot], { stdio: 'inherit' });
  const roots = fs.readdirSync(verifyRoot);
  if (roots.length !== 1 || roots[0] !== path.basename(releaseDir)) throw new Error('ARCHIVE_ROOT_LAYOUT_MISMATCH');
  const extractedRoot = path.join(verifyRoot, roots[0]);
  const extractedManifest = JSON.parse(fs.readFileSync(path.join(extractedRoot, 'INTEGRATED_PACKAGE_MANIFEST.json'), 'utf8'));
  const extractedSums = path.join(extractedRoot, 'INTEGRATED_SHA256SUMS.txt');
  const expected = extractedManifest.files.map(entry => entry.path).concat(['INTEGRATED_PACKAGE_MANIFEST.json', 'INTEGRATED_SHA256SUMS.txt']).sort();
  const actual = collect(extractedRoot);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error('ARCHIVE_FILE_SET_MISMATCH');
  for (const entry of extractedManifest.files) {
    const target = path.join(extractedRoot, entry.path);
    if (!fs.existsSync(target) || !fs.statSync(target).isFile()) throw new Error('ARCHIVE_MANIFEST_FILE_MISSING:' + entry.path);
    if (fs.statSync(target).size !== entry.bytes || sha(target) !== entry.sha256) throw new Error('ARCHIVE_MANIFEST_INTEGRITY_MISMATCH:' + entry.path);
  }
  const sumLines = fs.readFileSync(extractedSums, 'utf8').split(/\r?\n/).filter(Boolean);
  if (sumLines.length !== extractedManifest.files.length) throw new Error('ARCHIVE_SUM_MANIFEST_ENTRY_COUNT_MISMATCH');
  for (const line of sumLines) {
    const match = /^([a-f0-9]{64})  (.+)$/.exec(line);
    if (!match) throw new Error('ARCHIVE_SUM_MANIFEST_LINE_INVALID');
    const target = path.join(extractedRoot, match[2]);
    if (!fs.existsSync(target) || sha(target) !== match[1]) throw new Error('ARCHIVE_SUM_MANIFEST_HASH_MISMATCH:' + match[2]);
  }
  console.log('ZIP ROUND-TRIP INTEGRITY PASS');

  // Prove the customer archive installs from a fresh extraction, not from the
  // developer/CI source tree. Runtime DB URLs are deliberately blanked so this
  // test can never connect to seller or buyer infrastructure.
  const extractedBackend = path.join(extractedRoot, 'backend');
  const extractedMobile = path.join(extractedRoot, 'mobile');
  const isolatedBuyerEnv = {
    ...process.env,
    NODE_ENV: 'test',
    OPSC_DATABASE_URL: '',
    DATABASE_URL: '',
    OPSC_MIGRATION_DATABASE_URL: '',
    OPSC_PG_TEST_URL: '',
    OPSC_PG_ACCEPTANCE_URL: '',
    OPSC_MIGRATION_CONFIRM_DATABASE: ''
  };

  console.log('RUN clean install from extracted OPSCORE.zip: backend npm ci');
  cp.execFileSync('npm', ['ci', '--no-audit', '--no-fund'], {
    cwd: extractedBackend,
    stdio: 'inherit',
    env: isolatedBuyerEnv
  });
  cp.execFileSync(process.execPath, ['-e', `
    const pkg = require('./package.json');
    const { Pool } = require('pg');
    if (pkg.dependencies?.pg !== '8.23.1' || typeof Pool !== 'function') {
      throw new Error('EXTRACTED_BACKEND_RUNTIME_DEPENDENCY_MISMATCH');
    }
    console.log('EXTRACTED_BACKEND_PG_RUNTIME=PASS');
  `], { cwd: extractedBackend, stdio: 'inherit', env: isolatedBuyerEnv });
  cp.execFileSync('npm', ['run', 'buyer:preflight'], {
    cwd: extractedBackend,
    stdio: 'inherit',
    env: isolatedBuyerEnv
  });
  console.log('EXTRACTED_BUYER_BACKEND_INSTALL=PASS');

  console.log('RUN clean install from extracted OPSCORE.zip: mobile npm ci');
  cp.execFileSync('npm', ['ci', '--no-audit', '--no-fund'], {
    cwd: extractedMobile,
    stdio: 'inherit',
    env: isolatedBuyerEnv
  });
  cp.execFileSync(process.execPath, ['scripts/release-preflight.js'], {
    cwd: extractedMobile,
    stdio: 'inherit',
    env: isolatedBuyerEnv
  });
  cp.execFileSync('npm', ['run', 'verify'], {
    cwd: extractedMobile,
    stdio: 'inherit',
    env: isolatedBuyerEnv
  });
  console.log('EXTRACTED_BUYER_MOBILE_INSTALL=PASS');

  const extractedSourceFiles = collect(extractedRoot);
  if (JSON.stringify(extractedSourceFiles) !== JSON.stringify(expected)) {
    throw new Error('EXTRACTED_INSTALL_CHANGED_PACKAGED_SOURCE_TREE');
  }
} finally {
  fs.rmSync(verifyRoot, { recursive: true, force: true });
}
console.log(`PACKAGED ${ output }`);
console.log(`SHA256 ${ sha(output) }`);
