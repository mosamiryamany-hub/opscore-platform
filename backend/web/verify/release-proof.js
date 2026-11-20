'use strict';

(async function loadReleaseProof() {
  const $ = (id) => document.getElementById(id);
  const set = (id, value, state) => {
    const el = $(id);
    if (!el) return;
    el.textContent = value == null || value === '' ? 'UNVERIFIED' : String(value);
    el.classList.remove('ok', 'warn', 'bad');
    if (state) el.classList.add(state);
  };
  const stateFor = (value, accepted = []) => {
    if (accepted.includes(value)) return 'ok';
    if (['FAIL', 'FAILED', 'ERROR', 'BLOCKED'].includes(String(value || '').toUpperCase())) return 'bad';
    return 'warn';
  };
  const readProof = async (url) => {
    const response = await fetch(url, {
      cache: 'no-store',
      headers: { accept: 'application/json' }
    });
    if (!response.ok) throw new Error('Proof unavailable: ' + url);
    return response.json();
  };

  try {
    const proof = await readProof('/api/verify/release');
    set('status', proof.status || 'UNVERIFIED', stateFor(proof.status, ['PASS']));
    set('sourceCommit', proof.sourceCommit || 'UNVERIFIED');
    set('releaseTag', proof.releaseTag || 'NOT PUBLISHED');
    set('deploymentId', proof.deployment && proof.deployment.id || 'UNVERIFIED');

    const pipeline = $('pipeline');
    if (pipeline) {
      if (proof.ci && proof.ci.status === 'PASS' && proof.ci.pipelineId) {
        pipeline.href = 'https://github.com/mosamiryamany-hub/opscore-platform/actions/runs/' + encodeURIComponent(proof.ci.pipelineId);
        pipeline.textContent = String(proof.ci.pipelineId);
      } else {
        pipeline.removeAttribute('href');
        pipeline.textContent = 'UNVERIFIED — no embedded CI assertion';
      }
    }

    const identitySource = proof.sourceCommitIdentitySource || 'unverified';
    set('identitySource', identitySource, identitySource === 'github-actions-cli-assertion' ? 'ok' : 'warn');
    const ciStatus = proof.ci && proof.ci.status || 'UNVERIFIED';
    set('ciGate', ciStatus, stateFor(ciStatus, ['PASS']));
    const gates = proof.gates || {};
    set('commercialGate', gates.commercialClosure, stateFor(gates.commercialClosure, ['PASS']));
    const acceptanceStatus = proof.productionAcceptance && proof.productionAcceptance.status || 'NOT_VERIFIED';
    set('acceptanceGate', acceptanceStatus, stateFor(acceptanceStatus, ['PASS']));
    set('rlsGate', gates.livePostgresRls, gates.livePostgresRls === 'PASS_TEST_SCOPE' ? 'ok' : stateFor(gates.livePostgresRls, ['PASS_PRODUCTION']));
    set('sessionGate', gates.productionSessionTenantBoundary, stateFor(gates.productionSessionTenantBoundary, ['PASS_PRODUCTION']));
    set('recoveryGate', gates.productionRecoveryBundle, stateFor(gates.productionRecoveryBundle, ['PASS_PRODUCTION']));
    set('isolationGate', gates.productionIsolationCertification, stateFor(gates.productionIsolationCertification, ['CERTIFIED', 'PASS_PRODUCTION']));

    const pkg = proof.packageFingerprint || {};
    set('packageSha', pkg.value || 'UNVERIFIED', pkg.value ? 'ok' : 'warn');
    set('packageState', pkg.status || 'UNVERIFIED', stateFor(pkg.status, ['PUBLISHED']));

    const routeProof = proof.signedTenantRouteCoverage || {};
    const routeCountValid = routeProof.status === 'PASS' &&
      Number.isSafeInteger(routeProof.expectedRouteCount) &&
      routeProof.expectedRouteCount > 0 &&
      routeProof.coveredRouteCount === routeProof.expectedRouteCount &&
      routeProof.testedRoutes === routeProof.expectedRouteCount &&
      routeProof.failedRouteCount === 0 &&
      routeProof.commitBound === true &&
      routeProof.pipelineBound === true &&
      routeProof.parentBranchBound === true &&
      routeProof.deploymentIdBound === true &&
      routeProof.manifestBound === true &&
      routeProof.inventoryBound === true &&
      routeProof.routeResultsValid === true;
    set(
      'signedRouteCoverage',
      routeCountValid
        ? 'PASS — ' + routeProof.coveredRouteCount + '/' + routeProof.expectedRouteCount + ' routes; 0 failures; commit/pipeline/deployment bound'
        : 'NOT VERIFIED — signed-session route evidence missing, incomplete, or not bound',
      routeCountValid ? 'ok' : 'warn'
    );

    const recoveryStatus = gates.productionRecoveryBundle || 'NOT_VERIFIED';
    set(
      'recoveryPointEvidence',
      recoveryStatus === 'PASS_PRODUCTION_ROW_COUNT_SCOPE'
        ? 'PASS — production branch-point row-count scope only; not full PITR/content parity'
        : recoveryStatus,
      recoveryStatus === 'PASS_PRODUCTION_ROW_COUNT_SCOPE' ? 'ok' : stateFor(recoveryStatus, ['PASS_PRODUCTION'])
    );
    set(
      'pitrCertification',
      gates.neonPointInTimeRecovery === 'PASS_FULL_PITR_SCOPE'
        ? 'PASS — full PITR scope explicitly attested'
        : 'NOT CERTIFIED — ' + (gates.neonPointInTimeRecovery || 'NOT_VERIFIED') + ' is not a full PITR/restore certificate',
      gates.neonPointInTimeRecovery === 'PASS_FULL_PITR_SCOPE' ? 'ok' : 'warn'
    );

    const archiveProof = proof.releaseArchiveAttestation || proof.provenanceAttestation || {};
    const archiveSha = archiveProof.sha256 || (archiveProof.artifact && archiveProof.artifact.sha256);
    const archiveBound = archiveProof.status === 'PASS' &&
      archiveProof.sourceCommit === proof.sourceCommit &&
      /^[a-f0-9]{64}$/.test(String(archiveSha || '')) &&
      archiveProof.signatureVerified === true;
    set(
      'archiveAttestation',
      archiveBound
        ? 'PASS — signed archive verified and bound to current source commit'
        : 'NOT VERIFIED — live proof does not expose a verified signature-bound archive for this commit',
      archiveBound ? 'ok' : 'warn'
    );

    try {
      const deploymentProof = await readProof('/api/verify/deployment');
      const source = deploymentProof.source || {};
      const identified = deploymentProof.status === 'identified' && Boolean(source.commitSha);
      const method = source.commitIdentitySource || source.provider || 'unknown';
      set(
        'deploymentSourceEvidence',
        identified ? 'IDENTIFIED — ' + method + (method === 'vercel-git-metadata' ? ' (not a GitHub Actions signature)' : '') : 'UNVERIFIED',
        identified ? 'warn' : 'warn'
      );
      set('deployedCommitEvidence', source.commitSha || proof.sourceCommit || 'UNVERIFIED');
    } catch (_) {
      set('deploymentSourceEvidence', 'UNVERIFIED — deployment endpoint unavailable', 'warn');
      set('deployedCommitEvidence', proof.sourceCommit || 'UNVERIFIED', 'warn');
    }

    try {
      const databaseProof = await readProof('/api/verify/database-security');
      const schema = databaseProof.publicSchema || {};
      const runtimeRole = databaseProof.runtimeRole || {};
      const catalogPass = databaseProof.status === 'IDENTITY_PLANE_RLS_ENFORCED' &&
        Number(schema.ordinaryTableCount) > 0 &&
        Number(schema.nonPostgisTablesWithoutRlsCount) === 0 &&
        Number(schema.nonPostgisTablesWithoutForceRlsCount) === 0 &&
        runtimeRole.status === 'LEAST_PRIVILEGE_PRESENT';
      set(
        'databaseCatalogEvidence',
        catalogPass ? 'PASS — LIVE CATALOG CONFIGURATION' : (databaseProof.status || 'UNVERIFIED'),
        catalogPass ? 'ok' : 'warn'
      );
      const ordinary = Number(schema.ordinaryTableCount || 0);
      const enabled = Number(schema.rlsEnabledTableCount || 0);
      const forced = Number(schema.rlsForcedTableCount || 0);
      const nonPostgisMissing = Number(schema.nonPostgisTablesWithoutRlsCount || 0);
      const nonPostgisNotForced = Number(schema.nonPostgisTablesWithoutForceRlsCount || 0);
      const roleStatus = runtimeRole.status || 'UNVERIFIED';
      set(
        'dbCatalogDetails',
        ordinary + ' public ordinary tables; ' + enabled + ' RLS enabled; ' + forced +
          ' FORCE RLS; non-PostGIS gaps ' + nonPostgisMissing + '/' + nonPostgisNotForced +
          '; runtime role: ' + roleStatus +
          '. Catalog-only evidence; it does not certify cross-tenant Production behavior.'
      );
    } catch (_) {
      set('databaseCatalogEvidence', 'UNVERIFIED — database proof unavailable', 'warn');
      set('dbCatalogDetails', 'The live database catalog proof could not be loaded. No tenant-isolation certificate is implied.');
    }
  } catch (_) {
    set('status', 'LIVE RELEASE PROOF UNAVAILABLE', 'bad');
  }
})();
