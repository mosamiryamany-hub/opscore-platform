'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.resolve(__dirname, '..', '..');
const backend = path.join(root, 'backend');
const mobile = path.join(root, 'mobile');

function check(name, fn) {
  try { return { name, status: fn() ? 'PASS' : 'FAIL' }; }
  catch (error) { return { name, status: 'FAIL', detail: error.message }; }
}

const checks = [];
const backendPackage = require(path.join(backend, 'package.json'));
const backendLock = require(path.join(backend, 'package-lock.json'));
checks.push(check('Node.js version satisfies the exact release engine range', () => {
  const [major, minor, patch] = process.versions.node.split('.').map(Number);
  return major === 22 && (minor > 23 || (minor === 23 && patch >= 4));
}));
checks.push(check('Backend package declares the exact supported Node range', () =>
  backendPackage.engines?.node === '>=22.23.4 <23'
));
checks.push(check('PostgreSQL driver is a pinned direct dependency and matches the lockfile', () =>
  backendPackage.dependencies?.pg === '8.23.1' &&
  backendLock.packages?.['']?.dependencies?.pg === '8.23.1' &&
  backendLock.packages?.['node_modules/pg']?.version === '8.23.1'
));
checks.push(check('Backend package.json', () => fs.existsSync(path.join(backend, 'package.json'))));
checks.push(check('Backend lockfile', () => fs.existsSync(path.join(backend, 'package-lock.json'))));
checks.push(check('Mobile package.json', () => fs.existsSync(path.join(mobile, 'package.json'))));
checks.push(check('Mobile lockfile', () => fs.existsSync(path.join(mobile, 'package-lock.json')) || fs.existsSync(path.join(mobile, 'yarn.lock'))));
checks.push(check('No runtime attachment store in release', () => !fs.existsSync(path.join(backend, 'data', 'files')) || fs.readdirSync(path.join(backend, 'data', 'files')).length === 0));

let npmVersion = null;
try { npmVersion = execFileSync('npm', ['--version'], { encoding: 'utf8' }).trim(); } catch {}

const result = {
  release: require(path.join(backend, 'package.json')).version,
  currentRelease: require(path.join(backend, 'package.json')).version,
  generatedAt: new Date().toISOString(),
  node: process.version,
  npm: npmVersion,
  checks,
  status: checks.every(c => c.status === 'PASS') ? 'PASS' : 'REVIEW_REQUIRED',
  scope: 'Local source/package preflight only; does not certify production infrastructure, PostgreSQL, OIDC/JWKS, TLS, external providers, or mobile store signing.'
};

const out = path.join(root, 'docs', 'BUYER_INSTALLATION_VERIFICATION.json');
fs.writeFileSync(out, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
process.exitCode = result.status === 'PASS' ? 0 : 1;
