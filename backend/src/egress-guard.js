'use strict';

const SENSITIVE_KEY = /(authorization|cookie|set-cookie|token|secret|password|api[_-]?key|private[_-]?key|client[_-]?secret|credential|signature|webhook[_-]?secret)/i;
const EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
// Dots are excluded so IPv4 addresses are not mistaken for phone numbers; 10+ digits required.
const PHONE = /(?<!\w)\+?\d[\d ()\-]{7,}\d(?!\w)/g;
const redactPhone = (m) => (m.replace(/\D/g, '').length >= 10 ? '[redacted-phone]' : m);
const BEARER = /\bBearer\s+[A-Za-z0-9._~+\-/]+=*/gi;
const LONG_SECRET = /\b(?:sk|rk|pk)_[A-Za-z0-9_-]{16,}\b/g;

function redactString(value) {
  return String(value)
    .replace(BEARER, 'Bearer [redacted-token]')
    .replace(LONG_SECRET, '[redacted-secret]')
    .replace(EMAIL, '[redacted-email]')
    .replace(PHONE, redactPhone);
}

function sanitize(value, seen = new WeakSet(), depth = 0) {
  if (depth > 8) return '[redacted-depth]';
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return redactString(value);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'bigint') return String(value);
  if (Buffer.isBuffer(value)) return '[redacted-buffer]';
  if (typeof value !== 'object') return `[redacted-${typeof value}]`;
  if (seen.has(value)) return '[redacted-circular]';
  seen.add(value);
  if (Array.isArray(value)) return value.map(v => sanitize(v, seen, depth + 1));
  const out = {};
  for (const [key, val] of Object.entries(value)) {
    out[key] = SENSITIVE_KEY.test(key) ? '[redacted-sensitive-field]' : sanitize(val, seen, depth + 1);
  }
  return out;
}

function safeError(error) {
  const raw = String(error?.code || error?.message || 'ERROR').split(':')[0];
  const code = /^[A-Z][A-Z0-9_]{1,99}$/.test(raw) ? raw : 'ERROR';
  return sanitize({ code, name: error?.name || 'Error' });
}

function safeLogPayload(value) { return sanitize(value); }

module.exports = {sanitize, safeError, safeLogPayload, redactString};
