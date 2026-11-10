#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..', '..');
const backend = path.join(root, 'backend');
const mobile = path.join(root, 'mobile');
const pkg = JSON.parse(fs.readFileSync(path.join(backend, 'package.json'), 'utf8'));
const mpkg = JSON.parse(fs.readFileSync(path.join(mobile, 'package.json'), 'utf8'));
const server = fs.readFileSync(path.join(backend, 'src', 'server.js'), 'utf8');
const firewall = fs.readFileSync(path.join(backend, 'src', 'firewall.js'), 'utf8');
const security = fs.readFileSync(path.join(backend, 'src', 'security.js'), 'utf8');
const docker = fs.readFileSync(path.join(backend, 'docker', 'Dockerfile'), 'utf8');
const envExample = fs.readFileSync(path.join(backend, '.env.example'), 'utf8');
const lock = JSON.parse(fs.readFileSync(path.join(backend, 'package-lock.json'), 'utf8'));
const mobileLock = JSON.parse(fs.readFileSync(path.join(mobile, 'package-lock.json'), 'utf8'));
const checks = [];
function add(id, status, evidence, next = null) { checks.push({id, status: status === true ? 'VERIFIED' : status === false ? 'FAIL' : status, evidence, next}); }
function has(s, needle) { return s.includes(needle); }
function countFiles() {
  let n = 0;
  const walk = d => { for (const e of fs.readdirSync(d, {withFileTypes:true})) { if (['node_modules','.git'].includes(e.name)) continue; const p=path.join(d,e.name); if(e.isDirectory()) walk(p); else n++; } };
  walk(root); return n;
}
add('http-runtime-bounds', has(server,'server.requestTimeout') && has(server,'server.headersTimeout') && has(server,'keepAliveTimeout') && has(server,'maxHeaderSize'), has(server,'server.requestTimeout') ? null : 'add Node HTTP parser timeouts and header bounds');
add('request-body-uri-bounds', has(firewall,'maxUrlLength') && has(firewall,'maxBodyBytes') && has(firewall,'8192'), 'explicit URI/body/header bounds in request inspection');
add('security-response-headers', has(server,"content-security-policy") && has(server,"x-content-type-options") && has(server,"strict-transport-security"), has(server,'content-security-policy') ? null : 'add browser-facing security headers');
add('session-cookie-hardening', has(server,'SameSite=Strict') && has(server,'HttpOnly') && has(server,'Secure'), 'production Secure + HttpOnly + SameSite=Strict cookie policy');
add('rate-limit-boundary', has(server,'loginRateLimit') && has(firewall,'createRateLimiter'), 'route-specific authentication throttling plus global firewall throttling');
add('rate-limit-distributed-state', 'REMAINING', 'multi-instance rate limiting requires shared state and deployment confirmation; the code already fails closed when expected instances > 1 without it', 'configure shared rate state in the real deployment topology');
add('ssrf-destination-control', has(security,'resolvePublicWebhookHost') && has(security,'isPrivateAddress') && has(firewall,'assertOsrmHostResolvesSafely'), 'destination validation + DNS resolution guard + private-range rejection');
add('external-integrations-fail-closed', has(server,'authProviderGate') && has(server,'productionSafetyGate') && has(firewall,'OSRM_HOST_NOT_ALLOWLISTED'), 'external provider gates remain environment-bound');
add('idempotency-contract', fs.existsSync(path.join(backend,'test','recovery_portability.test.js')) && has(server,'idempotencyKey'), 'idempotency key path and regression coverage exist');
add('tenant-isolation-preflight', fs.existsSync(path.join(backend,'test','security_cross_tenant.test.js')) && fs.existsSync(path.join(backend,'db','postgresql_hierarchy_rls.sql')), 'cross-tenant tests + PostgreSQL RLS contract exist; live DB proof remains later');
add('backup-recovery-harness', fs.existsSync(path.join(backend,'scripts','verify-backup.js')) && fs.existsSync(path.join(backend,'scripts','recovery-drill.js')), 'backup verification and recovery drill harnesses present');
add('release-provenance', fs.existsSync(path.join(backend,'RELEASE_FILE_SHA256SUMS.txt')) && fs.existsSync(path.join(backend,'RELEASE_COMPONENT_SHA256SUMS.txt')) && fs.existsSync(path.join(backend,'SALES_PACKAGE_MANIFEST.json')), 'release digests/manifests present');
add('lockfile-backend', fs.existsSync(path.join(backend,'package-lock.json')) && lock.lockfileVersion === 3, 'backend npm lockfile v3 present');
add('lockfile-mobile', fs.existsSync(path.join(mobile,'package-lock.json')) && mobileLock.lockfileVersion === 3, 'mobile npm lockfile v3 present');
add('docker-install-determinism', has(docker,'npm ci --omit=dev --ignore-scripts') && has(docker,'USER node'), 'container uses npm ci and non-root runtime');
add('production-hold', fs.readFileSync(path.join(backend,'src','firewall.js'),'utf8').includes('OPSC_PRODUCTION_HOLD'), 'production hold remains explicit until live verification');
add('domain-neutrality-gate', fs.existsSync(path.join(backend,'scripts','domain-neutrality-gate.js')), 'generic operational domain gate exists');
add('secret-hygiene', fs.existsSync(path.join(root,'.gitignore')) && fs.readFileSync(path.join(root,'.gitignore'),'utf8').includes('.env') && fs.readFileSync(path.join(root,'.gitignore'),'utf8').includes('*.pem'), 'secret/environment patterns ignored');
add('request-correlation', has(server,'x-correlation-id'), 'request correlation identifier emitted');
add('mobile-live-signing', 'UNVERIFIED', 'device signing, physical-device validation, and store build remain outside source-only evidence', 'real buyer build environment');
add('postgres-live', 'UNVERIFIED', 'DATABASE_URL and live tenant/RLS transaction tests are environment-bound', 'real PostgreSQL runtime');
add('oidc-live', 'UNVERIFIED', 'OIDC discovery/JWKS/token validation is environment-bound', 'real identity provider');
add('network-edge', 'UNVERIFIED', 'TLS termination, reverse proxy/WAF, segmentation, DNS/CAA and network policy require deployment infrastructure', 'buyer infrastructure');
add('external-observability', 'UNVERIFIED', 'central metrics/logs/traces and alerting require deployment infrastructure', 'buyer observability stack');
add('sbom-inventory', fs.existsSync(path.join(root,'docs','sbom',`opscore-v${pkg.version}.cyclonedx.json`)) && fs.existsSync(path.join(root,'docs','sbom','SBOM_GENERATION_RESULT.json')) && fs.existsSync(path.join(root,'scripts','verify-sbom.js')), 'deterministic CycloneDX SBOM generated from both committed npm lockfiles; validation script present');
add('sbom-online-resolution', 'REMAINING', 'source-only environment cannot truthfully prove fresh registry resolution or vulnerability state; lockfile-derived inventory is present', 'run npm ci and npm audit in connected CI/release environment');
add('signed-build-provenance', fs.existsSync(path.join(root,'.github','workflows','opscore-secure-release.yml')) ? 'REMAINING' : 'REMAINING', 'GitHub Actions workflow prepared to generate artifact/SBOM attestation; hosted cryptographic attestation is not present in this ZIP-only execution', 'run the secure release workflow in the real repository and verify the published attestation');
add('security-disclosure-policy', fs.existsSync(path.join(backend,'SECURITY.md')), 'security reporting and production-evidence disclosure boundary documented');
const status = checks.some(x=>x.status==='FAIL') ? 'FAIL' : checks.some(x=>x.status==='REMAINING') ? 'PASS_WITH_REMAINING' : 'PASS';
const report = {
  schemaVersion:'opscore.pre-infrastructure-gate.v1',
  release:pkg.version,
  mobileVersion:mpkg.version,
  generatedAt:new Date().toISOString(),
  status,
  sourceFileCount:countFiles(),
  evidenceBoundary:'SOURCE_STATIC_DETERMINISTIC',
  summary:'Pre-database and pre-infrastructure readiness assessment for generic OpsCore; not a production certification.',
  checks
};
const out = path.join(root,'PRE_INFRASTRUCTURE_READINESS.json');
fs.writeFileSync(out, JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
process.exitCode = status==='FAIL' ? 1 : 0;
