#!/usr/bin/env node
'use strict';

/**
 * OpsCore P2.3 — PRODUCTION_ACCEPTANCE_BEHAVIORAL.json generator.
 *
 * Regenerates the behavioral acceptance evidence FROM the executed test
 * (test/postgres-commercial-acceptance-http.test.js run with
 * OPSC_WRITE_EVIDENCE=1). The status and checks come from the test's own
 * result file; this wrapper only binds the tested commit identity
 * (git rev-parse HEAD, never hand-edited) and the SHA-256 fingerprint.
 * sourceCommit is never edited inside an old file.
 *
 * Honesty boundary: this run tests the isolated disposable acceptance engine.
 * Production-host behavioral re-certification remains REQUIRES_RETEST until a
 * production evidence run is authorized (production writes are forbidden in
 * this phase), and productionCertification stays false.
 *
 * The connection URL is never printed or persisted.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const ACCEPTANCE_RESULT_PATH = path.join(root, 'docs', 'verification', 'POSTGRES_HTTP_ACCEPTANCE_RESULT.json');
const REPORT_NAME = 'PRODUCTION_ACCEPTANCE_BEHAVIORAL.json';
const EVIDENCE_PATH = path.join(root, 'docs', 'verification', REPORT_NAME);
const RESULT_PATH = process.env.OPSC_WRITE_EVIDENCE === '1'
  ? EVIDENCE_PATH
  : path.join(os.tmpdir(), `opscore-behavioral-${process.pid}.json`);

function sourceCommit() {
  try { return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root }).toString().trim(); }
  catch { return null; }
}

function writeReport(report) {
  fs.mkdirSync(path.dirname(RESULT_PATH), { recursive: true });
  const body = JSON.stringify(report, null, 2) + '\n';
  fs.writeFileSync(RESULT_PATH, body);
  fs.writeFileSync(`${RESULT_PATH}.sha256`, `${crypto.createHash('sha256').update(body).digest('hex')}  ${REPORT_NAME}\n`);
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  process.stdout.write(`BEHAVIORAL_ACCEPTANCE_REPORT=${RESULT_PATH}\n`);
}

async function main() {
  const urlText = String(process.env.OPSC_PG_ACCEPTANCE_URL || '').trim();
  const report = {
    schemaVersion: 'opscore.production-acceptance-behavioral.v2',
    generatedAt: new Date().toISOString(),
    sourceCommit: sourceCommit(),
    testedTarget: urlText ? 'isolated disposable acceptance engine (dedicated acceptance database)' : null,
    productionHost: null,
    productionHostBehavioralStatus: 'REQUIRES_RETEST',
    productionCertification: false,
    checks: []
  };

  if (!urlText) {
    report.status = 'UNVERIFIED';
    report.reason = 'OPSC_PG_ACCEPTANCE_URL_REQUIRED';
    report.note = 'The acceptance test was not executed: no dedicated acceptance engine URL was supplied.';
    writeReport(report);
    process.exitCode = 2;
    return;
  }

  // Execute the acceptance test itself; its own result file is the only source
  // of status. This wrapper never fabricates or edits a status value.
  execFileSync(process.execPath, ['--test', '--test-force-exit', 'test/postgres-commercial-acceptance-http.test.js'], {
    cwd: root,
    stdio: ['ignore', 'inherit', 'inherit'],
    env: { ...process.env, OPSC_WRITE_EVIDENCE: '1' },
    timeout: 20 * 60 * 1000
  });

  const run = JSON.parse(fs.readFileSync(ACCEPTANCE_RESULT_PATH, 'utf8'));
  report.generatedAt = new Date().toISOString();
  report.checkedAt = run.generatedAt || null;
  report.status = run.status;
  report.acceptanceResultSchema = run.schemaVersion || null;
  report.checks = Array.isArray(run.checks) ? run.checks : [];
  report.note = 'Regenerated from the executed acceptance test at the tested commit; status and checks are produced by the test itself. Prior production-host behavioral evidence (commit 84caed58) remains in git history. Production-host behavioral re-certification stays REQUIRES_RETEST until an authorized production evidence run; productionCertification stays false.';
  writeReport(report);
  process.exitCode = report.status === 'PASS' ? 0 : 1;
}

main().catch(error => {
  const fs2 = require('node:fs');
  try {
    writeReport({
      schemaVersion: 'opscore.production-acceptance-behavioral.v2',
      generatedAt: new Date().toISOString(),
      sourceCommit: sourceCommit(),
      testedTarget: null,
      productionHost: null,
      productionHostBehavioralStatus: 'REQUIRES_RETEST',
      productionCertification: false,
      status: 'FAIL',
      reason: String(error && error.message || error).slice(0, 400),
      checks: [],
      note: 'The acceptance test did not complete successfully; the wrapper reports FAIL from the failing run (fail-closed).'
    });
  } catch { /* report write is best-effort on this path */ }
  process.stderr.write(`BEHAVIORAL_ACCEPTANCE_UNEXPECTED_FAILURE: ${String(error && error.message || error)}\n`);
  process.exit(1);
});
