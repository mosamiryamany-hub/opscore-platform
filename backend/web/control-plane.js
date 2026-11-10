(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const loginPanel = $('loginPanel');
  const controlPlane = $('controlPlane');
  const authState = $('authState');
  const identityLabel = $('identityLabel');
  const loginMessage = $('loginMessage');
  const controlPlaneMessage = $('controlPlaneMessage');
  let snapshot = null;
  let identity = null;

  async function request(path, options = {}) {
    const headers = { ...(options.body ? { 'content-type': 'application/json' } : {}), ...(options.headers || {}) };
    const response = await fetch(path, {
      ...options,
      headers,
      credentials: 'same-origin',
      cache: 'no-store'
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      const message = data && (data.error && (data.error.code || data.error.message) || data.message);
      const error = new Error(message || ('HTTP_' + response.status));
      error.status = response.status;
      error.data = data;
      throw error;
    }
    return data;
  }

  function setMessage(node, message, kind = '') {
    node.textContent = message || '';
    node.className = 'statusline' + (kind ? ' ' + kind : '');
  }
  function node(tag, className, text) {
    const item = document.createElement(tag);
    if (className) item.className = className;
    if (text !== undefined && text !== null) item.textContent = String(text);
    return item;
  }
  function metric(id, value) { $(id).textContent = value === undefined || value === null || value === '' ? '—' : String(value); }
  function pillFor(severity) {
    const s = String(severity || '').toLowerCase();
    return 'pill' + (s === 'critical' || s === 'high' ? ' bad' : s === 'medium' || s === 'watch' ? ' warn' : s === 'nominal' || s === 'low' ? ' good' : '');
  }
  function renderList(target, rows, emptyText, kind) {
    target.replaceChildren();
    if (!rows.length) {
      target.append(node('div', 'item muted', emptyText));
      return;
    }
    rows.forEach((row) => {
      const card = node('article', 'item');
      const top = node('div', 'itemtop');
      const title = node('strong', '', kind === 'flag' ? row.flag_key : row.code || 'Signal');
      top.append(title);
      if (kind === 'flag') {
        top.append(node('span', row.enabled ? 'pill good' : 'pill', row.enabled ? 'ENABLED' : 'DISABLED'));
      } else {
        top.append(node('span', pillFor(row.severity), row.severity || 'info'));
      }
      card.append(top);
      if (kind === 'flag') {
        card.append(node('p', '', row.reason || 'No reason recorded'));
      } else {
        card.append(node('p', '', row.action || 'Review source evidence and determine the next action.'));
        card.append(node('p', 'small', 'Count: ' + String(row.count ?? '—')));
      }
      target.append(card);
    });
  }

  function renderSnapshot(data) {
    snapshot = data;
    const safe = data.safeMode || {};
    const anomalies = Array.isArray(data.anomalies) ? data.anomalies : [];
    const flags = Array.isArray(data.featureFlags) ? data.featureFlags : [];
    metric('cpStatus', String(data.status || 'unknown').toUpperCase());
    metric('cpSafeMode', safe.enabled ? 'ACTIVE' : 'CLEAR');
    $('cpSafeMode').style.color = safe.enabled ? 'var(--red)' : 'var(--green)';
    metric('cpSafeModeReason', safe.reason || (safe.enabled ? 'Safe Mode is enabled' : 'No active reason'));
    metric('cpAnomalyCount', anomalies.length);
    const rate = Number(data.runtime && data.runtime.errorRate);
    metric('cpErrorRate', Number.isFinite(rate) ? (rate * 100).toFixed(2) + '%' : '—');
    metric('cpRuntimeSummary', String((data.runtime && data.runtime.errors) ?? 0) + ' errors / ' + String((data.runtime && data.runtime.requests) ?? 0) + ' requests');
    metric('cpHash', data.resultSha256 || '—');
    metric('cpEvaluatedAt', data.evaluatedAt ? new Date(data.evaluatedAt).toLocaleString() : '—');
    metric('cpOpenWork', data.twin && data.twin.openStatusCount);
    metric('cpOutboxFailed', data.outbox && data.outbox.failed);
    $('governanceNote').textContent = 'Automatic remediation: ' + String(data.governance && data.governance.automaticRemediation) + ' · Human approval required: ' + String(data.governance && data.governance.humanApprovalRequired) + ' · Tenant scoped: ' + String(data.governance && data.governance.tenantScoped);
    renderList($('cpAnomalyList'), anomalies, 'No active signals were returned by the snapshot.', 'anomaly');
    renderList($('cpFlagsList'), flags, 'No organization feature flags are configured.', 'flag');
    $('toggleSafeMode').textContent = safe.enabled ? 'Clear Safe Mode' : 'Activate Safe Mode';
    $('toggleSafeMode').classList.toggle('danger', !safe.enabled);
    const admin = identity && (identity.role === 'owner' || identity.role === 'admin');
    $('toggleSafeMode').disabled = !admin;
    $('downloadRecovery').disabled = !admin;
    controlPlaneMessage.textContent = 'Snapshot refreshed from the authenticated API.';
  }

  async function refreshSnapshot() {
    controlPlane.setAttribute('aria-busy', 'true');
    setMessage(controlPlaneMessage, 'Requesting a fresh tenant-scoped snapshot…');
    try {
      const data = await request('/api/v1/control-plane');
      renderSnapshot(data);
      setMessage(controlPlaneMessage, 'Snapshot refreshed from the authenticated API.', 'success');
    } catch (error) {
      setMessage(controlPlaneMessage, 'Snapshot unavailable: ' + error.message, 'error');
      if (error.status === 401) showLogin('Session expired. Sign in again.');
    } finally {
      controlPlane.setAttribute('aria-busy', 'false');
    }
  }

  function showLogin(message = '') {
    identity = null;
    loginPanel.hidden = false;
    controlPlane.hidden = true;
    authState.textContent = 'Authentication required';
    identityLabel.textContent = 'No authenticated organization';
    if (message) setMessage(loginMessage, message, 'error');
  }

  async function establishSession() {
    authState.textContent = 'Checking authenticated session…';
    try {
      identity = await request('/api/v1/me');
      loginPanel.hidden = true;
      controlPlane.hidden = false;
      authState.textContent = 'Authenticated session';
      identityLabel.textContent = (identity.organization && identity.organization.name || 'Organization') + ' · ' + (identity.user && identity.user.email || 'User') + ' · ' + (identity.role || 'role unknown');
      const admin = identity.role === 'owner' || identity.role === 'admin';
      $('toggleSafeMode').disabled = !admin;
      $('downloadRecovery').disabled = !admin;
      if (!admin) setMessage(controlPlaneMessage, 'Read access available. Safe Mode and recovery export require the owner or admin role.');
      await refreshSnapshot();
    } catch (error) {
      showLogin(error.status && error.status !== 401 ? 'Session check failed: ' + error.message : 'Sign in to access organization-scoped controls.');
    }
  }

  $('loginForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const submit = $('loginSubmit');
    submit.disabled = true;
    setMessage(loginMessage, 'Signing in…');
    const payload = {
      email: $('loginEmail').value.trim(),
      password: $('loginPassword').value,
      organizationId: $('loginOrganization').value.trim() || undefined
    };
    try {
      await request('/api/v1/auth/login', { method: 'POST', body: JSON.stringify(payload) });
      $('loginPassword').value = '';
      setMessage(loginMessage, 'Sign-in request accepted.', 'success');
      await establishSession();
    } catch (error) {
      setMessage(loginMessage, 'Sign-in failed: ' + error.message, 'error');
    } finally {
      submit.disabled = false;
    }
  });

  $('refreshControlPlane').addEventListener('click', refreshSnapshot);
  $('toggleSafeMode').addEventListener('click', async () => {
    if (!snapshot || !identity || !['owner', 'admin'].includes(identity.role)) return;
    const enabled = !(snapshot.safeMode && snapshot.safeMode.enabled);
    const reason = window.prompt(enabled ? 'Reason to activate Safe Mode:' : 'Reason to clear Safe Mode:');
    if (reason === null) return;
    if (!reason.trim()) {
      setMessage(controlPlaneMessage, 'A non-empty reason is required.', 'error');
      return;
    }
    $('toggleSafeMode').disabled = true;
    try {
      await request('/api/v1/control-plane/safe-mode', {
        method: 'POST',
        body: JSON.stringify({ enabled, reason: reason.trim() })
      });
      setMessage(controlPlaneMessage, enabled ? 'Safe Mode activation recorded.' : 'Safe Mode clearance recorded.', 'success');
      await refreshSnapshot();
    } catch (error) {
      setMessage(controlPlaneMessage, 'Safe Mode change was not confirmed: ' + error.message, 'error');
    } finally {
      $('toggleSafeMode').disabled = !(identity && ['owner', 'admin'].includes(identity.role));
    }
  });

  $('downloadRecovery').addEventListener('click', async () => {
    if (!identity || !['owner', 'admin'].includes(identity.role)) return;
    $('downloadRecovery').disabled = true;
    setMessage(controlPlaneMessage, 'Requesting an admin-authorized recovery bundle…');
    try {
      const bundle = await request('/api/v1/control-plane/recovery-bundle');
      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'opscore-recovery-bundle-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json';
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setMessage(controlPlaneMessage, 'Recovery bundle downloaded. Verify its SHA-256 before any recovery workflow.', 'success');
    } catch (error) {
      setMessage(controlPlaneMessage, 'Recovery export failed: ' + error.message, 'error');
    } finally {
      $('downloadRecovery').disabled = !(identity && ['owner', 'admin'].includes(identity.role));
    }
  });

  $('logoutControlPlane').addEventListener('click', async () => {
    try { await request('/api/v1/auth/logout', { method: 'POST', body: '{}' }); }
    catch (error) { setMessage(controlPlaneMessage, 'Sign-out could not be confirmed: ' + error.message, 'error'); return; }
    showLogin('Signed out.');
  });

  establishSession();
})();