const crypto = require('node:crypto');
const net=require('node:net');
const {validateOsrmBaseUrl, assertOsrmHostResolvesSafely}=require('./firewall');
// Shared process-wide gateway breaker (same instance the /api/v1/circuits and governance routes read).
const {breaker}=require('./enterprise-value-additions');
const http=require('node:http'); const https=require('node:https');

function clean(v){ return String(v ?? '').trim(); }
function iso(v){ const d=new Date(v); return Number.isNaN(d.getTime()) ? null : d.toISOString(); }
function assertLimit(n,max,code){ if(!Number.isInteger(n)||n<1||n>max) throw new Error(code); }

function overlap(aStart,aEnd,bStart,bEnd){
  return new Date(aStart) < new Date(bEnd) && new Date(bStart) < new Date(aEnd);
}

function schedulingConflictAnalysis(store, ctx, d = {}) {
  if (!ctx?.organizationId) throw new Error('UNAUTHORIZED');
  const technicianId=clean(d.technicianId), workOrderId=clean(d.workOrderId);
  const start=iso(d.startAt), end=iso(d.endAt);
  if(!technicianId || !start || !end || new Date(end)<=new Date(start)) throw new Error('INVALID_TIME_RANGE');
  const durationMinutes=Math.ceil((new Date(end)-new Date(start))/60000);
  if(durationMinutes>1440) throw new Error('TIME_WINDOW_TOO_LONG');

  const tech=store.db.prepare('SELECT user_id,active FROM technician_profiles WHERE organization_id=? AND user_id=? AND active=1')
    .get(ctx.organizationId,technicianId);
  if(!tech) throw new Error('NOT_FOUND');
  if(workOrderId) store.getWorkOrder(ctx,workOrderId);

  const rows=store.db.prepare(`
    SELECT a.id,a.work_order_id,a.technician_id,a.start_at,a.end_at,a.status,
           w.number AS work_order_number,w.priority,w.title
    FROM appointments a JOIN work_orders w ON w.id=a.work_order_id
    WHERE a.organization_id=? AND a.technician_id=?
      AND a.status IN ('scheduled','confirmed','en_route')
      AND a.start_at IS NOT NULL AND a.end_at IS NOT NULL
      AND a.end_at > ? AND a.start_at < ?
    ORDER BY a.start_at
  `).all(ctx.organizationId,technicianId,start,end);

  const conflicts=rows
    .filter(r=>!workOrderId || r.work_order_id!==workOrderId)
    .map(r=>({
      type:'technician_time_overlap',
      severity:['urgent','high'].includes(r.priority) ? 'high':'medium',
      appointmentId:r.id, workOrderId:r.work_order_id, workOrderNumber:r.work_order_number,
      title:r.title, priority:r.priority, scheduledStartAt:r.start_at, scheduledEndAt:r.end_at,
      reason:'Technician has an overlapping scheduled appointment.'
    }));

  return {
    schemaVersion:'opscore.scheduling-conflict.v1',
    organizationId:ctx.organizationId,
    technicianId,
    workOrderId:workOrderId||null,
    proposed:{startAt:start,endAt:end,durationMinutes},
    conflictCount:conflicts.length,
    hasConflict:conflicts.length>0,
    conflicts,
    decision:conflicts.length ? 'BLOCK' : 'ALLOW',
    automatedReschedule:false,
    note:'Deterministic constraint analysis. AI may suggest alternatives, but this endpoint does not mutate schedules.'
  };
}

function candidateSlots(store, ctx, d = {}) {
  const analysis=schedulingConflictAnalysis(store,ctx,d);
  if(!analysis.hasConflict) return {schemaVersion:'opscore.scheduling-candidates.v1', source:'deterministic', candidates:[{startAt:d.startAt,endAt:d.endAt,reason:'requested slot is conflict-free'}]};
  const start=new Date(d.startAt), end=new Date(d.endAt);
  const minutes=analysis.proposed.durationMinutes;
  const base=store.db.prepare(`
    SELECT start_at AS s, end_at AS e FROM appointments
    WHERE organization_id=? AND technician_id=? AND status IN ('scheduled','confirmed','en_route')
      AND start_at IS NOT NULL AND end_at IS NOT NULL
      AND end_at >= ? AND start_at <= ?
    ORDER BY start_at
  `).all(ctx.organizationId,d.technicianId,d.startAt,new Date(start.getTime()+72*3600000).toISOString());
  const busy=base.map(x=>({s:new Date(x.s),e:new Date(x.e)}));
  const out=[];
  for(let k=0;k<48 && out.length<10;k++){
    const s=new Date(start.getTime()+k*30*60000), e=new Date(s.getTime()+minutes*60000);
    if(!busy.some(x=>overlap(s,e,x.s,x.e))) out.push({startAt:s.toISOString(),endAt:e.toISOString(),reason:'nearest deterministic conflict-free slot'});
  }
  return {schemaVersion:'opscore.scheduling-candidates.v1',source:'deterministic',candidates:out,requiresHumanApproval:true};
}

async function osrmRoute(d = {}, ctx = null) {
  const gateway='maps:osrm';
  const base=clean(process.env.OSRM_BASE_URL).replace(/\/+$/,'');
  if(!base) throw new Error('OSRM_NOT_CONFIGURED');
  if(!breaker.allow(gateway,ctx?.organizationId)) throw new Error('GATEWAY_CIRCUIT_OPEN');
  validateOsrmBaseUrl(base,{production:String(process.env.NODE_ENV||'development')==='production'});
  const resolved=await assertOsrmHostResolvesSafely(base);
  const profile=clean(d.profile||'driving');
  if(!/^[a-z0-9_-]{1,40}$/i.test(profile)) throw new Error('INVALID_OSRM_PROFILE');
  if(!Array.isArray(d.coordinates) || d.coordinates.length<2 || d.coordinates.length>100) throw new Error('INVALID_ROUTE_COORDINATES');
  const coords=d.coordinates.map(p=>{
    const lat=Number(p?.lat), lon=Number(p?.lon);
    if(!Number.isFinite(lat)||!Number.isFinite(lon)||lat<-90||lat>90||lon<-180||lon>180) throw new Error('INVALID_ROUTE_COORDINATES');
    return `${lon},${lat}`;
  }).join(';');
  const url=`${base}/route/v1/${encodeURIComponent(profile)}/${coords}?overview=false&steps=false`;
  const controller=new AbortController(), timer=setTimeout(()=>controller.abort(), Number(process.env.OSRM_TIMEOUT_MS||5000));
  try{
    const data=await new Promise((resolve,reject)=>{
      const u=new URL(url); const transport=u.protocol==='https:'?https:http;
      const req=transport.request({hostname:u.hostname,port:u.port||undefined,path:`${u.pathname}${u.search}`,method:'GET',servername:u.hostname,lookup:(host,opts,cb)=>cb(null,resolved.address,net.isIP(resolved.address)),headers:{accept:'application/json'},timeout:Number(process.env.OSRM_TIMEOUT_MS||5000)},res=>{
        let raw=''; res.setEncoding('utf8'); res.on('data',chunk=>{raw+=chunk; if(raw.length>2000000) req.destroy(new Error('OSRM_RESPONSE_TOO_LARGE'));});
        res.on('end',()=>{if((res.statusCode||0)<200||(res.statusCode||0)>=300) return reject(new Error('OSRM_HTTP_ERROR')); try{resolve(JSON.parse(raw));}catch{reject(new Error('OSRM_INVALID_JSON'));}});
      });
      req.on('timeout',()=>req.destroy(Object.assign(new Error('OSRM_TIMEOUT'),{name:'AbortError'}))); req.on('error',reject); req.end();
    });
    if(data?.code!=='Ok') throw new Error('OSRM_ROUTE_FAILED');
    breaker.success(gateway,ctx?.organizationId);
    return {schemaVersion:'opscore.osrm-route.v1',provider:'OSRM',configured:true,durationSeconds:data.routes?.[0]?.duration??null,distanceMeters:data.routes?.[0]?.distance??null,route:data.routes?.[0]||null};
  }catch(e){
    breaker.failure(gateway,ctx?.organizationId);
    if(e?.name==='AbortError') throw new Error('OSRM_TIMEOUT');
    throw e;
  }finally{ clearTimeout(timer); }
}


async function createStripePaymentIntent(store, ctx, invoiceId, idempotencyKey){
  const secret=clean(process.env.STRIPE_SECRET_KEY);
  const gateway='billing:stripe-payment-intent';
  if(!secret) throw new Error('STRIPE_NOT_CONFIGURED');
  if(!breaker.allow(gateway,ctx?.organizationId)) throw new Error('GATEWAY_CIRCUIT_OPEN');
  if(!idempotencyKey || !/^[A-Za-z0-9._:-]{8,255}$/.test(String(idempotencyKey))) throw new Error('INVALID_IDEMPOTENCY_KEY');
  const inv=store.getInvoice(ctx, invoiceId);
  if(['draft','void','paid'].includes(inv.status)) throw new Error('INVOICE_PAYMENT_NOT_ALLOWED');
  const amountRemaining=Math.max(0, Number(inv.total)-Number(inv.amount_paid));
  if(!Number.isFinite(amountRemaining) || amountRemaining<=0) throw new Error('INVOICE_PAYMENT_COMPLETE');
  if(!/^[A-Z]{3}$/.test(String(inv.currency))) throw new Error('INVALID_CURRENCY');
  const body=new URLSearchParams();
  body.set('amount',String(Math.round(amountRemaining*100)));
  body.set('currency',String(inv.currency).toLowerCase());
  body.set('metadata[opscore_organization_id]',String(ctx.organizationId));
  body.set('metadata[opscore_invoice_id]',String(invoiceId));
  body.set('description',`OpsCore invoice ${inv.number}`);
  const controller=new AbortController(), timer=setTimeout(()=>controller.abort(), Number(process.env.STRIPE_API_TIMEOUT_MS||8000));
  try{
    const r=await fetch('https://api.stripe.com/v1/payment_intents',{
      method:'POST',
      signal:controller.signal,
      headers:{authorization:`Bearer ${secret}`,'content-type':'application/x-www-form-urlencoded','Idempotency-Key':String(idempotencyKey)},
      body
    });
    const data=await r.json();
    if(!r.ok) throw new Error('STRIPE_API_ERROR');
    breaker.success(gateway,ctx?.organizationId);
    return {schemaVersion:'opscore.stripe-payment-intent.v1',provider:'Stripe',configured:true,paymentIntentId:data.id,status:data.status,amount:Number(data.amount)/100,currency:String(data.currency).toUpperCase(),invoiceId,organizationId:ctx.organizationId,requiresWebhookForFinalSettlement:true};
  }catch(e){ breaker.failure(gateway,ctx?.organizationId); throw e; }finally{ clearTimeout(timer); }
}
module.exports={schedulingConflictAnalysis,candidateSlots,osrmRoute,createStripePaymentIntent};
