'use strict';
const path = require('node:path');
const http = require('node:http');
process.env.HOST = process.env.HOST || '0.0.0.0';
process.env.PORT = process.env.PORT || '3000';
// Fail-closed release identity (B1): never self-assert verification. Only an
// explicit operator-provided 'true' (via Vercel env bound to a verified build)
// may set this; anything else resolves to 'false'.
const opscReleaseVerified = String(process.env.OPSC_RELEASE_VERIFIED || '').toLowerCase();
process.env.OPSC_RELEASE_VERIFIED = ['true', 'false'].includes(opscReleaseVerified) ? opscReleaseVerified : 'false';
// Fail-closed hold (B2): production stays on hold unless the release identity is
// explicitly verified. Missing proof => 503 PRODUCTION_HOLD_ACTIVE, never open service.
process.env.OPSC_PRODUCTION_HOLD = opscReleaseVerified === 'true'
  ? (process.env.OPSC_PRODUCTION_HOLD || 'false')
  : 'true';
process.env.OPSC_EXPECTED_INSTANCES = process.env.OPSC_EXPECTED_INSTANCES || '1';
// Rate-limit state (B3): operator-controlled. The previous hard-coded 'memory'
// value forced per-instance counters on multi-instance deploys and could not be
// overridden. Set FIREWALL_RATE_STATE=database with a shared store (or enforce
// the limit at the Vercel edge/WAF) for multi-instance correctness.
if (process.env.FIREWALL_RATE_STATE === undefined) process.env.FIREWALL_RATE_STATE = 'memory';
if (!process.env.OPSC_DATABASE_URL && !process.env.DATABASE_URL) throw new Error('DATABASE_URL_REQUIRED');
// Prefer restricted OpsCore role URL when present (commercial security boundary).
if (process.env.OPSC_DATABASE_URL) process.env.DATABASE_URL = process.env.OPSC_DATABASE_URL;
process.env.DATABASE_ENGINE = 'postgres';
process.env.NODE_ENV = process.env.NODE_ENV || 'production';
process.env.OPSC_PG_SSL_MODE = process.env.OPSC_PG_SSL_MODE || 'require';
process.env.OPSC_PG_SSL_REJECT_UNAUTHORIZED = process.env.OPSC_PG_SSL_REJECT_UNAUTHORIZED || 'true';
let cachedHandler = null, initError = null;
function loadHandler() {
  if (cachedHandler) return cachedHandler;
  if (initError) throw initError;
  let requestHandler = null;
  const originalCreateServer = http.createServer;
  http.createServer = function (opts, cb) {
    if (typeof opts === 'function') { requestHandler = opts; return originalCreateServer.call(this, opts); }
    requestHandler = cb; return originalCreateServer.call(this, opts, cb);
  };
  const originalListen = http.Server.prototype.listen;
  http.Server.prototype.listen = function () { return this; };
  try { require(path.join(__dirname, '..', 'backend', 'src', 'server.js')); }
  catch (e) {
    initError = e; http.createServer = originalCreateServer; http.Server.prototype.listen = originalListen; throw e;
  }
  http.createServer = originalCreateServer; http.Server.prototype.listen = originalListen;
  if (typeof requestHandler !== 'function') { initError = new Error('HANDLER_MISSING'); throw initError; }
  cachedHandler = requestHandler; return cachedHandler;
}
module.exports = function (req, res) {
  try { return loadHandler()(req, res); }
  catch (err) {
    console.error(err);
    res.statusCode = 500; res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ error: { code: 'ADAPTER_FAILURE', message: String(err && err.message || err) } }));
  }
};
