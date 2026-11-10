const fs = require('node:fs'), path = require('node:path');
const root = path.resolve(__dirname, '..');
// The authoritative policy ships with the backend (backend/docs). Its currentFacingDocuments
// are paths relative to backend/, the same contract enforced by backend/scripts/verify.js.
const backend = path.join(root, 'backend');
const p = JSON.parse(fs.readFileSync(path.join(backend, 'docs', 'RELEASE_DOCUMENTATION_POLICY.json'), 'utf8'));
let fail = 0;
function c(n, o, d = '') {
  console.log(`${ o ? 'PASS' : 'FAIL' } ${ n }${ d ? ' \u2014 ' + d : '' }`);
  if (!o)
    fail++;
}
const current = new Set(p.currentFacingDocuments.map(e => (typeof e === 'string' ? e : e.path)));
for (const entry of p.currentFacingDocuments) {
  const f = typeof entry === 'string' ? entry : entry.path;
  const fp = path.join(backend, f);
  c(`current-facing exists: ${ f }`, fs.existsSync(fp));
  if (fs.existsSync(fp)) {
    const s = fs.readFileSync(fp, 'utf8');
    if (entry.requiredHeading) {
      c(`current-facing heading: ${ f }`, s.startsWith(entry.requiredHeading), entry.requiredHeading);
      continue;
    }
    c(`current-facing marker: ${ f }`, /\.json$/i.test(f) ? (() => {
      try {
        return JSON.parse(s).release === p.currentRelease || JSON.parse(s).currentRelease === p.currentRelease;
      } catch {
        return false;
      }
    })() : s.includes(`v${ p.currentRelease }`) || s.includes(`Release: v${ p.currentRelease }`));
  }
}
for (const f of fs.readdirSync(root).filter(x => fs.statSync(path.join(root, x)).isFile())) {
  if (!/\.(md|txt|json)$/i.test(f))
    continue;
  if (/^(INTEGRATED_|POSTGRES_PARITY_RESULT|MOBILE_RELEASE_PREFLIGHT|RELEASE_DOCUMENTATION_POLICY)/.test(f))
    continue;
  const upper = f.toUpperCase();
  const buyer = (p.buyerFacingNamePatterns || []).some(x => upper.includes(x));
  if (buyer)
    c(`root buyer document classified: ${ f }`, current.has(f), current.has(f) ? 'current-facing' : 'move to docs/history/');
}
function walk(d, rel = '') {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const r = rel ? path.posix.join(rel, e.name) : e.name;
    if (e.isDirectory()) {
      if (r === 'node_modules' || r === 'docs/history')
        continue;
      walk(path.join(d, e.name), r);
    } else if (/_v\d+\.\d+\.\d+\.md$/i.test(e.name)) {
      const m = e.name.match(/_v(\d+\.\d+\.\d+)\.md$/i);
      const s = fs.readFileSync(path.join(d, e.name), 'utf8').slice(0, 1200);
      const hm = s.match(/v(\d+\.\d+\.\d+)/);
      c(`filename/heading version: ${ r }`, !!hm && hm[1] === m[1], hm ? `file=${ m[1] }, heading=${ hm[1] }` : 'heading version missing');
    }
  }
}
walk(root);
process.exitCode = fail ? 1 : 0;
