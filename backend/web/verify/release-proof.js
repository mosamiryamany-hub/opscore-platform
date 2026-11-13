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
  try {
    const response = await fetch('/api/verify/release', {
      cache: 'no-store',
      headers: { accept: 'application/json' }
    });
    if (!response.ok) throw new Error('Release proof unavailable');
    const proof = await response.json();
    set('status', proof.status || 'UNVERIFIED', proof.status === 'PASS_WITH_BUYER_RESIDUALS' ? 'warn' : 'bad');
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
        pipeline.textContent = 'UNVERIFIED';
      }
    }
    const identitySource = proof.sourceCommitIdentitySource || 'unverified';
    set('identitySource', identitySource, identitySource === 'github-actions-cli-assertion' ? 'ok' : 'bad');
    const ciStatus = proof.ci && proof.ci.status || 'UNVERIFIED';
    set('ciGate', ciStatus, ciStatus === 'PASS' ? 'ok' : 'bad');
    const gates = proof.gates || {};
    set('commercialGate', gates.commercialClosure, gates.commercialClosure === 'PASS_WITH_BUYER_RESIDUALS' ? 'warn' : 'bad');
    const acceptanceStatus = proof.productionAcceptance && proof.productionAcceptance.status || 'NOT_VERIFIED';
    set('acceptanceGate', acceptanceStatus, acceptanceStatus === 'PASS' ? 'ok' : 'warn');
    set('rlsGate', gates.livePostgresRls, gates.livePostgresRls === 'PASS_TEST_SCOPE' ? 'ok' : 'bad');
    set('sessionGate', gates.productionSessionTenantBoundary, gates.productionSessionTenantBoundary === 'PASS_PRODUCTION' ? 'ok' : 'warn');
    set('recoveryGate', gates.productionRecoveryBundle, gates.productionRecoveryBundle === 'PASS_PRODUCTION' ? 'ok' : 'warn');
    set('isolationGate', gates.productionIsolationCertification, 'warn');
    const pkg = proof.packageFingerprint || {};
    set('packageSha', pkg.value || 'UNVERIFIED');
    set('packageState', pkg.status || 'UNVERIFIED', pkg.status === 'PUBLISHED' ? 'ok' : 'warn');
  } catch (_) {
    set('status', 'LIVE RELEASE PROOF UNAVAILABLE', 'bad');
  }
})();
