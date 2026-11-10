'use strict';

const SENSITIVE_KEY = /(?:password|passwd|secret|token|authorization|api[_-]?key|card|pan|cvv|ssn|national[_-]?id|iban|email|phone|mobile|bearer|sql|query|password_hash)/i;
const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
// Phone candidates exclude dots so IPv4 addresses and version strings are not redacted.
// A candidate is only treated as a phone number when it carries at least 10 digits.
const PHONE_RE = /\+?\d[\d\s\-()]{7,}\d/g;
const redactPhone = (m) => (m.replace(/\D/g, '').length >= 10 ? '[REDACTED_PHONE]' : m);
const JWT_RE = /eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g;
const BEARER_RE = /Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi;

function redactString(s) {
  return String(s)
    .replace(JWT_RE, '[REDACTED_JWT]')
    .replace(BEARER_RE, 'Bearer [REDACTED]')
    .replace(EMAIL_RE, '[REDACTED_EMAIL]')
    .replace(PHONE_RE, redactPhone)
    .replace(/[\r\n\t]+/g, ' ')
    .slice(0, 256);
}

function redactSensitive(value) {
  if (value instanceof Error) {
    return { name: String(value.name || 'Error').slice(0, 80), message: redactString(value.message || '') };
  }
  if (typeof value === 'string') return redactString(value);
  if (value === null || typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.map((v) => redactSensitive(v));
  if (typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (SENSITIVE_KEY.test(k)) out[k] = '[REDACTED]';
      else out[k] = redactSensitive(v);
    }
    return out;
  }
  try { return redactSensitive(JSON.parse(JSON.stringify(value))); } catch { return '[unserializable]'; }
}

function isProduction() {
  return String(process.env.NODE_ENV || '').toLowerCase() === 'production'
    || String(process.env.OPSC_STRICT_TELEMETRY || '').toLowerCase() === 'true';
}

/** Production boundary: only neutral codes / ids / hashes — never live SQL or PII. */
function productionBoundary(fields = {}) {
  const out = {};
  const allow = /^(?:code|errorCode|status|organizationId|correlationId|durationMs|count|route|method|gateway|sector|hash|eventHash|chainHash|resourceType|resourceId)$/i;
  for (const [key, value] of Object.entries(fields || {})) {
    if (!allow.test(key)) continue;
    if (typeof value === 'string') out[key] = redactString(value).slice(0, 128);
    else if (typeof value === 'number' || typeof value === 'boolean' || value === null) out[key] = value;
  }
  return out;
}

function write(level, event, fields = {}) {
  const record = {
    timestamp: new Date().toISOString(),
    level,
    event: redactString(event)
  };
  const payload = isProduction() ? productionBoundary(fields) : redactSensitive(fields);
  for (const [key, value] of Object.entries(payload || {})) record[key] = value;
  const stream = level === 'warn' ? process.stderr : process.stdout;
  stream.write(JSON.stringify(record) + '\n');
}

function warn(event, fields = {}) { write('warn', event, fields); }
function info(event, fields = {}) { write('info', event, fields); }

function prometheusMetrics(snapshot, service = 'opscore') {
  const esc = v => String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, ' ');
  const lines = [
    '# HELP opscore_http_requests_total Total HTTP requests observed by the process.',
    '# TYPE opscore_http_requests_total counter',
    `opscore_http_requests_total{service="${esc(service)}"} ${Number(snapshot && snapshot.requests) || 0}`
  ];
  if (snapshot && typeof snapshot === 'object') {
    for (const [k, v] of Object.entries(snapshot)) {
      if (k === 'requests') continue;
      if (typeof v === 'number' && Number.isFinite(v)) {
        lines.push(`# TYPE opscore_${k} gauge`);
        lines.push(`opscore_${k}{service="${esc(service)}"} ${v}`);
      }
    }
  }
  return lines.join('\n') + '\n';
}

module.exports = { warn, info, prometheusMetrics, redactSensitive, redactString, productionBoundary, isProduction };
