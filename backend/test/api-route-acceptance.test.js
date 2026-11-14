'use strict';

/**
 * Per-route functional contract acceptance over the real HTTP server (SQLite engine).
 *
 * Honest scope — this is CONTRACT-scope acceptance, not full business-flow coverage:
 *   for every route in docs/API_INVENTORY.json it verifies, over a real booted server:
 *     1. the route exists (never matches the unknown-route 404 marker),
 *     2. the auth contract holds (auth=required => 401/403 when unauthenticated),
 *     3. the route never returns an unhandled 5xx.
 * Evidence: backend/docs/verification/API_ROUTE_ACCEPTANCE_RESULT.json when
 * OPSC_WRITE_EVIDENCE=1 (deploy CI), otherwise a temp file for normal runs.
 * The gate flips functionalApiRouteAcceptance to PASS_CONTRACT_SCOPE only when the
 * evidence status=PASS and its commitSha matches the deployed commit.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execSync, spawn } = require('node:child_process');

const REPO = path.resolve(__dirname, '..');
const EVIDENCE_PATH = path.join(REPO, 'docs', 'verification', 'API_ROUTE_ACCEPTANCE_RESULT.json');
const TMP_EVIDENCE_PATH = path.join(os.tmpdir(), 'api-route-acceptance-result.json');
const WRITE_EVIDENCE = String(process.env.OPSC_WRITE_EVIDENCE || '') === '1';

function waitForServer(child) {
  return new Promise((resolve, reject) => {
    let out = '';
    let err = '';
    const onStdout = chunk => {
      out += chunk.toString();
      const match = out.match(/OpsCore Starter: http:\/\/[^:]+:(\d+)/);
      if (match) { cleanup(); resolve(Number(match[1])); }
    };
    const onStderr = chunk => { err += chunk.toString(); };
    const onError = error => { cleanup(); reject(error); };
    const onExit = code => { cleanup(); reject(new Error(`OpsCore route-acceptance server exited (${code}). ${err.slice(-1200)}`)); };
    const cleanup = () => {
      child.stdout.off('data', onStdout);
      child.stderr.off('data', onStderr);
      child.off('error', onError);
      child.off('exit', onExit);
    };
    child.stdout.on('data', onStdout);
    child.stderr.on('data', onStderr);
    child.once('error', onError);
    child.once('exit', onExit);
  });
}

function concretePath(routeTemplate) {
  // {param} is the generic collection catch-all; every other token is an id-shaped value.
  return routeTemplate
    .replace('{param}', 'work-orders')
    .replace(/\{[^}]+\}/g, '00000000-0000-4000-8000-000000000000');
}

function commitSha() {
  if (process.env.CI_COMMIT_SHA) return String(process.env.CI_COMMIT_SHA);
  try { return execSync('git rev-parse HEAD', { cwd: REPO }).toString().trim(); }
  catch { return null; }
}

test('per-route functional contract acceptance across the full API inventory', async t => {
  const inventory = JSON.parse(fs.readFileSync(path.join(REPO, 'docs', 'API_INVENTORY.json'), 'utf8'));
  assert.ok(inventory.routeCount >= 300, 'inventory must be substantial');
  const routes = inventory.routes;

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'opscore-route-acceptance-'));
  const port = 30000 + Math.floor(Math.random() * 15000);
  const child = spawn(process.execPath, ['src/server.js'], {
    cwd: REPO,
    env: {
      ...process.env,
      NODE_ENV: 'test',
      PORT: String(port),
      HOST: '127.0.0.1',
      PUBLIC_ORIGIN: `http://127.0.0.1:${port}`,
      SQLITE_PATH: path.join(dir, 'route-acceptance.sqlite'),
      OPSC_REPOSITORY_PATH: path.join(dir, 'files'),
      DATABASE_ENGINE: 'sqlite',
      OPSC_DATABASE_URL: '',
      DATABASE_URL: '',
      AUTH_MODE: 'local',
      FIREWALL_RATE_LIMIT: '1024'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  const base = `http://127.0.0.1:${await waitForServer(child)}`;
  const results = [];
  const failures = [];

  try {
    // Learn the unknown-route marker shape first.
    const probe = await fetch(`${base}/api/v1/__route_acceptance_probe_${Date.now()}__`);
    const probeText = await probe.text();
    let probeCode = null;
    try { probeCode = JSON.parse(probeText)?.error?.code || null; } catch { probeCode = probeText.slice(0, 80); }

    for (const route of routes) {
      const method = route.method;
      const urlPath = concretePath(route.route);
      let status = 0; let bodyCode = null;
      try {
        const response = await fetch(base + urlPath, {
          method,
          headers: method === 'GET' || method === 'DELETE' ? {} : { 'content-type': 'application/json' },
          body: method === 'GET' || method === 'DELETE' ? undefined : '{}'
        });
        status = response.status;
        const bodyText = await response.text();
        try { bodyCode = JSON.parse(bodyText)?.error?.code || null; } catch { bodyCode = bodyText.slice(0, 80); }
      } catch (error) {
        status = -1; bodyCode = error.message;
      }

      const unknownMarker = status === 404 && probe.status === 404 && bodyCode !== null && bodyCode === probeCode;
      // Documented env-dependent 503s (server.js error map): an explicitly unconfigured
      // optional dependency is a correct fail-closed answer, not a route defect.
      const ENV_DEPENDENT_503 = new Set(['STRIPE_NOT_CONFIGURED', 'STRIPE_WEBHOOK_NOT_CONFIGURED', 'OSRM_NOT_CONFIGURED']);
      let verdict = 'PASS';
      let reason = null;
      if (status < 0) { verdict = 'FAIL'; reason = 'TRANSPORT_ERROR'; }
      else if (status === 429) { verdict = 'FAIL'; reason = 'RATE_LIMITED_UNVERIFIED'; }
      else if (status === 503 && ENV_DEPENDENT_503.has(String(bodyCode))) { verdict = 'PASS'; reason = `ENV_DEPENDENT_${bodyCode}`; }
      else if (status >= 500) { verdict = 'FAIL'; reason = `UNHANDLED_5XX_${status}`; }
      else if (unknownMarker) { verdict = 'FAIL'; reason = 'ROUTE_MISSING_404'; }
      else if (route.auth === 'required' && ![401, 403].includes(status)) { verdict = 'FAIL'; reason = `AUTH_CONTRACT_${status}`; }
      else if (route.auth === 'public' && status === 404) { verdict = 'FAIL'; reason = 'PUBLIC_ROUTE_404'; }

      const entry = { method, route: route.route, auth: route.auth, statusUnauth: status, bodyCode, verdict, reason };
      results.push(entry);
      if (verdict === 'FAIL') failures.push(entry);
    }
  } finally {
    try { child.kill('SIGTERM'); } catch {}
  }

  const passed = results.filter(r => r.verdict === 'PASS').length;
  const payload = {
    schemaVersion: 'opscore.api-route-acceptance.v1',
    generatedAt: new Date().toISOString(),
    commitSha: commitSha(),
    pipelineId: String(process.env.CI_PIPELINE_ID || '').trim(),
    engine: 'sqlite',
    scope: 'contract-scope: route existence + no unhandled 5xx across all inventory routes; anonymous 401/403 contract for auth=required routes only; public/scoped valid-session behavior and full business-flow happy paths are not covered',
    inventoryRouteCount: inventory.routeCount,
    testedRoutes: results.length,
    passed,
    failed: failures.length,
    rateLimitedFailClosed: results.filter(r => r.reason === 'RATE_LIMITED_FAIL_CLOSED').length,
    envDependentPass: results.filter(r => String(r.reason || '').startsWith('ENV_DEPENDENT')).length,
    unknownRouteProbe: { status: 404 },
    failures,
    results,
    status: results.length === routes.length && failures.length === 0 ? 'PASS' : 'FAIL'
  };

  const evidencePath = WRITE_EVIDENCE ? EVIDENCE_PATH : TMP_EVIDENCE_PATH;
  fs.mkdirSync(path.dirname(evidencePath), { recursive: true });
  fs.writeFileSync(evidencePath, JSON.stringify(payload, null, 2) + '\n');

  assert.equal(payload.testedRoutes, routes.length, 'every inventory route must be probed');
  assert.equal(failures.length, 0, `route contract failures: ${JSON.stringify(failures.slice(0, 10), null, 2)}`);
});
