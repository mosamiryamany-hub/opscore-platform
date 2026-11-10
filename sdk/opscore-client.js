class OpsCoreClient{
  constructor({baseUrl,token,apiKey,fetchImpl=globalThis.fetch}){if(!baseUrl)throw new Error('baseUrl required');if(!fetchImpl)throw new Error('fetch implementation unavailable');this.baseUrl=baseUrl.replace(/\/$/,'');this.token=token;this.apiKey=apiKey;this.fetch=fetchImpl;}
  async request(path,{method='GET',body,headers={}}={}){const h={'accept':'application/json',...headers};if(body!==undefined)h['content-type']='application/json';if(this.token)h.authorization=`Bearer ${this.token}`;if(this.apiKey)h['x-api-key']=this.apiKey;const r=await this.fetch(this.baseUrl+path,{method,headers:h,body:body===undefined?undefined:JSON.stringify(body)});const text=await r.text();let data=null;try{data=text?JSON.parse(text):null}catch{data={raw:text}}if(!r.ok){const err=new Error(data?.error?.code||`HTTP_${r.status}`);err.status=r.status;err.payload=data;throw err;}return data;}
  search(q,limit=50){return this.request(`/api/v1/search?q=${encodeURIComponent(q)}&limit=${limit}`)}
  bulkWorkOrders(payload,idempotencyKey){return this.request('/api/v1/work-orders/bulk',{method:'POST',headers:{'idempotency-key':idempotencyKey},body:payload})}
  createApproval(payload){return this.request('/api/v1/approvals',{method:'POST',body:payload})}
  listApprovals(status){return this.request(`/api/v1/approvals${status?`?status=${encodeURIComponent(status)}`:''}`)}
  decideApproval(id,payload){return this.request(`/api/v1/approvals/${encodeURIComponent(id)}/decide`,{method:'POST',body:payload})}
  inventoryLedger(params=''){return this.request(`/api/v1/inventory/ledger${params?`?${params}`:''}`)}
  adjustInventory(payload,idempotencyKey){return this.request('/api/v1/inventory/ledger/adjust',{method:'POST',headers:{'idempotency-key':idempotencyKey},body:payload})}
  businessCalendars(){return this.request('/api/v1/business-calendars')}
  createBusinessCalendar(payload){return this.request('/api/v1/business-calendars',{method:'POST',body:payload})}
  addCalendarException(payload){return this.request('/api/v1/business-calendars/exceptions',{method:'POST',body:payload})}
  businessDue(payload){return this.request('/api/v1/business-due-at',{method:'POST',body:payload})}
  dispatchEligibility(workOrderId){return this.request(`/api/v1/work-orders/${encodeURIComponent(workOrderId)}/dispatch-eligibility`)}
  migrationPreflight(){return this.request('/api/v1/admin/migration-preflight')}
}
module.exports={OpsCoreClient};
