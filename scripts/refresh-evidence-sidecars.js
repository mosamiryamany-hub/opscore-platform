#!/usr/bin/env node
// Some verification evidence is regenerated inside the release run itself
// (backend regression suite, forensic language audit, recovery gate). The
// committed .sha256 sidecars then describe the previous bytes, so the
// artifact gate fails closed on the exact tree being released.
// This rebinds ONLY the named sidecars to the bytes just produced. Every
// other sidecar stays untouched and still has to match its target.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const dir = path.resolve(__dirname, '..', 'backend', 'docs', 'verification');
const targets = process.argv.slice(2);
if (targets.length === 0) throw new Error('NO_SIDECAR_TARGETS');

for (const name of targets) {
  if (!/^[A-Za-z0-9_.-]+$/.test(name)) throw new Error('INVALID_SIDECAR_NAME:' + name);
  const targetPath = path.join(dir, name + '.json');
  const sidecarPath = path.join(dir, name + '.sha256');
  if (!fs.existsSync(targetPath)) throw new Error('SIDECAR_TARGET_MISSING:' + name);
  const digest = crypto.createHash('sha256').update(fs.readFileSync(targetPath)).digest('hex');
  fs.writeFileSync(sidecarPath, `${digest}  ${name}.json\n`);
  console.log(`SIDECAR_REBOUND ${name}.sha256 -> ${digest}`);
}
