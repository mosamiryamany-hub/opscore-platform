'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeBranding, loadBranding } = require('../src/branding-config');

test('buyer branding configuration is normalized to a strict public allowlist', () => {
  const value = normalizeBranding({
    platformName: 'Buyer Operations',
    tagline: 'Operate with evidence',
    logoPath: '/brand/logo.svg',
    primaryColor: '#123ABC',
    supportEmail: 'help@example.com',
    supportUrl: 'https://support.example.com/',
    welcomeText: 'Welcome'
  });
  assert.deepEqual(Object.keys(value).sort(), [
    'logoPath', 'platformName', 'primaryColor', 'schemaVersion',
    'supportEmail', 'supportUrl', 'tagline', 'welcomeText'
  ].sort());
  assert.equal(value.primaryColor, '#123ABC');
  assert.equal(value.schemaVersion, 'opscore.branding.v1');
});

test('branding rejects unsafe paths, arbitrary CSS and non-HTTPS support links', () => {
  const base = {
    platformName: 'Buyer', tagline: '', logoPath: '/logo.svg',
    primaryColor: '#123456', supportEmail: '', supportUrl: '', welcomeText: ''
  };
  assert.throws(() => normalizeBranding({ ...base, logoPath: '/../secret' }), /BRANDING_LOGO_PATH_INVALID/);
  assert.throws(() => normalizeBranding({ ...base, logoPath: '//cdn.example.com/logo.svg' }), /BRANDING_LOGO_PATH_INVALID/);
  assert.throws(() => normalizeBranding({ ...base, primaryColor: 'url(javascript:alert(1))' }), /BRANDING_PRIMARY_COLOR_INVALID/);
  assert.throws(() => normalizeBranding({ ...base, supportUrl: 'http://support.example.com' }), /BRANDING_SUPPORT_URL_INVALID/);
});

test('repository branding config is readable and schema-versioned', () => {
  const value = loadBranding();
  assert.equal(value.schemaVersion, 'opscore.branding.v1');
  assert.equal(value.platformName, 'OpsCore');
});
