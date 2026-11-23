'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  classifyLegalResponse,
  verifyDeploymentIdentity,
  finalizeLegalClassifications,
  TARGETS
} = require('./production-public-route-diagnostic');

test('inventory is limited to the public homepage, six legal pages and five read-only GET endpoints', () => {
  assert.equal(TARGETS.length, 12);
  assert.equal(TARGETS.filter(row => row.kind === 'legal-page').length, 6);
  assert.equal(TARGETS.filter(row => row.kind === 'read-only-api').length, 5);
  assert.ok(TARGETS.every(row => row.expected === 'html' || row.expected === 'json'));
});

test('a reachable legal scaffold remains explicitly unapproved', () => {
  assert.equal(classifyLegalResponse({
    statusCode: 200,
    contentType: 'text/html; charset=utf-8',
    body: '<h1>Terms</h1><p>OWNER DATA REQUIRED</p>'
  }), 'REACHABLE_OWNER_DATA_REQUIRED');
});

test('a successful homepage fallback is not counted as a legal page', () => {
  assert.equal(classifyLegalResponse({
    statusCode: 200,
    contentType: 'text/html',
    body: '',
    bodySha256: 'same',
    homepageSha256: 'same'
  }), 'SUSPECTED_HOMEPAGE_FALLBACK');
});

test('non-200 legal routes remain non-200 even when served as HTML', () => {
  assert.equal(classifyLegalResponse({
    statusCode: 503,
    contentType: 'text/html',
    body: 'maintenance'
  }), 'HTTP_NON_200');
});

test('deployment identity must match the pinned production source and deployment', () => {
  const payload = {
    status: 'identified',
    source: { commitSha: '8011bc5550372a318dbf47bf89e6837059987f58', ref: 'main' },
    deployment: { id: 'dpl_6r4ZCJiuVHonja32AXhsjwMSDoig', environment: 'production' }
  };
  assert.equal(verifyDeploymentIdentity(payload).matches, true);
  assert.equal(verifyDeploymentIdentity({
    ...payload,
    deployment: { ...payload.deployment, id: 'dpl_wrong' }
  }).matches, false);
});

test('legal-page results keep placeholder, fallback and approval classifications distinct', () => {
  const rows = [
    { path: '/', kind: 'homepage', statusCode: 200, responseSha256: 'home' },
    { path: '/terms.html', kind: 'legal-page', statusCode: 200, responseSha256: 'terms', contentType: 'text/html', ownerDataRequiredMarkerFound: true },
    { path: '/privacy.html', kind: 'legal-page', statusCode: 200, responseSha256: 'home', contentType: 'text/html', ownerDataRequiredMarkerFound: false },
    { path: '/refund.html', kind: 'legal-page', statusCode: 200, responseSha256: 'refund', contentType: 'text/html', ownerDataRequiredMarkerFound: false }
  ];
  finalizeLegalClassifications(rows);
  assert.equal(rows[1].classification, 'REACHABLE_OWNER_DATA_REQUIRED');
  assert.equal(rows[2].classification, 'SUSPECTED_HOMEPAGE_FALLBACK');
  assert.equal(rows[3].classification, 'REACHABLE_CONTENT_APPROVAL_NOT_ASSESSED');
});
