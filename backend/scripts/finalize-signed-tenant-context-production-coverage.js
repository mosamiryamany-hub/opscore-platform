'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {
  buildCandidateSignedTenantRouteCoverage
} = require('./signed-tenant-context-postgres-gate');
const {
  readProductionSignedTenantRouteCoverageEvidence
} = require('../src/release-proof');

const MANIFEST_PATH = path.join(__dirname, '..', 'docs', 'verification', 'SIGNED_TENANT_CONTEXT_ROUTE_MANIFEST.json');
const INVENTORY_PATH = path.join(__dirname, '..', 'docs', 'API_INVENTORY.json');

function fail(code) {
  throw new Error(code);
}

function exactSha(value) {
  return /^[a-f0-9]{40}$/i.test(String(value || ''));
}

function exactPipeline(value) {
  return /^[1-9][0-9]{0,14}$/.test(String(value || ''));
}

function parseJsonDocument(raw) {
  const text = String(raw || '').replace(/^\uFEFF/, '');
  try {
    return JSON.parse(text);
  } catch (firstError) {
    // Gate/result files must be a single JSON document. If tooling appended
    // diagnostics after the closing brace, accept the outermost object only.
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start < 0 || end <= start) throw firstError;
    return JSON.parse(text.slice(start, end + 1));
  }
}

function parseJsonFile(filePath, label) {
  try {
    const bytes = fs.readFileSync(filePath);
    return { value: parseJsonDocument(bytes.toString('utf8')), bytes };
  } catch {
    fail(label + '_MISSING_OR_INVALID');
  }
}

function assertCandidateRuntime(candidate, expected) {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)
      || candidate.schemaVersion !== 'opscore.signed-tenant-context-ci-proof.v1'
      || candidate.status !== 'PASS') {
    fail('CANDIDATE_RESULT_NOT_PASS');
  }
  const cleanup = candidate.cleanup || {};
  if (cleanup.status !== 'PASS' || !cleanup.residue || typeof cleanup.residue !== 'object'
      || Array.isArray(cleanup.residue)
      || Object.values(cleanup.residue).some(value => !Number.isFinite(Number(value)) || Number(value) !== 0)) {
    fail('CANDIDATE_FIXTURE_CLEANUP_NOT_ZERO');
  }

  const runtime = candidate.candidateRuntimeIdentity || {};
  if (!/^dpl_[A-Za-z0-9]+$/.test(String(runtime.deploymentId || ''))
      || runtime.deploymentId !== expected.deploymentId
      || !exactSha(runtime.sourceCommit)
      || String(runtime.sourceCommit).toLowerCase() !== expected.commit
      || String(runtime.pipelineId) !== expected.pipelineId
      || runtime.sourceRef !== 'main'
      || runtime.environment !== 'production'
      || runtime.databaseName !== expected.databaseName
      || runtime.currentUser !== 'opscore_runtime'
      || runtime.sessionUser !== 'opscore_runtime'
      || runtime.readOnlyInspection !== true
      || Number(runtime.writeOperations) !== 0
      || runtime.holdActive !== true
      || runtime.releaseVerified !== false
      || runtime.releaseProofVerified !== false
      || !runtime.runtimeRole
      || runtime.runtimeRole.role_name !== 'opscore_runtime'
      || runtime.runtimeRole.role_exists !== true
      || runtime.runtimeRole.can_login !== true
      || runtime.runtimeRole.superuser !== false
      || runtime.runtimeRole.bypass_rls !== false
      || runtime.runtimeRole.create_role !== false
      || runtime.runtimeRole.create_db !== false
      || runtime.runtimeRole.elevated_role_membership !== false) {
    fail('CANDIDATE_RUNTIME_IDENTITY_NOT_EXACT');
  }

  const checks = candidate.checks || {};
  if (checks.tenantAHttpSession !== 'PASS'
      || checks.tenantBHttpSession !== 'PASS'
      || checks.rawGucTampering !== 'PASS_CANDIDATE_HTTP_ROUTE_PROBES'
      || checks.workOrdersRawGucTamperingIgnored !== 'PASS_CANDIDATE_HTTP_ROUTE_PROBES') {
    fail('CANDIDATE_REQUIRED_SESSION_OR_TAMPER_PROOF_MISSING');
  }
  return runtime;
}

function candidateProofFromChecks(checks) {
  return {
    session: checks.signedAuthenticatedSessionRoutes || {},
    read: checks.signedWorkOrderSubresourceReads || {},
    write: checks.signedWorkOrderWrites || {},
    evidence: checks.signedEvidenceWrites || {},
    checks
  };
}

function assertNoExternalDeliveryRoutes(manifest) {
  const routes = Array.isArray(manifest && manifest.routes) ? manifest.routes : [];
  const forbidden = new Set([
    'POST /api/v1/webhook-deliveries/deliver'
  ]);
  for (const route of routes) {
    const key = String(route.method || '').toUpperCase() + ' ' + String(route.path || route.route || '');
    if (forbidden.has(key) || (/^POST \/api\/v1\/notifications\/.*\/deliver$/.test(key))) {
      fail('EXTERNAL_DELIVERY_ROUTE_MUST_NOT_BE_PROBED:' + key);
    }
  }
}

function stableJson(value) {
  return JSON.stringify(value);
}

function buildFinalProductionCoverage({
  candidate,
  manifest,
  inventory,
  manifestBytes,
  inventoryBytes,
  expectedCommit,
  expectedPipelineId,
  expectedParentBranchId,
  expectedDeploymentId,
  expectedDatabaseName = 'opscore_acceptance'
}) {
  const expected = {
    commit: String(expectedCommit || '').trim().toLowerCase(),
    pipelineId: String(expectedPipelineId || '').trim(),
    parentBranchId: String(expectedParentBranchId || '').trim(),
    deploymentId: String(expectedDeploymentId || '').trim(),
    databaseName: String(expectedDatabaseName || '').trim()
  };
  if (!exactSha(expected.commit) || !exactPipeline(expected.pipelineId)
      || !/^[a-z0-9-]{8,80}$/.test(expected.parentBranchId)
      || !/^dpl_[A-Za-z0-9]+$/.test(expected.deploymentId)
      || !expected.databaseName) {
    fail('EXPECTED_RELEASE_IDENTITY_INVALID');
  }

  const runtime = assertCandidateRuntime(candidate, expected);
  if (runtime.deploymentId !== expected.deploymentId) fail('CANDIDATE_DEPLOYMENT_ID_MISMATCH');

  assertNoExternalDeliveryRoutes(manifest);

  const originalMatrix = candidate.signedTenantRouteCoverage;
  if (!originalMatrix || typeof originalMatrix !== 'object' || Array.isArray(originalMatrix)
      || originalMatrix.status !== 'PASS'
      || originalMatrix.schemaVersion !== 'opscore.signed-tenant-context-production-coverage.v1'
      || originalMatrix.evidenceClass !== 'LIVE_PRODUCTION_CANDIDATE_ROUTE_PROBES'
      || originalMatrix.environment !== 'production'
      || originalMatrix.databaseName !== expected.databaseName
      || Number(originalMatrix.expectedRouteCount) !== 67
      || Number(originalMatrix.coveredRouteCount) !== 67
      || Number(originalMatrix.failedRouteCount) !== 0
      || originalMatrix.sourceCommitHint !== expected.commit
      || String(originalMatrix.pipelineId) !== expected.pipelineId
      || originalMatrix.parentBranchId !== expected.parentBranchId
      || originalMatrix.deploymentId !== expected.deploymentId
      || originalMatrix.evidenceRebind != null) {
    fail('CANDIDATE_SIGNED_ROUTE_MATRIX_IDENTITY_OR_COMPLETENESS_INVALID');
  }

  const rebuilt = buildCandidateSignedTenantRouteCoverage({
    proof: candidateProofFromChecks(candidate.checks || {}),
    manifest,
    inventory,
    manifestBytes,
    inventoryBytes,
    candidateMode: true,
    databaseName: expected.databaseName,
    parentBranchId: expected.parentBranchId,
    deploymentId: expected.deploymentId,
    sourceCommitHint: expected.commit,
    pipelineId: expected.pipelineId,
    testedAt: originalMatrix.testedAt
  });

  if (stableJson(rebuilt) !== stableJson(originalMatrix)) {
    fail('CANDIDATE_MATRIX_DOES_NOT_MATCH_REBUILT_ROUTE_PROOFS');
  }
  if (rebuilt.status !== 'PASS' || rebuilt.coveredRouteCount !== 67
      || rebuilt.failedRouteCount !== 0 || rebuilt.routes.length !== 67) {
    fail('REBUILT_ROUTE_MATRIX_NOT_COMPLETE_PASS');
  }

  const output = { ...rebuilt };
  // The final artifact remains bound to the deployment whose real HTTP routes
  // were probed. It is never rewritten to the ID of a later deployment.
  output.evidenceRebind = null;
  return output;
}

function writeAndVerifyCoverage({
  candidate,
  outputPath,
  expectedCommit,
  expectedPipelineId,
  expectedParentBranchId,
  expectedDeploymentId,
  expectedDatabaseName = 'opscore_acceptance',
  manifestPath = MANIFEST_PATH,
  inventoryPath = INVENTORY_PATH
}) {
  const manifestFile = parseJsonFile(manifestPath, 'SIGNED_TENANT_CONTEXT_ROUTE_MANIFEST');
  const inventoryFile = parseJsonFile(inventoryPath, 'API_ROUTE_INVENTORY');
  const output = buildFinalProductionCoverage({
    candidate,
    manifest: manifestFile.value,
    inventory: inventoryFile.value,
    manifestBytes: manifestFile.bytes,
    inventoryBytes: inventoryFile.bytes,
    expectedCommit,
    expectedPipelineId,
    expectedParentBranchId,
    expectedDeploymentId,
    expectedDatabaseName
  });

  const absoluteOutput = path.resolve(outputPath);
  const directory = path.dirname(absoluteOutput);
  fs.mkdirSync(directory, { recursive: true });
  const temporaryPath = absoluteOutput + '.tmp-' + process.pid + '-' + crypto.randomUUID();
  const env = {
    ...process.env,
    OPSC_RELEASE_CI_COMMIT: String(expectedCommit).toLowerCase(),
    OPSC_RELEASE_CI_PIPELINE_ID: String(expectedPipelineId),
    OPSC_PRODUCTION_NEON_BRANCH_ID: String(expectedParentBranchId),
    OPSC_PRODUCTION_PROBE_DEPLOYMENT_ID: String(expectedDeploymentId),
    OPSC_PRODUCTION_DATABASE_NAME: String(expectedDatabaseName)
  };

  try {
    fs.writeFileSync(temporaryPath, JSON.stringify(output, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    const proof = readProductionSignedTenantRouteCoverageEvidence(
      temporaryPath,
      env,
      manifestPath,
      inventoryPath
    );
    if (proof.status !== 'PASS'
        || proof.testedRoutes !== 67
        || proof.coveredRouteCount !== 67
        || proof.failedRouteCount !== 0
        || proof.commitBound !== true
        || proof.pipelineBound !== true
        || proof.parentBranchBound !== true
        || proof.deploymentIdBound !== true
        || proof.manifestBound !== true
        || proof.inventoryBound !== true
        || proof.routeResultsValid !== true) {
      fail('RELEASE_PROOF_READER_REJECTED_SIGNED_ROUTE_MATRIX:' + JSON.stringify(proof));
    }
    fs.renameSync(temporaryPath, absoluteOutput);
    return {
      status: 'PASS',
      outputPath: absoluteOutput,
      deploymentId: output.deploymentId,
      sourceCommitHint: output.sourceCommitHint,
      pipelineId: output.pipelineId,
      testedRoutes: proof.testedRoutes,
      coveredRouteCount: proof.coveredRouteCount,
      failedRouteCount: proof.failedRouteCount,
      routeManifestSha256: output.routeManifestSha256,
      routeInventorySha256: output.routeInventorySha256,
      evidenceSha256: crypto.createHash('sha256').update(fs.readFileSync(absoluteOutput)).digest('hex')
    };
  } catch (error) {
    try { fs.unlinkSync(temporaryPath); } catch (_) {}
    throw error;
  }
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (!argv[i].startsWith('--')) continue;
    const key = argv[i].slice(2);
    const value = argv[i + 1];
    if (!value || value.startsWith('--')) fail('CLI_OPTION_VALUE_MISSING:' + key);
    args[key] = value;
    i += 1;
  }
  return args;
}

function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (!args.input || !args.output || !args['parent-branch-id'] || !args['deployment-id']) {
    fail('USAGE: --input <candidate-result.json> --output <coverage.json> --parent-branch-id <neon-branch-id> --deployment-id <dpl_id>');
  }
  const candidate = parseJsonDocument(fs.readFileSync(path.resolve(args.input), 'utf8'));
  const result = writeAndVerifyCoverage({
    candidate,
    outputPath: args.output,
    expectedCommit: args.commit || process.env.GITHUB_SHA || process.env.OPSC_RELEASE_CI_COMMIT,
    expectedPipelineId: args['pipeline-id'] || process.env.GITHUB_RUN_ID || process.env.OPSC_RELEASE_CI_PIPELINE_ID,
    expectedParentBranchId: args['parent-branch-id'],
    expectedDeploymentId: args['deployment-id'],
    expectedDatabaseName: args['database-name'] || process.env.OPSC_PRODUCTION_DATABASE_NAME || 'opscore_acceptance',
    manifestPath: args.manifest || MANIFEST_PATH,
    inventoryPath: args.inventory || INVENTORY_PATH
  });
  process.stdout.write(JSON.stringify(result) + '\n');
}

if (require.main === module) {
  try { main(); }
  catch (error) {
    process.stderr.write('SIGNED_TENANT_ROUTE_COVERAGE_FINALIZE_FAILED:'
      + String(error && (error.code || error.message) || error).slice(0, 1200) + '\n');
    process.exitCode = 1;
  }
}

module.exports = {
  assertCandidateRuntime,
  candidateProofFromChecks,
  assertNoExternalDeliveryRoutes,
  buildFinalProductionCoverage,
  writeAndVerifyCoverage,
  parseArgs,
  main
};
