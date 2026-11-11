const path = require('node:path');
function env(name, fallback) {
  return process.env[name] ?? fallback;
}
function positiveInt(name, fallback, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
  const value = Number(env(name, String(fallback)));
  if (!Number.isSafeInteger(value) || value < min || value > max)
    throw new Error(`INVALID_CONFIG_${name}`);
  return value;
}
function oneOf(name, fallback, allowed) {
  const value = String(env(name, fallback)).trim().toLowerCase();
  if (!allowed.includes(value)) throw new Error(`INVALID_CONFIG_${name}`);
  return value;
}
const port = positiveInt('PORT', 3000, { max: 65535 });
const publicOriginInput = String(env('PUBLIC_ORIGIN', `http://127.0.0.1:${port}`)).trim();
let publicOrigin;
try {
  const parsed = new URL(publicOriginInput);
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error('INVALID');
  publicOrigin = parsed.origin;
} catch {
  throw new Error('INVALID_CONFIG_PUBLIC_ORIGIN');
}
module.exports = {
  nodeEnv: env('NODE_ENV', 'development'),
  host: env('HOST', '127.0.0.1'),
  port,
  publicOrigin,
  sqlitePath: path.resolve(process.cwd(), env('SQLITE_PATH', './data/opscore.sqlite')),
  sessionTtlHours: positiveInt('SESSION_TTL_HOURS', 24, { max: 8760 }),
  databaseUrl: process.env.OPSC_DATABASE_URL || (String(env('NODE_ENV', 'development')).trim().toLowerCase() === 'production' ? null : process.env.DATABASE_URL || null),
  databaseEngine: env('DATABASE_ENGINE', 'sqlite'),
  storageProvider: oneOf('STORAGE_PROVIDER', 'local', ['local']),
  authMode: env('AUTH_MODE', 'local'),
  maxBodyBytes: positiveInt('MAX_BODY_BYTES', 2000000),
  maxCsvBodyBytes: positiveInt('MAX_CSV_BODY_BYTES', 3000000),
  maxUrlLength: positiveInt('MAX_URL_LENGTH', 8192),
  maxListRows: positiveInt('MAX_LIST_ROWS', 500),
  maxExportRows: positiveInt('MAX_EXPORT_ROWS', 5000),
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET || null,
  stripeWebhookToleranceSeconds: positiveInt('STRIPE_WEBHOOK_TOLERANCE_SECONDS', 300),
  firewallRateWindowMs: positiveInt('FIREWALL_RATE_WINDOW_MS', 60000, { max: 3600000 }),
  firewallRateLimit: positiveInt('FIREWALL_RATE_LIMIT', 240, { max: 10000 }),
  trustProxy: String(process.env.TRUST_PROXY || 'false').toLowerCase() === 'true',
  trustedProxyCidrs: String(process.env.TRUSTED_PROXY_CIDRS || '').split(',').map(x => x.trim()).filter(Boolean),
  firewallRateState: String(process.env.FIREWALL_RATE_STATE || 'memory').toLowerCase(),
  httpRequestTimeoutMs: positiveInt('HTTP_REQUEST_TIMEOUT_MS', 30000, { max: 300000 }),
  httpHeadersTimeoutMs: positiveInt('HTTP_HEADERS_TIMEOUT_MS', 15000, { max: 120000 }),
  httpKeepAliveTimeoutMs: positiveInt('HTTP_KEEP_ALIVE_TIMEOUT_MS', 5000, { max: 120000 }),
  httpMaxHeaders: positiveInt('HTTP_MAX_HEADERS', 100, { max: 2000 }),
  loginRateWindowMs: positiveInt('LOGIN_RATE_WINDOW_MS', 60000, { max: 3600000 }),
  loginRateLimit: positiveInt('LOGIN_RATE_LIMIT', 20, { max: 1000 })
};
