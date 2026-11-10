'use strict';
const fs=require('node:fs');
const path=require('node:path');
const ROOT=path.resolve(__dirname,'..');
const src=path.join(ROOT,'src');
const files=[];
for(const name of fs.readdirSync(src)) if(name.endsWith('.js')) files.push(path.join(src,name));
const text=files.map(f=>({f,raw:fs.readFileSync(f,'utf8')}));
const classes=[];
const add=(id,file,method,kind,policy,marker)=>classes.push({id,file,method,kind,policy,marker,contractPresent:text.find(x=>path.relative(path.dirname(ROOT),x.f)===file)?.raw.includes(marker)||false});
add('field-signoff','backend/src/field-value-extensions.js','recordFieldSignoffAssurance','tenant-mutation','API boundary idempotentWrite','INSERT INTO field_signoff_assurance');
add('billing-reconcile','backend/src/enterprise-value-additions.js','reconcileViaBillingProvider','external-read-persisted-result','internal idempotentAsyncWrite for Stripe','this.idempotentAsyncWrite(ctx,\'billing_provider_reconcile_stripe\'');
add('commercial-reconcile','backend/src/operational-enhancements.js','reconcileCommercial','tenant-mutation','API idempotentWrite for local report','INSERT INTO payment_reconciliation_runs');
add('operational-worker-claim','backend/src/operational-enhancements.js','claimOperationalJob','system-worker-state','BEGIN IMMEDIATE + claim predicate','BEGIN IMMEDIATE');
add('operational-worker-complete','backend/src/operational-enhancements.js','completeOperationalJob','system-worker-state','claim-status guarded update',"status=\'processing\'");
add('operational-worker-fail','backend/src/operational-enhancements.js','failOperationalJob','system-worker-state','claim-status guarded update',"status=\'processing\'");
add('simulation-fixture','backend/src/operational-intelligence-fabric.js','makeScenarioArtifacts','simulation-fixture','simulation transaction boundary','synthetic: true');
const unresolved=classes.filter(x=>!x.contractPresent);
const report={
 schemaVersion:'opscore.internal-mutation-boundary.v1',
 generatedAt:new Date().toISOString(),
 scope:'pre-infrastructure-source-audit-of-non-HTTP mutation boundaries',
 total:classes.length,covered:classes.filter(x=>x.contractPresent).length,unresolved,classes,
 decision:unresolved.length?'REVIEW':'PASS',
 notes:[
  'Tenant business mutations are expected to be entered from explicit API idempotency boundaries where applicable.',
  'System-worker state changes use an atomic claim/transition predicate rather than API idempotency, because they are not user replay commands.',
  'Simulation fixtures remain explicitly synthetic and are not promoted to production domain events.'
 ]
};
fs.writeFileSync(path.join(ROOT,'docs','INTERNAL_MUTATION_BOUNDARY_RESULT.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
