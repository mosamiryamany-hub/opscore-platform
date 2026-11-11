#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const manifests = [
  { name: 'backend', dir: path.join(root, 'backend'), licenseFile: 'backend/LICENSE.txt' },
  { name: 'mobile', dir: path.join(root, 'mobile'), licenseFile: 'PROPRIETARY_LICENSE.txt' }
];

function readJson(p) { return JSON.parse(fs.readFileSync(p, 'utf8')); }
function packageNameFromNodeModulesPath(key) {
  const p = key.replace(/^node_modules\//, '');
  const parts = p.split('/node_modules/').pop().split('/');
  if (parts[0].startsWith('@')) return `${parts[0]}/${parts[1]}`;
  return parts[0];
}
function integrityToHash(integrity) {
  if (!integrity) return null;
  const values = String(integrity).split(/\s+/);
  const first = values.find(x => x.startsWith('sha512-')) || values.find(x => x.startsWith('sha256-'));
  if (!first) return null;
  const [alg, b64] = first.split('-', 2);
  if (!b64) return null;
  try {
    const normalized = b64.replace(/-/g, '+').replace(/_/g, '/');
    const hex = Buffer.from(normalized, 'base64').toString('hex');
    if (!hex) return null;
    return { algorithm: alg.toUpperCase(), hash: hex };
  } catch { return null; }
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
function encodePurlName(name) {
  return name.split('/').map(encodeURIComponent).join('/');
}
function purl(name, version) {
  return `pkg:npm/${encodePurlName(name)}@${encodeURIComponent(version)}`;
}
function sourceArchiveHash(prefix) {
  const archive = execFileSync('git', ['archive', '--format=tar', 'HEAD', prefix], {
    cwd: root,
    maxBuffer: 128 * 1024 * 1024
  });
  return crypto.createHash('sha256').update(archive).digest('hex');
}
function componentFromEntry(key, entry, source) {
  const name = entry.name || packageNameFromNodeModulesPath(key);
  const version = entry.version;
  if (!name || !version || !key.startsWith('node_modules/')) return null;
  const comp = {
    type: 'library',
    'bom-ref': purl(name, version),
    name,
    version,
    purl: purl(name, version),
    properties: [
      { name: 'opscore:source-lockfile', value: source },
      { name: 'opscore:lock-path', value: key }
    ]
  };
  const licenses = licenseNames(entry.license);
  if (licenses.length) comp.licenses = licenses.map(name => ({ license: { name } }));
  const hash = integrityToHash(entry.integrity);
  if (hash) comp.hashes = [{ alg: hash.algorithm, content: hash.hash }];
  if (entry.resolved) comp.externalReferences = [{ type: 'distribution', url: entry.resolved }];
  return comp;
}

const components = new Map();
const dependencies = new Map();
const rootMetadata = [];
const lockEntries = new Map();
for (const manifest of manifests) {
  const lockPath = path.join(manifest.dir, 'package-lock.json');
  const pkgPath = path.join(manifest.dir, 'package.json');
  const lock = readJson(lockPath);
  const pkg = readJson(pkgPath);
  rootMetadata.push({ name: pkg.name, version: pkg.version, lockfile: path.relative(root, lockPath) });
  for (const [key, entry] of Object.entries(lock.packages || {})) {
    const component = componentFromEntry(key, entry, path.relative(root, lockPath));
    if (!component) continue;
    components.set(component['bom-ref'], component);
    lockEntries.set(component['bom-ref'], { entry, source: path.relative(root, lockPath), key });
    const depRefs = [];
    for (const depName of Object.keys(entry.dependencies || {})) {
      const candidates = [];
      let cursor = key;
      while (true) {
        const base = cursor.replace(/^node_modules\//, '');
        const candidateKey = `${base}/node_modules/${depName}`.replace(/^\.\//, '');
        if (lock.packages?.[candidateKey]?.version) candidates.push(candidateKey);
        if (!cursor.includes('/node_modules/')) break;
        cursor = cursor.slice(0, cursor.lastIndexOf('/node_modules/'));
      }
      const top = `node_modules/${depName}`;
      if (lock.packages?.[top]?.version) candidates.push(top);
      const resolvedKey = candidates.find(key => lock.packages?.[key]?.version);
      if (resolvedKey) {
        const resolved = lock.packages[resolvedKey];
        const resolvedName = resolved.name || packageNameFromNodeModulesPath(resolvedKey);
        depRefs.push(purl(resolvedName, resolved.version));
      }
    }
    if (depRefs.length) dependencies.set(component['bom-ref'], Array.from(new Set(depRefs)).sort());
  }
}

const lockDigest = crypto.createHash('sha256').update(
  manifests.map(manifest => fs.readFileSync(path.join(manifest.dir, 'package-lock.json'))).join('\n')
).digest('hex');
const serial = `urn:uuid:${lockDigest.slice(0,8)}-${lockDigest.slice(8,12)}-4${lockDigest.slice(13,16)}-${((parseInt(lockDigest.slice(16,18),16)&0x3f)|0x80).toString(16).padStart(2,'0')}${lockDigest.slice(18,20)}-${lockDigest.slice(20,32)}`;
const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const sourceHashes = {
  repository: sourceArchiveHash('.'),
  backend: sourceArchiveHash('backend'),
  mobile: sourceArchiveHash('mobile')
};
const proprietaryLicenseName = 'OpsCore Use-Only Source License';

for (const manifest of manifests) {
  const pkg = readJson(path.join(manifest.dir, 'package.json'));
  const lock = readJson(path.join(manifest.dir, 'package-lock.json'));
  const rootRef = purl(pkg.name, pkg.version);
  const refs = [];
  for (const depName of Object.keys(pkg.dependencies || {})) {
    const key = `node_modules/${depName}`;
    const entry = lock.packages?.[key];
    if (entry?.version) refs.push(purl(entry.name || depName, entry.version));
  }
  dependencies.set(rootRef, Array.from(new Set(refs)).sort());
  components.set(rootRef, {
    type: 'application',
    'bom-ref': rootRef,
    name: pkg.name,
    version: pkg.version,
    purl: rootRef,
    hashes: [{ alg: 'SHA-256', content: sourceHashes[manifest.name] }],
    licenses: [{ license: { name: proprietaryLicenseName } }],
    properties: [
      { name: 'opscore:source-manifest', value: path.relative(root, path.join(manifest.dir, 'package.json')) },
      { name: 'opscore:source-archive-sha256-scope', value: manifest.name },
      { name: 'opscore:license-file', value: manifest.licenseFile }
    ]
  });
}

const backendPackage = readJson(path.join(root, 'backend', 'package.json'));
const bom = {
  bomFormat: 'CycloneDX',
  specVersion: '1.7',
  serialNumber: serial,
  version: 1,
  metadata: {
    timestamp: new Date().toISOString(),
    authors: [{ name: 'OpsCore Release Engineering' }],
    tools: [{ vendor: 'OpsCore', name: 'opscore-sbom-generator', version: '1.1.0' }],
    lifecycles: [{ phase: 'build' }],
    component: {
      type: 'application',
      name: 'OpsCore',
      version: backendPackage.version,
      hashes: [{ alg: 'SHA-256', content: sourceHashes.repository }],
      licenses: [{ license: { name: proprietaryLicenseName } }]
    },
    properties: [
      { name: 'opscore:generation-context', value: 'GitHub Actions exact-head secure-release workflow' },
      { name: 'opscore:source-commit', value: sourceCommit },
      { name: 'opscore:lockfiles-sha256', value: lockDigest },
      ...rootMetadata.flatMap(item => [
        { name: 'opscore:lockfile', value: item.lockfile },
        { name: `opscore:manifest:${item.name}:version`, value: item.version }
      ])
    ]
  },
  components: Array.from(components.values()).sort((a,b) => a['bom-ref'].localeCompare(b['bom-ref'])),
  dependencies: Array.from(dependencies.entries()).map(([ref, deps]) => ({ ref, dependsOn: deps })).sort((a,b) => a.ref.localeCompare(b.ref))
};

const out = path.join(root, 'docs', 'sbom', `opscore-v${bom.metadata.component.version}.cyclonedx.json`);
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(bom, null, 2) + '\n');
const summary = {
  schemaVersion: 'opscore.sbom.gate.v2',
  status: bom.components.length > 0 ? 'PASS' : 'FAIL',
  format: 'CycloneDX 1.7',
  components: bom.components.length,
  dependenciesWithEdges: bom.dependencies.length,
  sourceCommit,
  lockfilesSha256: lockDigest,
  applicationSourceHashes: sourceHashes,
  generatedAt: bom.metadata.timestamp,
  output: path.relative(root, out),
  note: 'Generated from committed npm lockfiles and deterministic git source archives. This is an inventory/provenance input, not a vulnerability verdict.'
};
fs.writeFileSync(path.join(root, 'docs', 'sbom', 'SBOM_GENERATION_RESULT.json'), JSON.stringify(summary, null, 2) + '\n');
console.log(JSON.stringify(summary, null, 2));
process.exitCode = summary.status === 'PASS' ? 0 : 1;
