'use strict';

const fs = require('node:fs');

const VERCEL_API_ORIGIN = 'https://api.vercel.com';
const NEON_API_ORIGIN = 'https://console.neon.tech/api/v2';
const ALLOWED_VERCEL_PLANS = new Set(['pro', 'enterprise']);
const ALLOWED_NEON_PRIMARY_PROTECTION_PLANS = new Set(['scale', 'business', 'enterprise']);

function required(env, key, code) {
  const value = String(env[key] || '').trim();
  if (!value) throw new Error(code || key + '_REQUIRED');
  return value;
}

async function requestJson(fetchImpl, url, token, codePrefix) {
  const response = await fetchImpl(url, {
    method: 'GET',
    headers: {
      authorization: 'Bearer ' + token,
      accept: 'application/json'
    },
    redirect: 'manual',
    signal: AbortSignal.timeout(15000)
  });
  const raw = await response.text();
  if (!response.ok) throw new Error(codePrefix + '_HTTP_' + response.status);
  let payload;
  try { payload = raw ? JSON.parse(raw) : {}; }
  catch { throw new Error(codePrefix + '_RESPONSE_INVALID'); }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error(codePrefix + '_RESPONSE_INVALID');
  }
  return payload;
}

function parseNeonProject(payload) {
  const project = payload && (payload.project || payload);
  if (!project || typeof project !== 'object' || Array.isArray(project)) {
    throw new Error('NEON_PROJECT_RESPONSE_INVALID');
  }
  return project;
}

function parseBranches(payload) {
  const branches = payload && payload.branches;
  if (!Array.isArray(branches)) throw new Error('NEON_BRANCH_LIST_INVALID');
  return branches;
}

async function runCandidatePlanPreflight(options = {}) {
  const env = options.env || process.env;
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') throw new Error('PLAN_PREFLIGHT_FETCH_UNAVAILABLE');

  const vercelToken = required(env, 'VERCEL_TOKEN');
  const vercelTeamId = required(env, 'VERCEL_ORG_ID', 'VERCEL_TEAM_ID_REQUIRED');
  const neonApiKey = required(env, 'NEON_API_KEY');
  const neonProjectId = required(env, 'NEON_PROJECT_ID');
  const expectedPrimaryBranchId = required(env, 'OPSC_PRODUCTION_NEON_BRANCH_ID');
  const expectedVercelProjectId = required(env, 'VERCEL_PROJECT_ID');

  const team = await requestJson(
    fetchImpl,
    VERCEL_API_ORIGIN + '/v2/teams/' + encodeURIComponent(vercelTeamId),
    vercelToken,
    'VERCEL_TEAM_PLAN'
  );
  if (String(team.id || '') !== vercelTeamId) throw new Error('VERCEL_TEAM_IDENTITY_MISMATCH');
  const vercelPlan = String(team.billing && team.billing.plan || '').trim().toLowerCase();
  if (!ALLOWED_VERCEL_PLANS.has(vercelPlan)) {
    throw new Error('VERCEL_PLAN_NOT_ELIGIBLE:' + (vercelPlan || 'unknown'));
  }

  const neonProjectPayload = await requestJson(
    fetchImpl,
    NEON_API_ORIGIN + '/projects/' + encodeURIComponent(neonProjectId),
    neonApiKey,
    'NEON_PROJECT_PLAN'
  );
  const neonProject = parseNeonProject(neonProjectPayload);
  if (String(neonProject.id || '') !== neonProjectId) throw new Error('NEON_PROJECT_IDENTITY_MISMATCH');
  const neonOrgId = String(neonProject.org_id || neonProject.owner_id || '').trim();
  if (!neonOrgId) throw new Error('NEON_PROJECT_ORGANIZATION_ID_MISSING');
  if (String(env.NEON_ORG_ID || '').trim() && String(env.NEON_ORG_ID).trim() !== neonOrgId) {
    throw new Error('NEON_ORGANIZATION_IDENTITY_MISMATCH');
  }

  const neonOrg = await requestJson(
    fetchImpl,
    NEON_API_ORIGIN + '/organizations/' + encodeURIComponent(neonOrgId),
    neonApiKey,
    'NEON_ORGANIZATION_PLAN'
  );
  if (String(neonOrg.id || '') !== neonOrgId) throw new Error('NEON_ORGANIZATION_IDENTITY_MISMATCH');
  const neonPlan = String(neonOrg.plan || '').trim().toLowerCase();
  if (!ALLOWED_NEON_PRIMARY_PROTECTION_PLANS.has(neonPlan)) {
    throw new Error('NEON_PLAN_NOT_ELIGIBLE_FOR_PRIMARY_PROTECTION:' + (neonPlan || 'unknown'));
  }

  const branchPayload = await requestJson(
    fetchImpl,
    NEON_API_ORIGIN + '/projects/' + encodeURIComponent(neonProjectId) + '/branches',
    neonApiKey,
    'NEON_BRANCH_PREFLIGHT'
  );
  const branches = parseBranches(branchPayload);
  const parent = branches.find(item => String(item && item.id || '') === expectedPrimaryBranchId);
  if (!parent) throw new Error('NEON_PRIMARY_BRANCH_NOT_FOUND');
  if (parent.primary !== true || parent.default !== true || parent.current_state !== 'ready') {
    throw new Error('NEON_PRIMARY_BRANCH_NOT_READY_OR_NOT_PRIMARY');
  }
  if (parent.protected !== true) throw new Error('NEON_PRIMARY_BRANCH_NOT_PROTECTED');
  const branchLimit = Number(env.OPSC_NEON_BRANCH_LIMIT || 10);
  if (!Number.isInteger(branchLimit) || branchLimit < 2 || branchLimit > 100) {
    throw new Error('NEON_BRANCH_LIMIT_INVALID');
  }
  if (branches.length >= branchLimit) {
    throw new Error('NEON_BRANCH_CAPACITY_EXHAUSTED:' + branches.length + '/' + branchLimit);
  }
  const logicalLimit = Number(neonProject.branch_logical_size_limit_bytes || 0);
  const parentLogicalSize = Number(parent.logical_size || 0);
  if (!Number.isSafeInteger(logicalLimit) || logicalLimit <= 0
      || !Number.isSafeInteger(parentLogicalSize) || parentLogicalSize <= 0
      || parentLogicalSize >= logicalLimit) {
    throw new Error('NEON_PRIMARY_BRANCH_LOGICAL_SIZE_NOT_ELIGIBLE');
  }

  const result = {
    status: 'PASS',
    vercelTeamId,
    vercelProjectId: expectedVercelProjectId,
    vercelPlan,
    neonProjectId,
    neonOrganizationId: neonOrgId,
    neonPlan,
    neonPrimaryBranchId: expectedPrimaryBranchId,
    neonPrimaryBranchProtected: true,
    neonBranchCount: branches.length,
    neonBranchLimit: branchLimit,
    neonPrimaryLogicalSizeBytes: parentLogicalSize,
    neonBranchLogicalSizeLimitBytes: logicalLimit,
    candidateEvidenceOnly: true,
    productionPromotionAuthorized: false
  };
  const outputPath = String(env.GITHUB_OUTPUT || '').trim();
  if (outputPath) {
    const pairs = [
      ['preflight_status', result.status],
      ['vercel_plan', vercelPlan],
      ['neon_plan', neonPlan],
      ['neon_branch_count', branches.length],
      ['neon_branch_limit', branchLimit],
      ['neon_primary_branch_id', expectedPrimaryBranchId]
    ];
    fs.appendFileSync(outputPath, pairs.map(([key, value]) => key + '=' + String(value)).join('\n') + '\n', {
      encoding: 'utf8',
      mode: 0o600
    });
  }
  process.stdout.write('CANDIDATE_PLAN_PREFLIGHT=PASS\n');
  process.stdout.write('VERCEL_PLAN=' + vercelPlan + '\n');
  process.stdout.write('NEON_PLAN=' + neonPlan + '\n');
  process.stdout.write('NEON_BRANCH_CAPACITY=' + branches.length + '/' + branchLimit + '\n');
  return result;
}

if (require.main === module) {
  runCandidatePlanPreflight().catch(error => {
    const message = String(error && error.message || '');
    const safe = /^[A-Z0-9_:./-]{1,180}$/.test(message) ? message : 'CANDIDATE_PLAN_PREFLIGHT_FAILED';
    process.stderr.write(safe + '\n');
    process.exitCode = 1;
  });
}

module.exports = {
  ALLOWED_VERCEL_PLANS,
  ALLOWED_NEON_PRIMARY_PROTECTION_PLANS,
  requestJson,
  parseNeonProject,
  parseBranches,
  runCandidatePlanPreflight
};
