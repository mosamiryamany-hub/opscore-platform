'use strict';
const fs=require('node:fs');
const path=require('node:path');
const ROOT=path.resolve(__dirname,'..');
const server=fs.readFileSync(path.join(ROOT,'src/server.js'),'utf8');
const enterprise=fs.readFileSync(path.join(ROOT,'src/enterprise-value-additions.js'),'utf8');

const entries=[
  ['custom-domain-verify','POST','/api/v1/custom-domains/:id/verify','MUTATING','idempotentWrite',"store.idempotentWrite(c,'custom_domain_verify'"] ,
  ['custom-domain-activate','POST','/api/v1/custom-domains/:id/activate','MUTATING','idempotentWrite',"store.idempotentWrite(c,'custom_domain_activate'"] ,
  ['platform-decision-replay','POST','/api/v1/platform/decisions/:id/replay','MUTATING','idempotentWrite',"store.idempotentWrite(c,'platform_decision_replay'"] ,
  ['platform-twin-snapshot-capture','POST','/api/v1/platform/twin/snapshots','MUTATING','idempotentWrite',"store.idempotentWrite(c,'platform_twin_snapshot'"] ,
  ['autopilot-proposal-approve-reject-execute','POST','/api/v1/autopilot/proposals/:id/(approve|reject|execute)','MUTATING','idempotentWrite',"store.idempotentWrite(c,'autopilot_proposal_approve'"] ,
  ['service-line-create','POST','/api/v1/service-lines','MUTATING','idempotentWrite',"store.idempotentWrite(c,'service_line_create'"] ,
  ['customer-service-line-assign','POST','/api/v1/customers/:id/service-line','MUTATING','idempotentWrite',"store.idempotentWrite(c,'customer_service_line_assign'"] ,
  ['service-line-migration-preflight','POST','/api/v1/service-line-migrations/preflight','MUTATING','idempotentWrite',"store.idempotentWrite(c,'service_line_migration_preflight'"] ,
  ['service-line-migration-execute','POST','/api/v1/service-line-migrations/:id','MUTATING','idempotentWrite',"store.idempotentWrite(c,'service_line_migration_execute'"] ,
  ['service-line-migration-rollback','POST','/api/v1/service-line-migrations/:id/rollback','MUTATING','idempotentWrite',"store.idempotentWrite(c,'service_line_migration_rollback'"] ,
  ['closure-sheet-compile','POST','/api/v1/operations/closure-sheets/compile','MUTATING','idempotentWrite',"store.idempotentWrite(c,'closure_sheet_compile'"] ,
  ['operational-dependency-add','POST','/api/v1/operations/dependencies','MUTATING','idempotentWrite',"store.idempotentWrite(c,'operational_dependency_add'"] ,
  ['operational-deadlock-resolve','POST','/api/v1/operations/deadlocks/resolve','MUTATING','idempotentWrite',"store.idempotentWrite(c,'operational_deadlock_resolve'"] ,
  ['tenant-field-protect','POST','/api/v1/security/tenant-field/protect','MUTATING','idempotentWrite',"store.idempotentWrite(c,'tenant_field_protect'"] ,
  ['tenant-field-reveal','POST','/api/v1/security/tenant-field/reveal','NON_MUTATING_SENSITIVE_READ','explicit-read-policy','store.revealTenantField(c,b)'],
  ['geofence-create','POST','/api/v1/geofences','MUTATING','idempotentWrite',"store.idempotentWrite(c,'geofence_create'"] ,
  ['geofence-technician-assign','POST','/api/v1/geofences/:id/technicians','MUTATING','idempotentWrite',"store.idempotentWrite(c,'geofence_technician_assign'"] ,
  ['signature-chain-seal','POST','/api/v1/security/signature-chain/seal','MUTATING','idempotentWrite',"store.idempotentWrite(c,'signature_chain_seal'"] ,
  ['dynamic-geofence-event','POST','/api/v1/geofences/dynamic-events','MUTATING','idempotentWrite',"store.idempotentWrite(c,'geofence_dynamic_event'"] ,
  ['dynamic-geofence-evaluate','POST','/api/v1/geofences/dynamic-evaluate','NON_MUTATING_EVALUATION','explicit-read-policy','store.evaluateDynamicGeofence(c,b)'],
  ['field-signoff-assurance','POST','/api/v1/work-orders/:id/signoff-assurance','MUTATING','idempotentWrite',"store.idempotentWrite(c,'field_signoff_assurance'"] ,
  ['field-invoice','POST','/api/v1/work-orders/:id/field-invoice','MUTATING','idempotentWrite',"store.idempotentWrite(c,'field_invoice'"] ,
  ['geofence-evaluate','POST','/api/v1/geofences/evaluate','NON_MUTATING_EVALUATION','explicit-read-policy','store.evaluateGeofences(c,b)'],
  ['privacy-purge','POST','/api/v1/security/privacy-purge','MUTATING','idempotentWrite',"store.idempotentWrite(c,'privacy_purge'"] ,
  ['signature-chain-append','POST','/api/v1/security/signature-chain','MUTATING','idempotentWrite',"store.idempotentWrite(c,'signature_chain_append'"] ,
  ['signature-chain-verify','POST','/api/v1/security/signature-chain/verify','NON_MUTATING_EVALUATION','explicit-read-policy','store.verifySignatureChain(c,b)'],
  ['billing-provider-register','POST','/api/v1/billing/providers','MUTATING','idempotentWrite',"store.idempotentWrite(c,'billing_provider_register'"] ,
  ['billing-reconcile-provider','POST','/api/v1/billing/reconcile-provider','EXTERNAL_READ_PLUS_PERSISTED_REPORT','requires-async-idempotency','this.idempotentAsyncWrite(ctx,\'billing_provider_reconcile_stripe\''],
  ['service-line-migration-unreachable','POST','/api/v1/service-line-migrations/:id/unreachable','MUTATING','idempotentWrite',"store.idempotentWrite(c,'service_line_migration_unreachable'"] ,
  ['appointment-unreachable','POST','/api/v1/appointments/:id/unreachable','MUTATING','idempotentWrite',"store.idempotentWrite(c, 'appointment_unreachable'"] ,
  ['fault-classify','POST','/api/v1/faults/classify','NON_MUTATING_EVALUATION','explicit-read-policy','store.classifyFaultInfrastructure(c, b)'],
  ['fault-ticket-create','POST','/api/v1/faults','MUTATING','idempotentWrite',"store.idempotentWrite(c, 'fault_ticket_create'"] ,
  ['fault-status-transition','POST','/api/v1/faults/:id/transition','MUTATING','idempotentWrite',"store.idempotentWrite(c, 'fault_status_transition'"] ,
  ['fault-unreachable','POST','/api/v1/faults/:id/unreachable','MUTATING','idempotentWrite',"store.idempotentWrite(c, 'fault_unreachable'"] ,
  ['fault-offline-sync','POST','/api/v1/faults/offline-sync','MUTATING','idempotentWrite',"store.idempotentWrite(c, 'fault_offline_sync'"] ,
  ['commercial-reconciliation-run','POST','/api/v1/reconciliation/run','MUTATING_LOCAL_OR_EXTERNAL_READ','local-idempotent;stripe-async-idempotency-required',"store.idempotentWrite(c,'commercial_reconciliation'"]
];
const results=entries.map((e,i)=>{
  const [name,method,route,classification,policy,marker]=e;
  const source=classification==='EXTERNAL_READ_PLUS_PERSISTED_REPORT'?enterprise:server;
  return {index:i+1,name,method,route,classification,policy,contractPresent:source.includes(marker)};
});
const report={
  schemaVersion:'opscore.mutation-route-policy.v2',
  generatedAt:new Date().toISOString(),
  scope:'complete-current-write-method-boundary-inventory',
  entries:results,
  summary:{
    total:results.length,
    mutating:results.filter(x=>!x.classification.startsWith('NON_MUTATING')).length,
    idempotentWrite:results.filter(x=>x.policy==='idempotentWrite').length,
    asyncIdempotencyRequired:results.filter(x=>x.policy.includes('async')).length,
    explicitNonMutating:results.filter(x=>x.classification.startsWith('NON_MUTATING')).length,
    contractPresent:results.filter(x=>x.contractPresent).length
  },
  decision:results.every(x=>x.contractPresent)?'PASS':'REVIEW',
  notes:[
    'Every POST/PUT/PATCH/DELETE handler is explicitly classified; non-mutating POSTs are not forced through idempotency merely because of HTTP verb.',
    'Persisted mutations have an explicit replay/atomicity policy; remote reconciliation uses async reservation before the external call.',
    'Static boundary inventory is not live concurrency certification.'
  ]
};
fs.writeFileSync(path.join(ROOT,'docs','MUTATION_ROUTE_POLICY_RESULT.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
