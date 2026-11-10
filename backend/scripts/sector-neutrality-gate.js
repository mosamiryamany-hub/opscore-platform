#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const project = path.resolve(root, '..');

const runtimeRoots = [
  path.join(root, 'src'),
  path.join(root, 'web'),
  path.join(project, 'mobile'),
  path.join(root, 'scripts')
];

const currentFacing = [
  'README.md',
  'SALES_README.md',
  'SALES_KIT.md',
  'PRODUCT_POSITIONING.md',
  'PRODUCT_SCOPE.md',
  path.join('..', '..', 'SALES_KIT.md'),
  path.join('..', '..', 'RELEASE_SCOPE.md'),
  path.join('..', '..', 'COMMERCIAL_SALES_PAGE.html'),
  path.join('..', '..', 'docs', 'PRODUCT_POSITIONING_EN.md'),
  path.join('..', '..', 'docs', 'MARKETPLACE_LISTING_EN.md'),
  path.join('..', '..', 'docs', 'EXECUTIVE_SUMMARY_AR.md')
];

const forbiddenRuntime = [
  /\bFTTH\b/i,
  /\bGPON\b/i,
  /\bXGS[- ]?PON\b/i,
  /\bOLT\b/i,
  /\bONT\b/i,
  /\bOTDR\b/i,
  /\bPON\b/i,
  /\bdBm\b/i,
  /\bODF\b/i,
  /\bFDT\b/i,
  /\bsplitter\b/i,
  /\bnetworkRef\b/i
];

const forbiddenCommercial = [
  /\bFTTH\b/i,
  /\bGPON\b/i,
  /\bXGS[- ]?PON\b/i,
  /\bOLT\b/i,
  /\bONT\b/i,
  /\bOTDR\b/i,
  /\bNMS\b/i,
  /\btelecom\b/i,
  /\bISP operations\b/i,
  /\bnetwork_ref\b/i,
  /\bnetworkRef\b/i
];

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!['node_modules', '.git', 'data', 'coverage'].includes(entry.name)) walk(p, out);
    } else {
      out.push(p);
    }
  }
  return out;
}

function rel(file) {
  return path.relative(project, file).split(path.sep).join('/');
}

const runtimeFiles = runtimeRoots
  .flatMap(d => walk(d))
  .filter(p => /\.(js|mjs|cjs|html|json)$/i.test(p));

const runtimeHits = [];
for (const file of runtimeFiles) {
  const relative = rel(file);
  // The forensic language audit intentionally embeds forbidden-sector terms as
  // negative-match patterns. It is a validator, not shipped runtime behavior; run
  // it independently via `node scripts/audit-languages-forensic.js`.
  if ([
    'backend/scripts/domain-neutrality-gate.js',
    'backend/scripts/sector-neutrality-gate.js',
    'backend/scripts/audit-languages-forensic.js'
  ].includes(relative)) continue;
  const text = fs.readFileSync(file, 'utf8');
  for (const rx of forbiddenRuntime) {
    if (rx.test(text)) runtimeHits.push({ file: relative, pattern: String(rx) });
  }
}

// `network_ref` exists only as a backward-compatibility identifier inside the
// SQLite v23 -> v24 migration. It is deliberately checked separately rather
// than excluding the whole db.js file from the neutrality gate.
const dbJs = fs.readFileSync(path.join(root, 'src', 'db.js'), 'utf8');
const legacyNetworkRefMatches = dbJs.match(/\bnetwork_ref\b/g) || [];
const expectedLegacyNetworkRef = 2;
const unexpectedNetworkRef = dbJs
  .split(/\r?\n/)
  .map((line, index) => ({ line: index + 1, text: line }))
  .filter(({ text }) => /\bnetwork_ref\b/.test(text) && !/cols\.includes\('network_ref'\)|RENAME COLUMN network_ref TO service_ref/.test(text));

for (const line of unexpectedNetworkRef) {
  runtimeHits.push({ file: 'backend/src/db.js', pattern: `unexpected legacy network_ref at line ${line.line}` });
}
if (legacyNetworkRefMatches.length !== expectedLegacyNetworkRef) {
  runtimeHits.push({
    file: 'backend/src/db.js',
    pattern: `expected exactly ${expectedLegacyNetworkRef} compatibility network_ref occurrences; found ${legacyNetworkRefMatches.length}`
  });
}

const commercialHits = [];
for (const rel0 of currentFacing) {
  const file = path.resolve(root, rel0);
  if (!fs.existsSync(file)) continue;
  const relative = rel(file);
  const text = fs.readFileSync(file, 'utf8');
  for (const rx of forbiddenCommercial) {
    if (rx.test(text)) commercialHits.push({ file: relative, pattern: String(rx) });
  }
}

const store = fs.readFileSync(path.join(root, 'src', 'store.js'), 'utf8');
const checks = {
  runtimeNoIndustrySpecificTokens: runtimeHits.length === 0,
  commercialNoSingleIndustryTargeting: commercialHits.length === 0,
  genericCustomFields: /customFields|custom_fields/.test(store) && /customer/.test(store) && /work_order/.test(store),
  genericWorkTypeControls: ['createCompletionPolicy', 'createProcedure', 'createSafetyChecklist', 'createWorkflow'].every(x => store.includes(x)),
  genericAssets: /assetType|asset_type/.test(store),
  genericSavedViews: /saved.?view/i.test(store) && /work_orders/.test(store) && /assets/.test(store)
};

const required = Object.values(checks).every(Boolean);
const result = {
  schemaVersion: 'opscore.sector-neutrality.v2',
  release: JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version,
  status: required ? 'PASS' : 'FAIL',
  checks,
  runtimeFilesScanned: runtimeFiles.length,
  runtimeHits,
  commercialHits,
  legacyCompatibility: {
    file: 'backend/src/db.js',
    identifier: 'network_ref',
    expectedOccurrences: expectedLegacyNetworkRef,
    actualOccurrences: legacyNetworkRefMatches.length,
    isolatedToCompatibilityMigration: unexpectedNetworkRef.length === 0
  },
  notes: [
    'This gate establishes source-level sector neutrality and generic extension points across backend runtime, web console, mobile source, and shipped operational scripts.',
    'The only permitted legacy industry-adjacent identifier is network_ref, and only inside the explicit SQLite v23 -> v24 compatibility migration; current contracts use service_ref.',
    'This gate does not certify any external provider, live database, production network edge, or deployment environment.'
  ],
  generatedAt: new Date().toISOString()
};

const out = path.join(project, 'docs', 'verification', 'SECTOR_NEUTRALITY_RESULT.json');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
process.exitCode = required ? 0 : 1;
