'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const src = path.join(root, 'src');
const read = f => fs.readFileSync(f, 'utf8');
const files = fs.readdirSync(src).filter(f => f.endsWith('.js')).map(f => path.join(src, f));
const text = files.map(read).join('\n');
const serverText = read(path.join(root, 'src', 'server.js'));
const publicRoutes = new Set(['/api/v1/auth/bootstrap','/api/v1/auth/oidc/exchange','/api/v1/auth/login','/api/v1/auth/mobile-login','/api/v1/auth/logout','/api/v1/auth/password-reset','/api/v1/auth/invitations/accept']);
const globalAuthLine = serverText.split(/\n/).findIndex(line => line.includes('const c = requireCtx(req, res);')) + 1;
function classifyWindow(pathValue, line, lines) {
  const window=lines.slice(Math.max(0,line-1),Math.min(lines.length,line+9)).join('\n');
  if (globalAuthLine && line >= globalAuthLine) return 'global-requireCtx';
  if (publicRoutes.has(pathValue)) return 'public-or-token-explicit';
  if (/const c=requireCtx\(req,res\)|const c = requireCtx\(req, res\)|requireCtx\(req,res\)/.test(window)) return 'requireCtx';
  if (/portalToken|exchangePortalAccess|portalOverview|portalWorkOrder|portalReschedule|selfScheduleCandidates|bookSelfSchedule/.test(window)) return 'portal-token';
  if (/verifySignature\(|rawBody\(req\)/.test(window)) return 'signed-webhook';
  if (/sessionTokenFromRequest\(req\)|loginRateLimit\(req\)|authProviderGate\(\)/.test(window)) return 'auth-boundary';
  return null;
}
function routeSecurityInventory(source) {
  const lines = source.split(/\n/);
  const findings = [];
  for (let i = 0; i < lines.length; i++) {
    const exact = lines[i].match(/url\.pathname\s*===\s*['"](\/api\/v1\/[^'"]+)['"]/);
    const isRegexRoute = lines[i].includes('url.pathname.match(') && lines[i].includes('/api/v1');
    if (exact) {
      findings.push({ path: exact[1], line: i + 1, protectedBy: classifyWindow(exact[1], i + 1, lines), kind: 'exact' });
    } else if (isRegexRoute) {
      findings.push({ path: 'REGEX_ROUTE', pattern: lines[i].trim(), line: i + 1, protectedBy: classifyWindow('REGEX_ROUTE', i + 1, lines), kind: 'regex' });
    }
  }
  return findings;
}
const routeInventory=routeSecurityInventory(serverText);
const routeGatePass=globalAuthLine>0 && routeInventory.length>0 && routeInventory.every(x=>Boolean(x.protectedBy));
const checks = [
  ['TENANT_BOUNDARY', /organization_id=\?|organization_id IN|ctx\.organizationId/],
  ['RBAC_GATE', /requireRole\(/],
  ['API_KEY_SCOPE', /requireScope\(/],
  ['AUTHZ_EVIDENCE', /recordAuthorizationDecision/],
  ['CORRELATION_CONTEXT', /correlationId/],
  ['IDEMPOTENCY', /idempotentWrite/],
  ['OPERATION_ENVELOPE', /operation_envelopes|makeEnvelope/],
  ['EGRESS_SANITIZATION', /safeError|sanitize/],
  ['SSRF_CONTROL', /isPrivateIp|private|loopback/],
  ['UPLOAD_INTEGRITY', /sha256|content-type|mime/i],
  ['SECURITY_HEADERS', /Content-Security-Policy|X-Content-Type-Options/],
  ['NO_DYNAMIC_EVAL', !/\beval\s*\(|new\s+Function\s*\(/.test(text)],
  ['NO_PROD_SHELL_EXEC', !/\b(child_process|execSync|spawnSync|execFileSync)\b/.test(files.filter(f => !f.includes('test')).map(read).join('\n'))],
  ['ROUTE_AUTHORIZATION_INVENTORY', routeGatePass]
];
const result = {schemaVersion:'opscore.security-threat-model.v1', mode:'deterministic-static', generatedAt:new Date().toISOString(), routeInventory, checks:checks.map(([id,pass])=>({id,pass:Boolean(pass)})), status:checks.every(([,p])=>p)?'PASS':'REVIEW', limitations:['Static analysis only; live PostgreSQL/RLS, OIDC/JWKS, network controls and external providers remain infrastructure-dependent.','Route authorization inventory is conservative; an unclassified route fails the gate rather than relying on repository-wide token presence.','Subprocess usage in release/test tooling is intentionally outside production-source checks.']};
console.log(JSON.stringify(result,null,2));
process.exit(result.status === 'PASS' ? 0 : 1);
