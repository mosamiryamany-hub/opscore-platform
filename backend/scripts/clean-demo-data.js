const fs = require('node:fs');
const path = require('node:path');
const backendRoot = path.resolve(__dirname, '..');
const repositoryRoots = [
  path.join(backendRoot, 'data', 'files'),
  path.resolve(backendRoot, '..', 'data', 'files')
];
if (process.env.NODE_ENV === 'production')
  throw new Error('DEMO_DATA_CLEANUP_BLOCKED_IN_PRODUCTION');
const confirmed = process.env.OPSC_DEMO_CLEANUP === 'CONFIRM' || process.argv.includes('--confirm');
if (!confirmed)
  throw new Error('DEMO_DATA_CLEANUP_REQUIRES_CONFIRM');
let removed = false;
for (const dir of repositoryRoots) {
  if (!fs.existsSync(dir)) continue;
  removed = true;
  for (const entry of fs.readdirSync(dir)) {
    fs.rmSync(path.join(dir, entry), { recursive: true, force: true });
  }
  if (fs.existsSync(dir) && fs.readdirSync(dir).length > 0) throw new Error(`DEMO_DATA_CLEANUP_INCOMPLETE:${dir}`);
  fs.rmSync(dir, { recursive: true, force: true });
}
console.log(removed ? 'PASS backend demo attachment data removed' : 'PASS backend demo attachment directory absent');
