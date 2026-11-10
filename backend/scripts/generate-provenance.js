'use strict';
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');

const root=path.resolve(__dirname,'..');
const packageJson=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
const version=packageJson.version;
const manifestPath=path.join(root,'SALES_PACKAGE_MANIFEST.json');
const sums=[
  'RELEASE_FILE_SHA256SUMS.txt',
  'RELEASE_COMPONENT_SHA256SUMS.txt',
  'SALES_PACKAGE_MANIFEST.json'
];
// Runtime-generated verification evidence changes during release gates. It is intentionally
// excluded from the static source provenance manifest; the evidence itself remains shipped.
const volatileEvidence=[
  'docs/verification/RELEASE_TEST_RUN_RESULT.json',
  'docs/verification/RELEASE_CANDIDATE_GATE_RESULT.json',
  'docs/verification/BUYER_PREFLIGHT_RESULT.json',
  'docs/verification/BUYER_SELF_VALIDATION_RESULT.json',
  'docs/verification/PRODUCTION_READINESS_RESULT.json',
  'docs/verification/RESILIENCE_GATE_RESULT.json',
  'docs/RECOVERY_GATE_RESULT.json',
  'docs/RED_TEAM_TRANSACTION_AUDIT_RESULT.json',
  'docs/MUTATION_ROUTE_POLICY_RESULT.json',
  'docs/MUTATION_BOUNDARY_GATE_RESULT.json',
  'docs/INTERNAL_MUTATION_BOUNDARY_RESULT.json',
  'docs/OUTBOX_DOMAIN_EVENT_INVENTORY_RESULT.json',
  'docs/DOMAIN_EVENT_CONTRACT_GATE_RESULT.json',
  'docs/PRE_INFRASTRUCTURE_FINAL_EVIDENCE_GATE_RESULT.json',
  'docs/PRE_INFRA_TEST_EXECUTION_RESULT.json',
  'docs/sbom/SBOM_GENERATION_RESULT.json',
  'docs/verification/SECTOR_NEUTRALITY_RESULT.json',
  'docs/verification/CONSOLE_COVERAGE_RESULT.json'
];
const volatileEvidencePresent=volatileEvidence.filter(rel=>fs.existsSync(path.join(root,rel)));
const integrityExclusions=new Set([...sums,...volatileEvidencePresent]);

function sha(file){return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');}
function collect(dir,rel=''){
  const out=[];
  for(const e of fs.readdirSync(path.join(dir,rel),{withFileTypes:true})){
    const r=rel?path.posix.join(rel,e.name):e.name;
    if(e.isDirectory()){
      if(['node_modules','.git','data/files','data'].includes(r))continue;
      out.push(...collect(dir,r));
    }else if(!integrityExclusions.has(r)){
      out.push(r);
    }
  }
  return out.sort();
}
const files=collect(root).map(rel=>({path:rel,sha256:sha(path.join(root,rel)),bytes:fs.statSync(path.join(root,rel)).size}));
const manifest={
  product:'OpsCore Operational SaaS Starter Kit',
  version,
  generatedAt:new Date().toISOString(),
  integrityExclusions:[...integrityExclusions].sort(),
  files
};
fs.writeFileSync(manifestPath,JSON.stringify(manifest,null,2)+'\n');
const lines=files.map(x=>`${x.sha256}  ${x.path}`).join('\n')+'\n';
for(const f of sums.slice(0,2))fs.writeFileSync(path.join(root,f),lines);
console.log(`Generated provenance for ${files.length} backend files at v${version}`);
