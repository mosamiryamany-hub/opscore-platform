'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { classifyHighCritical, ghsaFromUrl } = require('./audit-gate');

const GHSA = 'GHSA-abcd-efgh-ijkl';
const advisory = { url: 'https://github.com/advisories/' + GHSA, title: 'fixture advisory' };

test('mobile audit classifier recognizes GitHub advisory identifiers', () => {
  assert.equal(ghsaFromUrl(advisory.url), GHSA);
  assert.equal(ghsaFromUrl('https://example.invalid/no-advisory'), null);
});

test('full and production audit scopes independently fail on undocumented High/Critical findings', () => {
  const report = {
    vulnerabilities: {
      'mobile-runtime-fixture': {
        severity: 'high',
        range: '<1.0.0',
        via: [advisory]
      }
    }
  };
  const denied = new Set();
  const full = classifyHighCritical(report, denied, 'FULL_TREE');
  const production = classifyHighCritical(report, denied, 'PRODUCTION_TREE');
  assert.equal(full.accepted.length, 0);
  assert.equal(full.unaccepted.length, 1);
  assert.equal(full.unaccepted[0].scope, 'FULL_TREE');
  assert.equal(production.accepted.length, 0);
  assert.equal(production.unaccepted.length, 1);
  assert.equal(production.unaccepted[0].scope, 'PRODUCTION_TREE');
});

test('a currently allowlisted advisory is explicit in both audit scopes', () => {
  const report = {
    vulnerabilities: {
      'mobile-runtime-fixture': {
        severity: 'critical',
        via: [advisory]
      }
    }
  };
  const allowed = new Set([GHSA]);
  const full = classifyHighCritical(report, allowed, 'FULL_TREE');
  const production = classifyHighCritical(report, allowed, 'PRODUCTION_TREE');
  assert.equal(full.accepted.length, 1);
  assert.equal(full.unaccepted.length, 0);
  assert.equal(production.accepted.length, 1);
  assert.equal(production.unaccepted.length, 0);
});

test('an undocumented transitive root advisory fails closed', () => {
  const report = {
    vulnerabilities: {
      'top-level-fixture': {
        severity: 'high',
        via: ['transitive-fixture']
      },
      'transitive-fixture': {
        severity: 'high',
        via: [advisory]
      }
    }
  };
  const result = classifyHighCritical(report, new Set(), 'FULL_TREE');
  assert.equal(result.unaccepted.length, 2);
  assert.deepEqual(result.unaccepted.map(item => item.package).sort(), [
    'top-level-fixture', 'transitive-fixture'
  ]);
});

test('low and moderate findings do not get misclassified as High/Critical gates', () => {
  const report = {
    vulnerabilities: {
      low: { severity: 'low', via: [advisory] },
      moderate: { severity: 'moderate', via: [advisory] }
    }
  };
  const result = classifyHighCritical(report, new Set(), 'FULL_TREE');
  assert.deepEqual(result, { accepted: [], unaccepted: [] });
});

