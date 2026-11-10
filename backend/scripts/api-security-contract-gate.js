'use strict';
const fs = require('node:fs');
const path = require('node:path');

const server = fs.readFileSync(path.join(__dirname, '..', 'src', 'server.js'), 'utf8');
const checks = [
  {code:'AUTH_CONTEXT_GATE', pass:server.includes('const c = requireCtx(req, res);') && server.includes('if (!c)')},
  {code:'API_KEY_SCOPE_GATE', pass:server.includes("if (c.apiKeyId)") && server.includes("requireScope(c, ['GET', 'HEAD', 'OPTIONS'].includes(method) ? 'read' : 'write');")},
  {code:'CORRELATION_GATE', pass:server.includes("res.setHeader('x-correlation-id', correlationId);")},
  {code:'BODY_LIMIT_GATE', pass:server.includes('if (bytes > max)') && server.includes('PAYLOAD_TOO_LARGE')},
  {code:'SAFE_ERROR_EGRESS', pass:server.includes("require('./egress-guard')") && server.includes('safeError(err)')},
  {code:'TENANT_AUTHZ_EVIDENCE', pass:server.includes('recordAuthorizationDecision') && server.includes('/api/v1/security/authorization-decisions')},
  {code:'INTEGRITY_GRAPH_ENDPOINT', pass:server.includes('/api/v1/security/integrity-graph')},
  {code:'OPERATION_ENVELOPE_ENDPOINT', pass:server.includes('operation-envelopes') && server.includes('opEnv = url.pathname.match')},
  {code:'NO_PRODUCTION_EVAL', pass:!/(^|\n)\s*(eval\s*\(|new\s+Function\s*\()/m.test(server)},
];
const failed=checks.filter(x=>!x.pass);
const report={schemaVersion:'opscore.api-security-contract.v1',generatedAt:new Date().toISOString(),status:failed.length?'FAIL':'PASS',checks,failed};
console.log(JSON.stringify(report,null,2));
process.exitCode=failed.length?1:0;
