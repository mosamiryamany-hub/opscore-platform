#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function purl(name, version) { return `pkg:npm/${name.split('/').map(encodeURIComponent).join('/')}@${encodeURIComponent(version)}`; }
function integrityToHash(integrity) {
  if (!integrity) return null;
  const values = String(integrity).split(/\s+/);
  const first = values.find(value => value.startsWith('sha512-')) || values.find(value => value.startsWith('sha256-'));
  if (!first) return null;
  const [algorithm, encoded] = first.split('-', 2);
  if (!encoded) return null;
  const normalized = encoded.replace(/-/g, '+').replace(/_/g, '/');
  const content = Buffer.from(normalized, 'base64').toString('hex');
  return content ? { alg: algorithm.toLowerCase() === 'sha512' ? 'SHA-512' : 'SHA-256', content } : null;
}
function licenseNames(value) {
  if (typeof value === 'string' && value.trim()) return [value.trim()];
  if (Array.isArray(value)) return value.flatMap(licenseNames);
  if (value && typeof value === 'object') {
    if (typeof value.name === 'string' && value.name.trim()) return [value.name.trim()];
    if (typeof value.type === 'string' && value.type.trim()) return [value.type.trim()];
    if (typeof value.license === 'string' && value.license.trim()) return [value.license.trim()];
  }
  return [];
}
function packageNameFromNodeModulesPath(key) {
  const parts = key.replace(/^node_modules\//, '').split('/node_modules/').pop().split('/');
  if (parts[0].startsWith('@')) return `${parts[0]}/${parts[1]}`;
  return parts[0];
}
function sourceArchiveHash(prefix) {
  const args = ['archive', '--format=tar', 'HEAD'];
  if (prefix) args.push(prefix);
  else args.push('.', ':(exclude)docs/sbom/**');
  const archive = execFileSync('git', args, { cwd: root, maxBuffer: 128 * 1024 * 1024 });
  return crypto.createHash('sha256').update(archive).digest('hex');
}
function componentHash(component, expected) {
  return (component.hashes || []).some(hash =>
    String(hash.alg).toUpperCase() === expected.alg &&
    String(hash.content).toLowerCase() === expected.content.toLowerCase()
  );
}
function componentLicenses(component) {
  return (component.licenses || []).flatMap(item => {
    const license = item && item.license;
    if (!license) return [];
    if (typeof license.name === 'string') return [license.name];
    if (typeof license.id === 'string') return [license.id];
    if (typeof license.expression === 'string') return [license.expression];
    return [];
  });
}

const pkgFiles = [path.join(root, 'backend', 'package.json'), path.join(root, 'mobile', 'package.json')];
const lockFiles = [path.join(root, 'backend', 'package-lock.json'), path.join(root, 'mobile', 'package-lock.json')];
const packages = pkgFiles.map(readJson);
const bomPath = path.join(root, 'docs', 'sbom', `opscore-v${packages[0].version}.cyclonedx.json`);
let failures = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}
check('SBOM exists', fs.existsSync(bomPath));
if (!fs.existsSync(bomPath)) process.exit(1);

const bom = readJson(bomPath);
check('CycloneDX 1.7', bom.bomFormat === 'CycloneDX' && bom.specVersion === '1.7');
check('SBOM serial present', /^urn:uuid:[0-9a-f-]{36}$/.test(String(bom.serialNumber || '')));
const timestamp = Date.parse(bom.metadata?.timestamp || '');
check('SBOM generation timestamp', Number.isFinite(timestamp) && timestamp > 0);
check('SBOM author identified', Array.isArray(bom.metadata?.authors) && bom.metadata.authors.some(author => typeof author.name === 'string' && author.name.trim()));
check('SBOM generation tool identified', Array.isArray(bom.metadata?.tools) && bom.metadata.tools.some(tool => tool.vendor && tool.name && tool.version));
check('SBOM lifecycle recorded', Array.isArray(bom.metadata?.lifecycles) && bom.metadata.lifecycles.some(item => item.phase === 'build'));

const metadataProperties = new Map((bom.metadata?.properties || []).map(property => [property.name, property.value]));
const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
check('SBOM source commit bound', metadataProperties.get('opscore:source-commit') === sourceCommit);
const lockDigest = crypto.createHash('sha256').update(lockFiles.map(file => fs.readFileSync(file)).join('\n')).digest('hex');
check('SBOM lockfile digest bound', metadataProperties.get('opscore:lockfiles-sha256') === lockDigest);
const generationContext = metadataProperties.get('opscore:generation-context');
check('SBOM generation context recorded', typeof generationContext === 'string' && generationContext.trim().length > 0);
if (process.env.GITHUB_ACTIONS === 'true') {
  check('SBOM workflow context matches runner', generationContext === `GitHub Actions workflow: ${process.env.GITHUB_WORKFLOW}`);
  check('SBOM workflow run ID matches runner', metadataProperties.get('opscore:workflow-run-id') === String(process.env.GITHUB_RUN_ID));
  check('SBOM workflow ref matches runner', metadataProperties.get('opscore:workflow-ref') === String(process.env.GITHUB_REF));
}
check('SBOM source archive scope recorded', metadataProperties.get('opscore:source-archive-scope') === 'git archive HEAD excluding generated docs/sbom outputs');

const components = bom.components || [];
const componentByRef = new Map(components.map(component => [component['bom-ref'], component]));
check('SBOM component refs unique', componentByRef.size === components.length);
check('All component refs present', components.every(component => typeof component['bom-ref'] === 'string' && component['bom-ref'].length > 0));

const expectedRepoHash = { alg: 'SHA-256', content: sourceArchiveHash() };
check('BOM root component source hash', componentHash(bom.metadata?.component || {}, expectedRepoHash));
check('BOM root component license', componentLicenses(bom.metadata?.component || {}).includes('OpsCore Use-Only Source License'));
const expectedAppHashes = {
  backend: { alg: 'SHA-256', content: sourceArchiveHash('backend') },
  mobile: { alg: 'SHA-256', content: sourceArchiveHash('mobile') }
};
const proprietaryLicenseName = 'OpsCore Use-Only Source License';

for (let i = 0; i < packages.length; i++) {
  const pkg = packages[i];
  const manifestName = pkg.name;
  const rootRef = purl(pkg.name, pkg.version);
  const component = componentByRef.get(rootRef);
  check(`manifest represented: ${manifestName}`, Boolean(component), rootRef);
  if (!component) continue;
  check(`application source hash: ${manifestName}`, componentHash(component, expectedAppHashes[i === 0 ? 'backend' : 'mobile']));
  check(`application license: ${manifestName}`, componentLicenses(component).includes(proprietaryLicenseName));
  const lock = readJson(lockFiles[i]);
  for (const [key, entry] of Object.entries(lock.packages || {})) {
    if (!key.startsWith('node_modules/') || !entry.version) continue;
    const name = entry.name || packageNameFromNodeModulesPath(key);
    const ref = purl(name, entry.version);
    const sbomComponent = componentByRef.get(ref);
    check(`locked component present: ${manifestName}/${name}@${entry.version}`, Boolean(sbomComponent));
    if (!sbomComponent) continue;
    const expectedHash = integrityToHash(entry.integrity);
    check(`component integrity hash: ${manifestName}/${name}@${entry.version}`, Boolean(expectedHash && componentHash(sbomComponent, expectedHash)));
    const expectedLicenses = licenseNames(entry.license);
    check(`component license metadata: ${manifestName}/${name}@${entry.version}`, expectedLicenses.length > 0 && expectedLicenses.every(name => componentLicenses(sbomComponent).includes(name)));
  }
}

for (const component of components) {
  if (component.type === 'library') {
    check(`library hash present: ${component.name}@${component.version}`, Array.isArray(component.hashes) && component.hashes.length > 0);
    check(`library license present: ${component.name}@${component.version}`, componentLicenses(component).length > 0);
  }
}
const refs = new Set(components.map(component => component['bom-ref']));
for (const dependency of bom.dependencies || []) {
  check(`dependency source present: ${dependency.ref}`, refs.has(dependency.ref));
  for (const target of dependency.dependsOn || []) check(`dependency target present: ${target}`, refs.has(target));
}
const serial = `urn:uuid:${lockDigest.slice(0,8)}-${lockDigest.slice(8,12)}-4${lockDigest.slice(13,16)}-${((parseInt(lockDigest.slice(16,18),16)&0x3f)|0x80).toString(16).padStart(2,'0')}${lockDigest.slice(18,20)}-${lockDigest.slice(20,32)}`;
check('SBOM deterministic serial matches lockfiles', bom.serialNumber === serial);

const result = {
  schemaVersion: 'opscore.sbom.verification.v2',
  status: failures === 0 ? 'PASS' : 'FAIL',
  specVersion: bom.specVersion,
  components: components.length,
  failures
};
console.log(JSON.stringify(result, null, 2));
process.exitCode = failures ? 1 : 0;
