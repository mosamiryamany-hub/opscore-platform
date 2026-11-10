#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
function readJson(p) { return JSON.parse(fs.readFileSync(p, 'utf8')); }
function purl(name, version) { return `pkg:npm/${name.split('/').map(encodeURIComponent).join('/')}@${encodeURIComponent(version)}`; }
const pkgFiles = [path.join(root,'backend','package.json'), path.join(root,'mobile','package.json')];
const lockFiles = [path.join(root,'backend','package-lock.json'), path.join(root,'mobile','package-lock.json')];
const bomPath = path.join(root,'docs','sbom',`opscore-v${readJson(pkgFiles[0]).version}.cyclonedx.json`);
let fail = 0;
function check(name, ok, detail='') { console.log(`${ok?'PASS':'FAIL'} ${name}${detail?` — ${detail}`:''}`); if(!ok) fail++; }
check('SBOM exists', fs.existsSync(bomPath));
if (!fs.existsSync(bomPath)) process.exit(1);
const bom = readJson(bomPath);
check('CycloneDX 1.6', bom.bomFormat === 'CycloneDX' && bom.specVersion === '1.6');
check('SBOM serial present', /^urn:uuid:[0-9a-f-]{36}$/.test(bom.serialNumber));
const refs = new Set((bom.components||[]).map(c=>c['bom-ref']));
check('SBOM component refs unique', refs.size === (bom.components||[]).length);
for (const pf of pkgFiles) {
  const pkg = readJson(pf);
  const ref = purl(pkg.name, pkg.version);
  check(`manifest represented: ${pkg.name}`, refs.has(ref), ref);
  const lock = readJson(lockFiles[pkg.name === 'opscore-mobile' ? 1 : 0]);
  for (const [name, range] of Object.entries(pkg.dependencies||{})) {
    const entry = lock.packages?.[`node_modules/${name}`];
    check(`locked direct dependency: ${pkg.name}/${name}`, !!entry?.version, `range=${range}`);
    if (entry?.version) check(`SBOM direct dependency: ${pkg.name}/${name}`, refs.has(purl(entry.name||name, entry.version)), purl(entry.name||name, entry.version));
  }
}
// Recompute the deterministic SBOM serial derivation source to prevent a stale SBOM from passing.
const lockDigest = crypto.createHash('sha256').update(lockFiles.map(f=>fs.readFileSync(f)).join('\n')).digest('hex');
const serial = `urn:uuid:${lockDigest.slice(0,8)}-${lockDigest.slice(8,12)}-4${lockDigest.slice(13,16)}-${((parseInt(lockDigest.slice(16,18),16)&0x3f)|0x80).toString(16).padStart(2,'0')}${lockDigest.slice(18,20)}-${lockDigest.slice(20,32)}`;
check('SBOM deterministic serial matches lockfiles', bom.serialNumber === serial);
process.exitCode = fail ? 1 : 0;
