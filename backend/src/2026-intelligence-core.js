'use strict';
const {warn}=require('./observability');
const crypto = require('node:crypto');

function clean(v){ return String(v ?? '').trim(); }
function sha256(value){ return crypto.createHash('sha256').update(value).digest('hex'); }
function status(){
  const endpoint=clean(process.env.OPSC_LOCAL_INFERENCE_URL);
  return {
    schemaVersion:'opscore.2026-intelligence.status.v1',
    localInferenceConfigured:Boolean(endpoint),
    provider: endpoint ? 'local-http' : null,
    failClosed:true,
    note:'No model inference is claimed unless a locally configured inference endpoint is available.'
  };
}
function validateEndpoint(raw){
  const u=new URL(raw);
  if(!['http:','https:'].includes(u.protocol)) throw new Error('INTELLIGENCE_ENDPOINT_INVALID');
  if(u.hostname!=='127.0.0.1' && u.hostname!=='localhost' && u.hostname!=='::1' && process.env.OPSC_ALLOW_NONLOCAL_INFERENCE!=='true')
    throw new Error('INTELLIGENCE_ENDPOINT_NOT_LOCAL');
  return u;
}
function deterministicSignals(workOrder){
  const priority=clean(workOrder.priority||'normal');
  const status=clean(workOrder.status||'open');
  const dueAt=workOrder.due_at ? new Date(workOrder.due_at) : null;
  const overdue=Boolean(dueAt && !Number.isNaN(dueAt.getTime()) && dueAt.getTime()<Date.now() && !['completed','cancelled'].includes(status));
  const urgency={urgent:1,high:.75,normal:.4,low:.2}[priority] ?? .4;
  return {overdue,priority,urgencyScore:urgency,status};
}
async function predictWorkOrder(store,ctx,workOrderId){
  if(!ctx?.organizationId) throw new Error('UNAUTHORIZED');
  const wo=store.getWorkOrder(ctx,workOrderId);
  const signals=deterministicSignals(wo);
  const context={schemaVersion:'opscore.2026-intelligence.context.v1',organizationId:ctx.organizationId,workOrder:{id:wo.id,status:wo.status,priority:wo.priority,dueAt:wo.due_at||null,title:wo.title},signals};
  let memory=[];
  if (clean(process.env.OPSC_MEMORY_KEY)) {
    try { memory=store.listAgentMemories(ctx,{subjectType:'work_order',subjectId:workOrderId}).items.slice(0,10).map(x=>({memoryType:x.memoryType,content:x.content,createdAt:x.createdAt,contentSha256:x.contentSha256})); } catch (memoryError) { warn('decision_memory_unavailable', { workOrderId, error: memoryError }); }
  }
  context.persistentMemory=memory;
  const contextHashSha256=sha256(JSON.stringify(context));
  const endpoint=clean(process.env.OPSC_LOCAL_INFERENCE_URL);
  if(!endpoint) return {schemaVersion:'opscore.2026-intelligence.prediction.v1',provider:'deterministic-only',configured:false,contextHashSha256,signals,decision:'NO_MODEL_CONFIGURED',requiresHumanReview:true};
  const u=validateEndpoint(endpoint);
  const controller=new AbortController(), timer=setTimeout(()=>controller.abort(),Number(process.env.OPSC_LOCAL_INFERENCE_TIMEOUT_MS||5000));
  try{
    const r=await fetch(u,{method:'POST',signal:controller.signal,headers:{'content-type':'application/json','accept':'application/json'},body:JSON.stringify({task:'work_order_operational_prediction',context})});
    if(!r.ok) throw new Error('INTELLIGENCE_INFERENCE_HTTP_ERROR');
    const out=await r.json();
    if(!out || typeof out!=='object') throw new Error('INTELLIGENCE_INFERENCE_INVALID_RESPONSE');
    return {schemaVersion:'opscore.2026-intelligence.prediction.v1',provider:'local-http',configured:true,contextHashSha256,signals,prediction:out,requiresHumanReview:true};
  }catch(e){ if(e?.name==='AbortError') throw new Error('INTELLIGENCE_INFERENCE_TIMEOUT'); throw e; }
  finally{clearTimeout(timer);}
}
module.exports={status,predictWorkOrder};
