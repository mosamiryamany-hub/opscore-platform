import { loadAuth } from './auth';
import { clientEventId } from './id';
const BASE = String(process.env.EXPO_PUBLIC_API_BASE_URL || '').trim();
export const MOBILE_VERSION = '0.1.16';
export function apiBase() {
  if (!BASE) throw new Error('API_BASE_URL_NOT_CONFIGURED');
  let parsed;
  try { parsed = new URL(BASE); } catch { throw new Error('API_BASE_URL_INVALID'); }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) throw new Error('API_BASE_URL_MUST_USE_HTTPS');
  if (parsed.pathname !== '/' || parsed.search || parsed.hash) throw new Error('API_BASE_URL_MUST_BE_ORIGIN_ONLY');
  return parsed.origin;
}
async function request(path, options = {}) {
  const authSnapshot = options.authSnapshot || null;
  const fetchOptions = { ...options };
  delete fetchOptions.authSnapshot;
  const base = apiBase();
  const auth = authSnapshot || await loadAuth();
  const headers = {
    'content-type': 'application/json',
    ...options.headers || {}
  };
  if (auth?.token)
    headers.authorization = `Bearer ${ auth.token }`;
  const method = String(options.method || 'GET').toUpperCase();
  const criticalWrite = /^\/api\/v1\/work-orders\/[^/]+(?:\/transition|\/comments|\/attachments|\/evidence-uploads)?$/.test(path) || /^\/api\/v1\/appointments\/[^/]+$/.test(path) || path === '/api/v1/safety-acknowledgements';
  if (method !== 'GET' && criticalWrite && !headers['Idempotency-Key'] && !headers['idempotency-key'])
    headers['Idempotency-Key'] = clientEventId();
  const controller = new AbortController();
  const externalSignal = options.signal;
  const abortFromExternal = () => controller.abort(externalSignal?.reason);
  if (externalSignal?.aborted) abortFromExternal();
  else externalSignal?.addEventListener?.('abort', abortFromExternal, { once: true });
  const timeoutMs = Number(options.timeoutMs || 15000);
  const timer = setTimeout(() => controller.abort(), Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 15000);
  let r;
  try {
    r = await fetch(`${ base }${ path }`, {
      ...fetchOptions,
      timeoutMs: undefined,
      headers,
      signal: controller.signal
    });
  } catch (e) {
    if (e?.name === 'AbortError')
      throw new Error('TIMEOUT');
    throw e;
  } finally {
    clearTimeout(timer);
    externalSignal?.removeEventListener?.('abort', abortFromExternal);
  }
  const text = await r.text();
  let data = {};
  let invalidJson = false;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    invalidJson = true;
    data = { error: { code: 'INVALID_SERVER_JSON' } };
  }
  if (!r.ok) {
    const e = new Error(data?.error?.code || `HTTP_${ r.status }`);
    e.status = r.status;
    e.data = data;
    throw e;
  }
  if (invalidJson) {
    const e = new Error('INVALID_SERVER_JSON');
    e.status = r.status;
    throw e;
  }
  return data;
}
export const api = {
  login: (email, password, organizationId) => request('/api/v1/auth/mobile-login', {
    method: 'POST',
    body: JSON.stringify({
      email,
      password,
      ...(organizationId ? { organizationId } : {})
    })
  }),
  logout: () => request('/api/v1/auth/logout', { method: 'POST', timeoutMs: 5000 }),
  me: () => request('/api/v1/me'),
  contract: () => request(`/api/v1/client-contract?mobileVersion=${ encodeURIComponent(MOBILE_VERSION) }`),
  metrics: () => request('/api/v1/metrics'),
  workOrders: () => request('/api/v1/work-orders'),
  workOrder: id => request(`/api/v1/work-orders/${ encodeURIComponent(id) }`),
  updateWorkOrder: (id, payload) => request(`/api/v1/work-orders/${ encodeURIComponent(id) }`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  }),
  transition: (id, toStatus) => request(`/api/v1/work-orders/${ encodeURIComponent(id) }/transition`, {
    method: 'POST',
    body: JSON.stringify({ toStatus })
  }),
  comments: id => request(`/api/v1/work-orders/${ encodeURIComponent(id) }/comments`),
  addComment: (id, body) => request(`/api/v1/work-orders/${ encodeURIComponent(id) }/comments`, {
    method: 'POST',
    body: JSON.stringify({ body })
  }),
  appointments: (params = {}) => {
    const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ''));
    return request(`/api/v1/appointments${ q.toString() ? `?${ q }` : '' }`);
  },
  appointment: id => request(`/api/v1/appointments/${ encodeURIComponent(id) }`),
  fieldToday: date => request(`/api/v1/field/today${ date ? `?date=${ encodeURIComponent(date) }` : '' }`),
  onMyWay: id => request(`/api/v1/appointments/${ encodeURIComponent(id) }/on-my-way`, {
    method: 'POST',
    headers: { 'Idempotency-Key': clientEventId() }
  }),
  completionPackage: id => request(`/api/v1/work-orders/${ encodeURIComponent(id) }/completion-package`),
  safetyChecklists: () => request('/api/v1/safety-checklists'),
  acknowledgeSafety: payload => request('/api/v1/safety-acknowledgements', {
    method: 'POST',
    body: JSON.stringify(payload)
  }),
  sync: (block, authSnapshot) => request('/api/v1/sync', {
    method: 'POST',
    authSnapshot,
    headers: { 'X-Sync-Block-Id': block?.blockId || '' },
    body: JSON.stringify(block?.events ? block : { blockId: clientEventId(), blockVersion: 1, events: block })
  }),
  doctor: () => request('/api/v1/operations/doctor'),
  timeEntries: (params = {}) => { const q = new URLSearchParams(Object.entries(params).filter(([,v])=>v!==undefined&&v!==null&&v!=='')); return request(`/api/v1/time-entries${q.toString()?`?${q}`:''}`); },
  startTimeEntry: (workOrderId, payload = {}) => request('/api/v1/time-entries/start', { method:'POST', body:JSON.stringify({workOrderId,...payload}) }),
  stopTimeEntry: (id, payload = {}) => request(`/api/v1/time-entries/${encodeURIComponent(id)}/stop`, { method:'POST', body:JSON.stringify(payload) }),
  workOrderTimeSummary: id => request(`/api/v1/work-orders/${encodeURIComponent(id)}/time-summary`),
  syncConflicts: status => request(`/api/v1/sync/conflicts${status?`?status=${encodeURIComponent(status)}`:''}`),
  resolveSyncConflict: (id, payload) => request(`/api/v1/sync/conflicts/${encodeURIComponent(id)}/resolve`, { method:'POST', body:JSON.stringify(payload) }),
  aiStatus: () => request('/api/v1/ai/status'),
  aiWorkOrderSummary: id => request(`/api/v1/ai/work-orders/${encodeURIComponent(id)}/summary`, { method:'POST', body:'{}' }),
  attachment: (id, payload, idempotencyKey, authSnapshot) => request(`/api/v1/work-orders/${ encodeURIComponent(id) }/attachments`, {
    method: 'POST',
    authSnapshot,
    headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {},
    body: JSON.stringify(payload)
  }),
  fieldDurationForecast: id => request(`/api/v1/work-orders/${encodeURIComponent(id)}/field-duration-forecast`),
  signoffChallenge: (id, documentSha256) => request(`/api/v1/work-orders/${encodeURIComponent(id)}/signoff-assurance/challenge`, { method:'POST', body:JSON.stringify({documentSha256}) }),
  signoffAssuranceComplete: (id, payload) => request(`/api/v1/work-orders/${encodeURIComponent(id)}/signoff-assurance/complete`, { method:'POST', body:JSON.stringify(payload) }),
  signoffAssurance: (id, payload) => request(`/api/v1/work-orders/${encodeURIComponent(id)}/signoff-assurance`, { method:'POST', body:JSON.stringify(payload) }),
  fieldInvoice: (id, payload) => request(`/api/v1/work-orders/${encodeURIComponent(id)}/field-invoice`, { method:'POST', body:JSON.stringify(payload) }),
  dynamicGeofenceEvaluate: payload => request('/api/v1/geofences/dynamic-evaluate', { method:'POST', body:JSON.stringify(payload) })
};
