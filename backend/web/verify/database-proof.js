'use strict';
(async function () {
  const byId = id => document.getElementById(id);
  const set = (id, value) => { const el = byId(id); if (el) el.textContent = value == null || value === '' ? '—' : String(value); };
  try {
    const response = await fetch('/api/verify/database', { cache: 'no-store', credentials: 'same-origin' });
    const data = await response.json();
    set('st', data.ok ? 'CONNECTED' : 'UNAVAILABLE');
    byId('st').className = data.ok ? 'ok' : '';
    set('eng', data.engine || '—');
    set('ts', data.checkedAt || new Date().toISOString());
  } catch (_) {
    set('st', 'UNAVAILABLE');
  }
  try {
    const response = await fetch('/api/verify/database-security', { cache: 'no-store', credentials: 'same-origin' });
    const data = await response.json();
    const identity = data.identityPlane || {};
    const pub = data.publicSchema || {};
    set('sec-status', data.productionIsolationCertification || data.status || 'UNAVAILABLE');
    byId('sec-status').className = (data.productionIsolationCertification === 'NOT_CERTIFIED' || data.status === 'NOT_CERTIFIED') ? 'bad' : '';
    set('sec-total', pub.ordinaryTableCount ?? '—');
    set('sec-rls', (pub.rlsEnabledTableCount ?? '—') + ' / ' + (pub.rlsForcedTableCount ?? '—'));
    set('sec-no-rls', pub.tablesWithoutRlsCount ?? '—');
    set('sec-identity', identity.criticalTablesWithoutRlsButAccessibleToRuntimeRole ?? '—');
    set('sec-note', data.note || 'No security note was returned.');
  } catch (_) {
    set('sec-status', 'UNAVAILABLE');
    set('sec-note', 'Could not fetch the live catalog proof. No production isolation certification is inferred.');
  }
})();
