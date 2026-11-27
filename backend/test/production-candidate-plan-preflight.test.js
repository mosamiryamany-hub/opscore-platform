'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  runCandidatePlanPreflight
} = require('../../scripts/production-candidate-plan-preflight');

function response(status, value) {
  return { status, ok: status >= 200 && status < 300, text: async () => JSON.stringify(value) };
}

function fixture({ vercelPlan = 'pro', neonPlan = 'scale', branches = 4, logicalSize = 166117376, primaryProtected = true } = {}) {
  const calls = [];
  const env = {
    VERCEL_TOKEN: 'vercel-test-token',
    VERCEL_ORG_ID: 'team_xysgxd2E3CsVIYklf0nxOKop',
    VERCEL_PROJECT_ID: 'prj_55IixPihXfnI6YSlkmTC0Vh0sV3J',
    NEON_API_KEY: 'neon-test-token',
    NEON_PROJECT_ID: 'summer-leaf-18448271',
    NEON_ORG_ID: 'org-red-bread-35633140',
    OPSC_PRODUCTION_NEON_BRANCH_ID: 'br-proud-salad-bcshhdap',
    OPSC_NEON_BRANCH_LIMIT: '10'
  };
  const fetchImpl = async (url, options) => {
    calls.push({ url, method: options.method });
    if (url.includes('/v2/teams/')) {
      return response(200, { id: env.VERCEL_ORG_ID, billing: { plan: vercelPlan } });
    }
    if (url.includes('/api/v2/projects/') && !url.endsWith('/branches')) {
      return response(200, {
        project: {
          id: env.NEON_PROJECT_ID,
          org_id: env.NEON_ORG_ID,
          branch_logical_size_limit_bytes: 1073741824
        }
      });
    }
    if (url.includes('/api/v2/organizations/')) {
      return response(200, { id: env.NEON_ORG_ID, plan: neonPlan });
    }
    if (url.endsWith('/branches')) {
      const items = Array.from({ length: branches }, (_, index) => ({
        id: index === 0 ? env.OPSC_PRODUCTION_NEON_BRANCH_ID : 'br-child-' + index,
        name: index === 0 ? 'main' : 'ephemeral-' + index,
        primary: index === 0,
        default: index === 0,
        current_state: 'ready',
        protected: index === 0 ? primaryProtected : false,
        logical_size: index === 0 ? logicalSize : 83197952
      }));
      return response(200, { branches: items });
    }
    return response(404, { message: 'not_found' });
  };
  return { env, calls, fetchImpl };
}

test('candidate plan preflight accepts commercial Vercel and Neon plans only with protected Primary and capacity', async () => {
  const f = fixture();
  const result = await runCandidatePlanPreflight({ env: f.env, fetchImpl: f.fetchImpl });
  assert.equal(result.status, 'PASS');
  assert.equal(result.candidateEvidenceOnly, true);
  assert.equal(result.productionPromotionAuthorized, false);
  assert.equal(result.neonBranchCount, 4);
  assert.equal(result.neonPrimaryBranchProtected, true);
  assert.equal(f.calls.every(call => call.method === 'GET'), true);
});

test('candidate plan preflight blocks Vercel Hobby before any Neon lookup', async () => {
  const f = fixture({ vercelPlan: 'hobby' });
  await assert.rejects(
    () => runCandidatePlanPreflight({ env: f.env, fetchImpl: f.fetchImpl }),
    /VERCEL_PLAN_NOT_ELIGIBLE:hobby/
  );
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls.every(call => call.method === 'GET'), true);
});


test('candidate plan preflight allows Hobby when free-tier candidate evidence is explicitly authorized', async () => {
  const f = fixture({ vercelPlan: 'hobby', neonPlan: 'free', primaryProtected: false });
  f.env.OPSC_ALLOW_FREE_TIER_CANDIDATE_EVIDENCE = 'true';
  const result = await runCandidatePlanPreflight({ env: f.env, fetchImpl: f.fetchImpl });
  assert.equal(result.status, 'PASS_WITH_PLAN_RESIDUALS');
  assert.equal(result.vercelPlan, 'hobby');
  assert.equal(result.neonPlan, 'free');
  assert.equal(result.neonPrimaryBranchProtected, false);
});

test('candidate plan preflight blocks Neon Free before branch lookup', async () => {
  const f = fixture({ neonPlan: 'free' });
  await assert.rejects(
    () => runCandidatePlanPreflight({ env: f.env, fetchImpl: f.fetchImpl }),
    /NEON_PLAN_NOT_ELIGIBLE_FOR_PRIMARY_PROTECTION:free/
  );
  assert.equal(f.calls.some(call => call.url.endsWith('/branches')), false);
  assert.equal(f.calls.every(call => call.method === 'GET'), true);
});

test('candidate plan preflight blocks exhausted branch capacity', async () => {
  const f = fixture({ branches: 10 });
  await assert.rejects(
    () => runCandidatePlanPreflight({ env: f.env, fetchImpl: f.fetchImpl }),
    /NEON_BRANCH_CAPACITY_EXHAUSTED:10\/10/
  );
});

test('candidate plan preflight blocks a non-primary or non-ready parent branch', async () => {
  const f = fixture();
  const original = f.fetchImpl;
  f.fetchImpl = async (url, options) => {
    const result = await original(url, options);
    if (url.endsWith('/branches')) {
      const body = JSON.parse(await result.text());
      body.branches[0].primary = false;
      return response(200, body);
    }
    return result;
  };
  await assert.rejects(
    () => runCandidatePlanPreflight({ env: f.env, fetchImpl: f.fetchImpl }),
    /NEON_PRIMARY_BRANCH_NOT_READY_OR_NOT_PRIMARY/
  );
});

test('candidate plan preflight blocks a primary branch at its logical size limit', async () => {
  const f = fixture({ logicalSize: 1073741824 });
  await assert.rejects(
    () => runCandidatePlanPreflight({ env: f.env, fetchImpl: f.fetchImpl }),
    /NEON_PRIMARY_BRANCH_LOGICAL_SIZE_NOT_ELIGIBLE/
  );
});

test('candidate plan preflight accepts Neon Launch only when Primary is actually protected', async () => {
  const f = fixture({ neonPlan: 'launch', primaryProtected: true });
  const result = await runCandidatePlanPreflight({ env: f.env, fetchImpl: f.fetchImpl });
  assert.equal(result.status, 'PASS');
  assert.equal(result.neonPlan, 'launch');
  assert.equal(result.neonPrimaryBranchProtected, true);
  assert.equal(f.calls.some(call => call.url.endsWith('/branches')), true);
});

test('candidate plan preflight rejects Neon Launch when Primary protection is not active', async () => {
  const f = fixture({ neonPlan: 'launch', primaryProtected: false });
  await assert.rejects(
    () => runCandidatePlanPreflight({ env: f.env, fetchImpl: f.fetchImpl }),
    /NEON_PRIMARY_BRANCH_NOT_PROTECTED/
  );
  assert.equal(f.calls.some(call => call.url.endsWith('/branches')), true);
});

test('candidate plan preflight rejects an unprotected Neon Primary even on an eligible plan', async () => {
  const f = fixture({ primaryProtected: false });
  await assert.rejects(
    () => runCandidatePlanPreflight({ env: f.env, fetchImpl: f.fetchImpl }),
    /NEON_PRIMARY_BRANCH_NOT_PROTECTED/
  );
});
