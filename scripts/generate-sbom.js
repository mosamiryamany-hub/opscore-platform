#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const root = path.resolve(__dirname, '..');
const manifests = [
  { name: 'backend', dir: path.join(root, 'backend') },
  { name: 'mobile', dir: path.join(root, 'mobile') }
];

function readJson(p) { return JSON.parse(fs.readFileSync(p, 'utf8')); }
function packageNameFromNodeModulesPath(key) {
  let p = key.replace(/^node_modules\//, '');
  const parts = p.split('/node_modules/').pop().split('/');
  if (parts[0].startsWith('@')) return `${parts[0]}/${parts[1]}`;
  return parts[0];
}
function integrityToHash(integrity) {
  if (!integrity) return null;
  const first = String(integrity).split(/\s+/).find(x => x.startsWith('sha512-')) || String(integrity).split(/\s+/).find(x => x.startsWith('sha256-'));
  if (!first) return null;
  const [alg, b64] = first.split('-', 2);
  if (!b64) return null;
  try {
    const normalized = b64.replace(/-/g, '+').replace(/_/g, '/');
    const hex = Buffer.from(normalized, 'base64').toString('hex');
    return { algorithm: alg.toUpperCase(), hash: hex };
  } catch { return null; }
}
function encodePurlName(name) {
  return name.split('/').map(encodeURIComponent).join('/');
}
function purl(name, version) {
  return `pkg:npm/${encodePurlName(name)}@${encodeURIComponent(version)}`;
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
  if (entry.license) comp.licenses = [{ license: { name: String(entry.license) } }];
  const h = integrityToHash(entry.integrity);
  if (h) comp.hashes = [{ alg: h.algorithm, content: h.hash }];
  if (entry.resolved) comp.externalReferences = [{ type: 'distribution', url: entry.resolved }];
  return comp;
}

const components = new Map();
const dependencies = new Map();
const rootMetadata = [];
for (const m of manifests) {
  const lockPath = path.join(m.dir, 'package-lock.json');
  const pkgPath = path.join(m.dir, 'package.json');
  const lock = readJson(lockPath);
  const pkg = readJson(pkgPath);
  rootMetadata.push({ name: pkg.name, version: pkg.version, lockfile: path.relative(root, lockPath) });
  for (const [key, entry] of Object.entries(lock.packages || {})) {
    const c = componentFromEntry(key, entry, path.relative(root, lockPath));
    if (!c) continue;
    components.set(c['bom-ref'], c);
    const depRefs = [];
    for (const depName of Object.keys(entry.dependencies || {})) {
      // Dependency edges are resolved through npm package-lock nested placement when possible.
      // We emit only the resolved package occurrence available in the lock tree.
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
      const resolvedKey = candidates.find(k => lock.packages?.[k]?.version);
      if (resolvedKey) {
        const resolved = lock.packages[resolvedKey];
        const rn = resolved.name || packageNameFromNodeModulesPath(resolvedKey);
        depRefs.push(purl(rn, resolved.version));
      }
    }
    if (depRefs.length) dependencies.set(c['bom-ref'], Array.from(new Set(depRefs)).sort());
  }
}

const lockDigest = crypto.createHash('sha256').update(
  manifests.map(m => fs.readFileSync(path.join(m.dir, 'package-lock.json'))).join('\n')
).digest('hex');
const serial = `urn:uuid:${lockDigest.slice(0,8)}-${lockDigest.slice(8,12)}-4${lockDigest.slice(13,16)}-${((parseInt(lockDigest.slice(16,18),16)&0x3f)|0x80).toString(16).padStart(2,'0')}${lockDigest.slice(18,20)}-${lockDigest.slice(20,32)}`;
for (const m of manifests) {
  const pkg = readJson(path.join(m.dir, 'package.json'));
  const rootRef = `pkg:npm/${encodePurlName(pkg.name)}@${encodeURIComponent(pkg.version)}`;
  const lock = readJson(path.join(m.dir, 'package-lock.json'));
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
    properties: [{ name: 'opscore:source-manifest', value: path.relative(root, path.join(m.dir, 'package.json')) }]
  });
}

const bom = {
  bomFormat: 'CycloneDX',
  specVersion: '1.6',
  serialNumber: serial,
  version: 1,
  metadata: {
    tools: [{ vendor: 'OpsCore', name: 'opscore-sbom-generator', version: '1.0.0' }],
    component: {
      type: 'application',
      name: 'OpsCore',
      version: readJson(path.join(root, 'backend', 'package.json')).version
    },
    properties: rootMetadata.flatMap(x => [
      { name: 'opscore:lockfile', value: x.lockfile },
      { name: `opscore:manifest:${x.name}:version`, value: x.version }
    ])
  },
  components: Array.from(components.values()).sort((a,b) => a['bom-ref'].localeCompare(b['bom-ref'])),
  dependencies: Array.from(dependencies.entries()).map(([ref, deps]) => ({ ref, dependsOn: deps })).sort((a,b) => a.ref.localeCompare(b.ref))
};

const out = path.join(root, 'docs', 'sbom', `opscore-v${bom.metadata.component.version}.cyclonedx.json`);
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(bom, null, 2) + '\n');
const summary = {
  schemaVersion: 'opscore.sbom.gate.v1',
  status: bom.components.length > 0 ? 'PASS' : 'FAIL',
  format: 'CycloneDX 1.6',
  components: bom.components.length,
  dependenciesWithEdges: bom.dependencies.length,
  sourceLockfiles: rootMetadata.map(x => x.lockfile),
  output: path.relative(root, out),
  note: 'Generated from committed npm package-lock.json files. This is an inventory/provenance input, not a vulnerability verdict.'
};
fs.writeFileSync(path.join(root, 'docs', 'sbom', 'SBOM_GENERATION_RESULT.json'), JSON.stringify(summary, null, 2) + '\n');
console.log(JSON.stringify(summary, null, 2));
process.exitCode = summary.status === 'PASS' ? 0 : 1;
