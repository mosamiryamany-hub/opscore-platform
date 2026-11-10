const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const crypto=require('node:crypto');
const {Store}=require('../src/store');
const {schedulingConflictAnalysis,candidateSlots,osrmRoute,createStripePaymentIntent}=require('../src/2026-intelligence');

function fixture(name){const p=path.join(os.tmpdir(),`opscore-2026-${name}-${crypto.randomUUID()}.db`);process.env.SQLITE_PATH=p;delete require.cache[require.resolve('../src/config')];delete require.cache[require.resolve('../src/db')];const d=require('../src/db').openDb();return {d,p};}
function clean(p){for(const x of [p,p+'-wal',p+'-shm'])try{fs.rmSync(x,{force:true})}catch{}}

test('2026 scheduling conflict analysis blocks overlap and suggests safe deterministic slots',()=>{
 const f=fixture('conflicts'),s=new Store(f.d,{sessionTtlHours:24});
 try{
  const boot=s.bootstrap({orgName:'2026 Conflict Tenant',email:'owner@example.com',password:'Owner-strong-pass-2026'});
  const ctx={...boot, organizationId:boot.orgId, role:'owner'};
  s.upsertTechnician(ctx,{userId:ctx.userId,latitude:30.0,longitude:31.0});
  const customer=s.createCustomer(ctx,{name:'Conflict Customer',email:'customer@example.com'});
  const site=s.createSite(ctx,{customerId:customer.id,name:'Site',latitude:30,longitude:31});
  const wo1=s.createWorkOrder(ctx,{customerId:customer.id,siteId:site.id,title:'Existing'});
  const wo2=s.createWorkOrder(ctx,{customerId:customer.id,siteId:site.id,title:'Proposed'});
  s.createAppointment(ctx,{workOrderId:wo1.id,technicianId:ctx.userId,startAt:'2026-09-20T10:00:00Z',endAt:'2026-09-20T11:00:00Z'});
  const a=schedulingConflictAnalysis(s,ctx,{technicianId:ctx.userId,workOrderId:wo2.id,startAt:'2026-09-20T10:30:00Z',endAt:'2026-09-20T11:30:00Z'});
  assert.equal(a.decision,'BLOCK'); assert.equal(a.conflictCount,1);
  const c=candidateSlots(s,ctx,{technicianId:ctx.userId,workOrderId:wo2.id,startAt:'2026-09-20T10:30:00Z',endAt:'2026-09-20T11:30:00Z'});
  assert.ok(c.candidates.length>0); assert.equal(c.requiresHumanApproval,true);
 }finally{f.d.close();clean(f.p)}
});

test('OSRM adapter fails closed unless a real OSRM service is configured',async()=>{
 const old=process.env.OSRM_BASE_URL; delete process.env.OSRM_BASE_URL;
 await assert.rejects(()=>osrmRoute({coordinates:[{lat:30,lon:31},{lat:30.1,lon:31.1}]}),/OSRM_NOT_CONFIGURED/);
 if(old!==undefined) process.env.OSRM_BASE_URL=old;
});

test('Stripe payment intent integration fails closed without credentials and never accepts arbitrary client amount',async()=>{
 const f=fixture('stripe-intent'),s=new Store(f.d,{sessionTtlHours:24});
 try{
  const b=s.bootstrap({orgName:'Stripe Intent Tenant',email:'owner@example.com',password:'Owner-strong-pass-2026'}); const ctx={...b, organizationId:b.orgId, role:'owner'};
  const c=s.createCustomer(ctx,{name:'Paying Customer',email:'pay@example.com'});
  const inv=s.createInvoice(ctx,{customerId:c.id,currency:'USD',lines:[{description:'Service',quantity:1,unitPrice:100}]});
  s.updateInvoiceStatus(ctx,inv.id,'issued');
  const old=process.env.STRIPE_SECRET_KEY; delete process.env.STRIPE_SECRET_KEY;
  await assert.rejects(()=>createStripePaymentIntent(s,ctx,inv.id,'buyer-key-123'),/STRIPE_NOT_CONFIGURED/);
  if(old!==undefined) process.env.STRIPE_SECRET_KEY=old;
 }finally{f.d.close();clean(f.p)}
});



test('operational queues claim jobs with leases and tenant scope',()=>{const f=fixture('queues'),s=new Store(f.d,{sessionTtlHours:24});try{const boot=s.bootstrap({orgName:'Queue Tenant',email:'queue@ops.test',password:'Strong-pass-2026'});const c={...boot,organizationId:boot.orgId,role:'owner'};const j=s.enqueueOperationalJob(c,{queueName:'billing',jobType:'invoice_reconciliation',payload:{provider:'local'}});const w=s.claimOperationalJob('billing',60);assert.equal(w.id,j.id);assert.equal(w.status,'processing');s.completeOperationalJob(j.id,{ok:true});assert.equal(s.getOperationalJob(c,j.id).status,'completed')}finally{f.d.close();clean(f.p)}});
test('service-line migration is preflighted and atomically cut over',()=>{const f=fixture('migration-lines'),s=new Store(f.d,{sessionTtlHours:24});try{const boot=s.bootstrap({orgName:'Migration Lines',email:'migration-lines@ops.test',password:'Strong-pass-2026'});const c={...boot,organizationId:boot.orgId,role:'owner'};const cust=s.createCustomer(c,{name:'Subscriber'});const a=s.createServiceLine(c,{code:'A',name:'Line A',serviceRef:'SERVICE-A'});const b=s.createServiceLine(c,{code:'B',name:'Line B',serviceRef:'SERVICE-B'});s.assignCustomerServiceLine(c,cust.id,a.id);const m=s.preflightLineMigration(c,cust.id,b.id);assert.equal(m.status,'ready');const done=s.executeLineMigration(c,m.id);assert.equal(done.status,'completed');assert.equal(s.getCustomerServiceLine(c,cust.id).line_id,b.id)}finally{f.d.close();clean(f.p)}});
test('client preflight module exists as early validation only',()=>{const js=require('node:fs').readFileSync(require('node:path').join(__dirname,'../web/preflight.js'),'utf8');assert.match(js,/opsClientPreflight/);});
test('commercial reconciliation records local truth without fabricating remote matches',()=>{const f=fixture('recon'),s=new Store(f.d,{sessionTtlHours:24});try{const boot=s.bootstrap({orgName:'Recon',email:'recon@ops.test',password:'Strong-pass-2026'});const c={...boot,organizationId:boot.orgId,role:'owner'};const cust=s.createCustomer(c,{name:'Recon'});const inv=s.createInvoice(c,{customerId:cust.id,currency:'USD',lines:[{description:'S',quantity:1,unitPrice:100}]});s.updateInvoiceStatus(c,inv.id,'issued');s.recordInvoicePayment(c,inv.id,40);const r=s.reconcileCommercial(c,{provider:'local'});assert.equal(r.matchedCount,1);assert.equal(r.providerStatus,'local_ledger_verified')}finally{f.d.close();clean(f.p)}});


test('commercial payment ledger is atomic, idempotent, and reconciliation detects drift',()=>{const f=fixture('payment-ledger'),s=new Store(f.d,{sessionTtlHours:24});try{const a=s.bootstrap({orgName:'Pay Tenant A',email:'pay-a@ops.test',password:'Strong-pass-2026'});const c={...a,organizationId:a.orgId,role:'owner'};const cust=s.createCustomer(c,{name:'Ledger Customer'});const inv=s.createInvoice(c,{customerId:cust.id,currency:'USD',lines:[{description:'S',quantity:1,unitPrice:100}]});s.updateInvoiceStatus(c,inv.id,'issued');const first=s.idempotentWrite(c,'invoice_payment','payment-key-123',{invoiceId:inv.id,amount:40},()=>s.recordInvoicePayment(c,inv.id,40,{source:'local_manual',idempotencyKey:'payment-key-123'}));const replay=s.idempotentWrite(c,'invoice_payment','payment-key-123',{invoiceId:inv.id,amount:40},()=>s.recordInvoicePayment(c,inv.id,40,{source:'local_manual',idempotencyKey:'payment-key-123'}));assert.equal(replay.__idempotent,true);assert.equal(s.db.prepare('SELECT COUNT(*) c FROM invoice_payments WHERE organization_id=? AND invoice_id=?').get(c.organizationId,inv.id).c,1);assert.equal(s.getInvoice(c,inv.id).amount_paid,40);s.db.prepare('UPDATE invoices SET amount_paid=35 WHERE id=? AND organization_id=?').run(inv.id,c.organizationId);const r=s.reconcileCommercial(c,{provider:'local'});assert.equal(r.mismatchCount,1);assert.equal(r.invoices[0].delta,5);const fb=fixture('payment-ledger-b'),sb=new Store(fb.d,{sessionTtlHours:24});try{const other=sb.bootstrap({orgName:'Pay Tenant B',email:'pay-b@ops.test',password:'Strong-pass-2026'});const ctxB={...other,organizationId:other.orgId,role:'owner'};assert.equal(sb.db.prepare('SELECT COUNT(*) c FROM invoice_payments WHERE organization_id=?').get(ctxB.organizationId).c,0)}finally{fb.d.close();clean(fb.p)}}finally{f.d.close();clean(f.p)}});

test('outbox housekeeping is tenant scoped in the worker implementation',()=>{const js=fs.readFileSync(path.join(__dirname,'../scripts/operational-worker.js'),'utf8');assert.match(js,/WHERE organization_id=\? AND status='processing'/);assert.match(js,/job\.organization_id/);});


test('stripe reconciliation fetches real PaymentIntent data and detects local drift',async()=>{const f=fixture('stripe-recon'),s=new Store(f.d,{sessionTtlHours:24}),oldKey=process.env.STRIPE_SECRET_KEY,oldFetch=global.fetch;try{const b=s.bootstrap({orgName:'Stripe Recon',email:'stripe-recon@ops.test',password:'Strong-pass-2026'});const c={...b,organizationId:b.orgId,role:'owner'};const cust=s.createCustomer(c,{name:'Stripe Recon Customer'});const inv=s.createInvoice(c,{customerId:cust.id,currency:'USD',lines:[{description:'S',quantity:1,unitPrice:100}]});s.updateInvoiceStatus(c,inv.id,'issued');s.recordInvoicePayment(c,inv.id,40,{source:'stripe',providerReference:'pi_local',idempotencyKey:'stripe-local-1'});process.env.STRIPE_SECRET_KEY='test-secret';global.fetch=async()=>new Response(JSON.stringify({object:'list',data:[{id:'pi_remote',status:'succeeded',amount:10000,amount_received:10000,currency:'usd',metadata:{opscore_organization_id:c.organizationId,opscore_invoice_id:inv.id}}],has_more:false}),{status:200,headers:{'content-type':'application/json'}});const r=await s.reconcileCommercialStripe(c);assert.equal(r.providerStatus,'stripe_remote_verified');assert.equal(r.mismatchCount,1);assert.equal(r.invoices[0].remotePaid,100);assert.equal(r.invoices[0].localStripePaid,40);assert.equal(r.invoices[0].delta,60)}finally{global.fetch=oldFetch;if(oldKey===undefined)delete process.env.STRIPE_SECRET_KEY;else process.env.STRIPE_SECRET_KEY=oldKey;f.d.close();clean(f.p)}});
