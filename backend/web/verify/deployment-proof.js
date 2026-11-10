'use strict';
(async function () {
  const byId = id => document.getElementById(id);
  const set = (id, value) => { const el = byId(id); if (el) el.textContent = value == null || value === '' ? '—' : String(value); };
  try {
    const response = await fetch('/api/verify/deployment', { cache: 'no-store', credentials: 'same-origin' });
    const proof = await response.json();
    if (!response.ok || proof.status !== 'identified') throw new Error('Runtime deployment identity is unavailable (HTTP ' + response.status + ').');
    set('environment', proof.deployment && proof.deployment.environment);
    set('provider', proof.source && proof.source.provider);
    set('ref', proof.source && proof.source.ref);
    set('commit', proof.source && proof.source.commitSha);
    set('deployment', proof.deployment && proof.deployment.id);
    set('checked-at', proof.checkedAt);
    const sha = proof.source && proof.source.commitSha;
    if (/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i.test(String(sha || ''))) {
      const link = byId('commit-link');
      link.href = 'https://github.com/mosamiryamany-hub/opscore-platform/commit/' + encodeURIComponent(sha);
      link.hidden = false;
    }
    byId('status').textContent = 'IDENTIFIED';
    byId('status').className = 'state good';
    set('message', proof.note);
  } catch (error) {
    byId('status').textContent = 'UNAVAILABLE';
    byId('status').className = 'state bad';
    set('message', error.message || 'Deployment proof request failed.');
  }
})();
