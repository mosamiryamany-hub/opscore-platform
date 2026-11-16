'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repositoryRoot = path.resolve(__dirname, '..', '..');
const vercelConfig = JSON.parse(
  fs.readFileSync(path.join(repositoryRoot, 'vercel.json'), 'utf8')
);

test('Vercel Git deploys remain disabled for main but enabled for non-production branches by default', () => {
  assert.deepEqual(vercelConfig.git && vercelConfig.git.deploymentEnabled, {
    main: false
  });
  assert.equal(vercelConfig.github, undefined);
});
