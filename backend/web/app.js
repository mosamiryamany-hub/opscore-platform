const clientPreflight=window.opsClientPreflight||((p,m,b)=>b);
let token=null;
let selected=null;
let lastWorkOrders=[];
const $=s=>document.querySelector(s);
const $$=s=>Array.from(document.querySelectorAll(s));
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

async function api(path,opts={}){
  const headers={...(opts.body?{'content-type':'application/json'}:{}),...(opts.headers||{})};
  const criticalWrite=/^\/api\/v1\/work-orders\/[^/]+(?:\/transition|\/comments|\/attachments)?$/.test(path)||/^\/api\/v1\/appointments\/[^/]+\/reschedule$/.test(path);
  if((opts.method||'GET')!=='GET' && criticalWrite && !headers['Idempotency-Key'] && !headers['idempotency-key']) headers['Idempotency-Key']=crypto.randomUUID();
  const safeBody=opts.body?JSON.stringify(clientPreflight(path,opts.method||'GET',opts.body)):opts.body; const r=await fetch(path,{...opts,body:safeBody,headers});
  const d=await r.json().catch(()=>null);
  if(!r.ok){ const err=new Error(d?.error?.code||`HTTP_${r.status}`); err.status=r.status; err.data=d; throw err; }
  return d;
}
window.opsApi=api;
function setVisible(id,visible=true){const el=$(id.startsWith('#')?id:`#${id}`); if(el) el.classList.toggle('hidden',!visible);}
function showAuth(id){['#setupPanel','#loginPanel'].forEach(x=>setVisible(x,false)); setVisible(id,true); $(id).scrollIntoView({behavior:'smooth',block:'center'});}
function setMsg(id,msg){$(id).textContent=msg||'';}

function applyUiLocale(mode){const rtl=mode==='ar';document.documentElement.dir=rtl?'rtl':'ltr';document.documentElement.lang=rtl?'ar':'en';document.documentElement.dataset.locale=rtl?'ar':'en';const b=$('#rtlToggle');if(b)b.textContent=rtl?'English / LTR':'العربية / RTL';}
(function(){const saved=localStorage.getItem('opscore_locale');const preferred=saved||((navigator.language||'').toLowerCase().startsWith('ar')?'ar':'en');applyUiLocale(preferred);const b=$('#rtlToggle');if(b)b.onclick=()=>{const next=document.documentElement.dataset.locale==='ar'?'en':'ar';localStorage.setItem('opscore_locale',next);applyUiLocale(next);};})();
['openSetup','heroSetup'].forEach(id=>{const el=$(`#${id}`);if(el)el.onclick=()=>showAuth('#setupPanel')});
['openLogin','heroLogin'].forEach(id=>{const el=$(`#${id}`);if(el)el.onclick=()=>showAuth('#loginPanel')});
$$('[data-close]').forEach(b=>b.onclick=()=>setVisible(`#${b.dataset.close}`,false));

$('#setupForm').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target);try{const d=await api('/api/v1/auth/bootstrap',{method:'POST',body:JSON.stringify(Object.fromEntries(f))});setMsg('#setupMsg',`Organization created (${d.orgId}). Sign in to continue.`);showAuth('#loginPanel')}catch(err){setMsg('#setupMsg',err.message)}};
$('#loginForm').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target);try{const d=await api('/api/v1/auth/login',{method:'POST',body:JSON.stringify(Object.fromEntries(f))});token=null;setVisible('#loginOrgLabel',false);await loadApp()}catch(err){const orgs=err?.data?.error?.details?.organizations||[];if(orgs.length){const sel=$('#loginOrg');sel.replaceChildren(...orgs.map(o=>{const opt=document.createElement('option');opt.value=o.id;opt.textContent=`${o.name} (${o.role})`;return opt;}));$('#loginOrgLabel').classList.remove('hidden');setMsg('#loginMsg','This account belongs to multiple organizations. Select one and sign in again.')}else{setMsg('#loginMsg',err.message)}}};

async function loadApp(sessionUser=null){
  setVisible('#setupPanel',false);setVisible('#loginPanel',false);setVisible('#appPanel',true);
  try{
    const [m,me,w,a,n,ops,sec,sessions,intel,value,tower,audit,brief,contract,cockpit,livePulse]=await Promise.all([api('/api/v1/metrics'),sessionUser?Promise.resolve(sessionUser):api('/api/v1/me'),api('/api/v1/work-orders'),api('/api/v1/activity'),api('/api/v1/notifications'),loadOpsData(),api('/api/v1/security-center'),api('/api/v1/sessions'),api('/api/v1/operational-intelligence'),api('/api/v1/value-intelligence'),api('/api/v1/control-tower'),api('/api/v1/audit'),api('/api/v1/operations/daily-brief'),api('/api/v1/client-contract'),api('/api/v1/operations/cockpit'),api('/api/v1/field/live-snapshot')]);
    if(contract.schemaVersion!=='opscore.client-contract.v1'||contract.fieldTodayVersion!=='opscore.field-today.v1'||contract.syncVersion!=='opscore.sync.v1') throw new Error('CLIENT_CONTRACT_MISMATCH');
    lastWorkOrders=w; renderMetrics(m,ops,sec); renderLivePulse(livePulse); renderIntelligence(intel); renderValueIntel(value); renderControlTower(tower); renderDailyBrief(brief); renderCockpit(cockpit); renderMe(me); renderOrders(w); renderActivity(a); renderNotifications(n); renderSessions(sessions); renderSecurity(sec); renderAudit(audit);
  }catch(err){token=null;setVisible('#appPanel',false);showAuth('#loginPanel');setMsg('#loginMsg',err.message)}
}
function renderMetrics(m,ops,sec){$('#mWork').textContent=m.workOrders;$('#mDone').textContent=m.completedWorkOrders;$('#mCustomers').textContent=m.customers;$('#mSites').textContent=m.sites;$('#mSla').textContent=ops.sla.length;$('#mTech').textContent=ops.tech.length;$('#secSessions').textContent=sec.activeSessions;$('#secKeys').textContent=sec.apiKeys;$('#secHooks').textContent=sec.webhooks;$('#secAudit').textContent=sec.auditEntries;}
function renderIntelligence(x){const ftf=x.quality?.firstTimeFixRate==null?'—':`${x.quality.firstTimeFixRate}%`;const items=[['Completion rate',`${x.workOrders.completionRate}%`],['Avg cycle',`${x.workOrders.averageCycleHours} h`],['SLA compliance',`${x.sla.complianceRate}%`],['First-time fix',ftf],['No-shows',String(x.field.noShows)],['Active technicians',String(x.field.activeTechnicians)],['Consumed part lines',String(x.field.consumedPartLines)]];$('#intelligence').innerHTML=items.map(([k,v])=>`<div class="metric"><span>${esc(k)}</span><strong>${esc(v)}</strong></div>`).join('');}
function renderValueIntel(x){const el=$('#valueIntel');if(!el)return;const items=[['Financially complete',String(x.financiallyComplete)],['Revenue',x.revenue===null?'—':`${x.revenue} ${x.currency}`],['Total cost',x.totalCost===null?'—':`${x.totalCost} ${x.currency}`],['Margin',x.margin===null?'—':`${x.margin} ${x.currency}`],['Repeat visits',String(x.repeatVisits)],['Repeat rate',`${x.repeatVisitRate}%`]];$('#valueIntel').innerHTML=items.map(([k,v])=>`<div class="metric"><span>${esc(k)}</span><strong>${esc(v)}</strong></div>`).join('');}
function renderControlTower(x){const el=$('#controlTower');if(!el)return;const c=x.counts||{};el.innerHTML=`<div class="simple-row"><b>SLA exceptions</b><span>${c.sla||0}</span></div><div class="simple-row"><b>Overloaded technicians</b><span>${c.overloadedTechnicians||0}</span></div><div class="simple-row"><b>Appointment conflicts</b><span>${c.appointmentConflicts||0}</span></div><div class="simple-row"><b>Repeat visits</b><span>${c.repeatVisits||0}</span></div>`;}
function renderCockpit(x){
  const focus=document.querySelector('#cockpitFocus'),queue=document.querySelector('#cockpitQueue'),role=document.querySelector('#cockpitRole');
  if(!x||!focus||!queue)return;
  if(role)role.textContent=esc(x.user?.role||'—');
  const f=x.focus;
  focus.innerHTML=f?'<div class="simple-row"><div><b>'+esc(f.number)+' · '+esc(f.title)+'</b><p>'+esc(f.nextAction?.label||'Review work')+'</p></div><span class="risk-chip">'+esc(f.risk?.level||'low')+' · '+esc(f.risk?.score??0)+'</span></div>':'<p class="muted">No personally assigned active work is recorded.</p>';
  queue.innerHTML=(x.decisionQueue||[]).slice(0,8).map(q=>'<div class="simple-row"><div><b>'+esc(q.number||q.type)+'</b><p>'+esc(q.title||q.action||'Review recorded exception')+'</p></div><span class="status-chip">'+esc(q.priority||'normal')+'</span></div>').join('')||'<p class="muted">No decision or exception requires attention.</p>';
}
function renderLivePulse(x){const el=document.querySelector('#livePulse');if(!el||!x)return;const points=x.map?.pointCount||0;const forecasts=(x.forecasts||[]).filter(f=>f.predictedMinutes!==null);const avg=forecasts.length?Math.round(forecasts.reduce((n,f)=>n+f.predictedMinutes,0)/forecasts.length):null;el.innerHTML=[['Open work orders',String(x.openWorkOrders||0)],['Last check-in points',String(points)],['Active hazards',String(x.dynamicHazardEvents||0)],['Forecasted jobs',String(forecasts.length)],['Avg predicted duration',avg===null?'—':`${avg} min`]].map(([k,v])=>`<div class="metric"><span>${esc(k)}</span><strong>${esc(v)}</strong></div>`).join('');}
function renderDailyBrief(x){const el=$('#dailyBrief');if(!el||!x)return;const c=x.summary||{};const rows=(x.priorityQueue||[]).slice(0,8).map(r=>`<div class="simple-row"><div><b>${esc(r.workOrder.number)} · ${esc(r.workOrder.title)}</b><p>${esc(r.primaryReason||r.level)}</p></div><span class="risk-chip">${esc(r.level)} · ${esc(r.score)}</span></div>`).join('');el.innerHTML=`<div class="metric-grid compact-metrics"><div class="metric"><span>Critical</span><strong>${c.criticalRiskWorkOrders||0}</strong></div><div class="metric"><span>High risk</span><strong>${c.highRiskWorkOrders||0}</strong></div><div class="metric"><span>Due today</span><strong>${c.dueToday||0}</strong></div><div class="metric"><span>Unassigned urgent/high</span><strong>${c.unassignedUrgent||0}</strong></div><div class="metric"><span>No-shows</span><strong>${c.noShows||0}</strong></div><div class="metric"><span>Open escalations</span><strong>${c.openEscalations||0}</strong></div></div><div class="mini-title">Priority queue</div>${rows||'<p class="muted">No elevated work-order risk recorded.</p>'}`;}
function renderMe(me){$('#orgName').textContent=me.organization.name;$('#meCard').innerHTML=`<div class="me-email">${esc(me.user.email)}</div><div class="role-pill">${esc(me.role)}</div>`;}
function renderOrders(w){const q=String($('#woSearch').value||'').toLowerCase();const shown=w.filter(o=>`${o.number} ${o.title}`.toLowerCase().includes(q));$('#orders').innerHTML=shown.map(o=>`<button class="order-row" data-id="${esc(o.id)}"><span class="priority ${esc(o.priority)}"></span><span class="order-main"><b>${esc(o.number)} · ${esc(o.title)}</b><small>${esc(o.customer_name||'No customer')} · ${esc(o.site_name||'No site')}</small></span><span class="order-meta"><span class="status-chip">${esc(o.status)}</span><small>${esc(o.assigned_email||'Unassigned')}</small></span></button>`).join('')||'<p class="muted">No matching work orders.</p>';$('[data-section="overview"] .order-list').querySelectorAll('.order-row').forEach(b=>b.onclick=()=>openWork(b.dataset.id));}
function renderActivity(a){$('#activity').innerHTML=a.slice(0,18).map(x=>`<div class="timeline"><small>${new Date(x.created_at).toLocaleString()}</small><div><b>${esc(x.event_type)}</b><p>${esc(x.message)}</p></div></div>`).join('')||'<p class="muted">No activity yet.</p>';}
function renderNotifications(n){$('#notifications').innerHTML=n.slice(0,12).map(x=>`<div class="simple-row"><div><b>${esc(x.title)}</b><p>${esc(x.body)}</p></div><small>${esc(x.status)}</small></div>`).join('')||'<p class="muted">No notifications.</p>';}
function renderSessions(sessions){$('#sessions').innerHTML=sessions.map(s=>`<div class="simple-row"><div><b>Session</b><p>Created ${new Date(s.created_at).toLocaleString()}</p></div><div><small>Expires ${new Date(s.expires_at).toLocaleString()}</small><button class="tiny danger" data-session="${esc(s.id)}">Revoke</button></div></div>`).join('')||'<p class="muted">No active sessions.</p>';$$('[data-session]').forEach(b=>b.onclick=async()=>{try{await api(`/api/v1/sessions/${encodeURIComponent(b.dataset.session)}`,{method:'DELETE'});await loadApp()}catch(e){alert(e.message)}});}
function renderAudit(x){const chain=x?.chain||{};$('#auditChainStatus').textContent=chain.valid?'CHAIN VALID':'CHAIN BROKEN';$('#auditLog').innerHTML=(x?.entries||[]).slice(0,20).map(e=>`<div class="timeline"><small>${new Date(e.created_at).toLocaleString()}</small><div><b>${esc(e.action)} · ${esc(e.resource_type)}</b><p>${esc(e.resource_id||'—')}</p></div></div>`).join('')||'<p class="muted">No audit entries yet.</p>';}
function renderSecurity(sec){$('#securityPosture').innerHTML=`<div class="security-list"><div><b>Local runtime</b><span class="ok">Operational</span></div><div><b>Database</b><span class="warn">Buyer verification required</span></div><div><b>External identity</b><span class="warn">Buyer verification required</span></div><div><b>Secrets / TLS / backups</b><span class="warn">Buyer verification required</span></div></div><p class="muted">${esc(sec.productionNote)}</p>`;}
async function loadOpsData(){const [sla,appts,tech,inv]=await Promise.all([api('/api/v1/sla-risks'),api('/api/v1/appointments'),api('/api/v1/technicians'),api('/api/v1/inventory')]);$('#slaRisks').innerHTML=`<div class="mini-title">SLA risks</div>`+(sla.slice(0,10).map(x=>`<div class="simple-row"><div><b>${esc(x.number)}</b><p>${esc(x.title)}</p></div><span class="risk-chip">${esc(x.sla_status)}</span></div>`).join('')||'<p class="muted">No current SLA risks.</p>');$('#appointments').innerHTML=`<div class="mini-title">Appointments</div>`+(appts.slice(0,10).map(x=>`<div class="simple-row"><div><b>${esc(x.number)}</b><p>${new Date(x.start_at).toLocaleString()}</p></div><small>${esc(x.technician_email||'Unassigned')}</small></div>`).join('')||'<p class="muted">No appointments.</p>');$('#inventory').innerHTML=inv.slice(0,10).map(x=>`<div class="simple-row"><div><b>${esc(x.sku)} · ${esc(x.part_name)}</b><p>${esc(x.location_name)}</p></div><strong>${esc(x.quantity)}</strong></div>`).join('')||'<p class="muted">No stock lines.</p>';return {sla,appts,tech,inv};}

async function openWork(id){selected=id;const w=await api(`/api/v1/work-orders/${encodeURIComponent(id)}`);switchView('work');$('#detail').innerHTML=`<div class="detail-head"><div><p class="eyebrow">${esc(w.number)}</p><h3>${esc(w.title)}</h3></div><span class="status-chip">${esc(w.status)}</span></div><p>${esc(w.description||'')}</p><div class="detail-grid"><div><small>Customer</small><b>${esc(w.customer_name||'—')}</b></div><div><small>Site</small><b>${esc(w.site_name||'—')}</b></div><div><small>Priority</small><b>${esc(w.priority)}</b></div><div><small>Assigned</small><b>${esc(w.assigned_email||'Unassigned')}</b></div></div><div id="workRisk" class="panel-soft"><p class="muted">Evaluating operational risk…</p></div><div class="detail-actions"><button id="advance">Advance status</button><button class="secondary" id="commentBtn">Add comment</button></div><div class="subhead">Comments</div>${w.comments.map(c=>`<div class="comment"><b>${esc(c.actor_email)}</b><small>${new Date(c.created_at).toLocaleString()}</small><p>${esc(c.body)}</p></div>`).join('')||'<p class="muted">No comments.</p>'}<div class="subhead">Attachments</div>${w.attachments.map(a=>`<a href="/api/v1/attachments/${esc(a.id)}" target="_blank" rel="noreferrer">${esc(a.file_name)}</a>`).join('<br>')||'<p class="muted">No attachments.</p>'}<div class="subhead">Unified timeline</div><div id="workTimeline"><p class="muted">Loading timeline…</p></div><div id="workHandoff" class="panel-soft"><p class="muted">Loading handoff context…</p></div>`;$('#advance').onclick=async()=>{const next={open:'in_progress',in_progress:'completed',blocked:'in_progress'}[w.status]||'completed';try{await api(`/api/v1/work-orders/${id}`,{method:'PATCH',body:JSON.stringify({status:next})});await loadApp();await openWork(id)}catch(e){alert(e.message)}};$('#commentBtn').onclick=async()=>{const body=prompt('Comment');if(!body)return;try{await api(`/api/v1/work-orders/${id}/comments`,{method:'POST',body:JSON.stringify({body})});await loadApp();await openWork(id)}catch(e){alert(e.message)}};try{const risk=await api(`/api/v1/work-orders/${encodeURIComponent(id)}/operational-risk`);const el=$('#workRisk');if(el)el.innerHTML=`<div class="mini-title">Operational risk · ${esc(risk.level)} · ${esc(risk.score)}</div><p>${esc(risk.reasons?.map(x=>x.message).join(' · ')||'No elevated risk recorded.')}</p>`;}catch(e){if($('#workRisk'))$('#workRisk').textContent=e.message};try{const tl=await api(`/api/v1/work-orders/${encodeURIComponent(id)}/timeline`);$('#workTimeline').innerHTML=(tl.events||[]).map(x=>`<div class="timeline"><small>${new Date(x.at).toLocaleString()} · ${esc(x.source)}</small><div><b>${esc(x.type)}</b><p>${esc(x.message)}</p></div></div>`).join('')||'<p class="muted">No timeline events.</p>';}catch(e){if($('#workTimeline'))$('#workTimeline').textContent=e.message};try{const cp=await api(`/api/v1/work-orders/${encodeURIComponent(id)}/completion-package`);renderCompletionPackage(cp)}catch{};try{const h=await api(`/api/v1/work-orders/${encodeURIComponent(id)}/handoff`);const he=document.querySelector('#workHandoff');if(he)he.innerHTML='<div class="mini-title">Handoff context · '+esc(h.nextAction?.label||'Review')+'</div><div class="detail-grid"><div><small>Risk</small><b>'+esc(h.risk?.level||'low')+' · '+esc(h.risk?.score??0)+'</b></div><div><small>Evidence</small><b>'+esc(h.evidenceCount||0)+'</b></div><div><small>Blockers</small><b>'+esc((h.completionAssurance?.blockers||[]).length)+'</b></div><div><small>Assigned</small><b>'+esc(h.workOrder.assignedEmail||'Unassigned')+'</b></div></div>'+(h.lastComment?'<p><b>Last recorded note:</b> '+esc(h.lastComment.body)+'</p>':'')+'<p class="muted">The next operator receives this context from persisted records; no missing fact is filled in by inference.</p>';}catch{};try{const ca=await api(`/api/v1/work-orders/${encodeURIComponent(id)}/completion-assurance`);renderCompletionAssurance(ca)}catch{};
try{const wb=await api(`/api/v1/work-orders/${encodeURIComponent(id)}/why-blocked`);const el=$('#whyBlocked');if(el)el.innerHTML=`<div class="mini-title">WHY BLOCKED?</div><p>${esc(wb.summary)}</p>${(wb.blockers||[]).map(b=>`<div class="simple-row"><div><b>${esc(b.code)}</b><p>${esc(b.why)}</p><small>Fix: ${esc(b.fix)}</small></div></div>`).join('')||'<p class="muted">No blockers.</p>'}`}catch{};
try{const pack=await api(`/api/v1/work-orders/${encodeURIComponent(id)}/work-pack`);const pel=$('#workPack');if(pel)pel.innerHTML=`<div class="mini-title">TECHNICIAN WORK PACK · ${esc(pack.nextStep)}</div><div class="detail-grid"><div><small>Risk</small><b>${esc(pack.operationalRisk?.level)}</b></div><div><small>Evidence</small><b>${esc(pack.evidence?.attached)}</b></div><div><small>Parts</small><b>${esc(pack.parts?.length||0)}</b></div><div><small>Gate</small><b>${pack.completionGate?.ready?'READY':'BLOCKED'}</b></div></div>`}catch{};
try{const vjr=await api(`/api/v1/work-orders/${encodeURIComponent(id)}/verified-job-record`);const el=$('#verifiedJobRecord');if(el)el.innerHTML=`<div class="mini-title">VERIFIED JOB RECORD</div><div class="detail-grid"><div><small>Evidence</small><b>${esc(vjr.evidence?.count)}</b></div><div><small>Sign-offs</small><b>${esc(vjr.signoffs?.length||0)}</b></div><div><small>Gate</small><b>${vjr.completionGate?.ready?'READY':'BLOCKED'}</b></div><div><small>Audit events</small><b>${esc(vjr.auditEventCount)}</b></div></div><p class="muted">${esc(vjr.note||'')}</p>`}catch{};
 const cands=await api(`/api/v1/work-orders/${encodeURIComponent(id)}/dispatch-candidates`);$('#dispatchCandidates').innerHTML=cands.map(x=>`<div class="simple-row"><div><b>${esc(x.email)}</b><p>${x.skills.map(s=>esc(s.skill)).join(', ')||'No skills'}</p></div><div><small>${esc(x.activeAppointments)} appointments · ${esc(x.distanceKm??'—')} km</small><button class="tiny" data-assign-tech="${esc(x.user_id)}">Schedule</button></div></div>`).join('')||'<p class="muted">No eligible technicians.</p>'; $$('#dispatchCandidates [data-assign-tech]').forEach(b=>b.onclick=async()=>{const start=prompt('Start (ISO 8601)');const end=prompt('End (ISO 8601)');if(!start||!end)return;try{await api('/api/v1/appointments',{method:'POST',body:JSON.stringify({workOrderId:id,technicianId:b.dataset.assignTech,startAt:start,endAt:end})});await loadApp();await openWork(id);if($('#dispatchBoard'))loadDispatchBoard()}catch(e){alert(e.message)}});}

async function loadDispatchBoard(){try{const d=await api('/api/v1/dispatch-board');const box=$('#dispatchBoard');if(!box)return;box.innerHTML=(d.technicians||[]).map(t=>`<div class="dispatch-tech"><div class="dispatch-head"><div><b>${esc(t.email)}</b><div class="muted">${esc(t.skills?.map(s=>s.skill).join(', ')||'No skills')}</div></div><span class="status-chip">${t.appointments.length} jobs</span></div>${t.appointments.map(a=>`<div class="dispatch-row"><div><b>${esc(a.number)} · ${esc(a.title)}</b><div class="muted">${new Date(a.start_at).toLocaleTimeString()}–${new Date(a.end_at).toLocaleTimeString()} · ${esc(a.customer_name||'—')}</div></div><span class="status-chip">${esc(a.status)}</span></div>`).join('')||'<div class="muted">No appointments.</div>'}</div>`).join('')+(d.unassigned?.length?`<div class="dispatch-tech"><div class="dispatch-head"><b>Unassigned</b><span class="status-chip">${d.unassigned.length}</span></div>${d.unassigned.map(a=>`<div class="dispatch-row"><div><b>${esc(a.number)} · ${esc(a.title)}</b><div class="muted">${esc(a.customer_name||'—')}</div></div><button class="tiny" data-open-work="${esc(a.work_order_id)}">Open</button></div>`).join('')}</div>`:'')||'<p class="muted">No field appointments for today.</p>';box.querySelectorAll('[data-open-work]').forEach(b=>b.onclick=()=>openWork(b.dataset.openWork));}catch(e){if($('#dispatchBoard'))$('#dispatchBoard').textContent=e.message}}
function renderCompletionAssurance(a){const el=$('#completionAssurance');if(!el||!a)return;const tone=a.ready?'READY':'BLOCKED';const blockers=(a.blockers||[]).join(' · ')||'None';el.innerHTML=`<div class="mini-title">COMPLETION ASSURANCE · ${esc(tone)}</div><p>${a.policy?esc(a.policy.name):'No completion gate configured'}</p><small>${esc(blockers)}</small>`;}
function renderCompletionPackage(p){const el=$('#completionPackage');if(!el||!p)return;el.innerHTML=`<div class="mini-title">VERIFIED COMPLETION PACKAGE</div><div class="detail-grid"><div><small>GPS check-in</small><b>${p.checkIn?'Recorded':'Not recorded'}</b></div><div><small>Evidence</small><b>${p.attachments?.length||0}</b></div><div><small>Parts</small><b>${p.parts?.length||0}</b></div><div><small>Safety</small><b>${p.safety?.length||0}</b></div><div><small>Sign-offs</small><b>${p.signoffs?.length||0}</b></div><div><small>Audit</small><b>${p.audit?.length||0} events</b></div></div>`}
$('#newWO').onclick=async()=>{const title=prompt('Work order title');if(!title)return;try{await api('/api/v1/work-orders',{method:'POST',body:JSON.stringify({title,description:'Created from OpsCore console'})});await loadApp()}catch(e){alert(e.message)}};
$('#newCustomer').onclick=async()=>{const name=prompt('Customer name');if(!name)return;try{await api('/api/v1/customers',{method:'POST',body:JSON.stringify({name})});await loadApp()}catch(e){alert(e.message)}};
$('#refreshOps').onclick=async()=>{try{await loadApp()}catch(e){alert(e.message)}};$('#refreshLivePulse').onclick=async()=>{try{await loadApp()}catch(e){alert(e.message)}};
$('#exportWOs').onclick=()=>{location.href='/api/v1/export/work-orders.csv'};
$('#woSearch').oninput=()=>renderOrders(lastWorkOrders);
$('#logout').onclick=async()=>{try{await api('/api/v1/auth/logout',{method:'POST'})}finally{token=null;location.reload()}};

let currentRecordKind='customers';
function recordCell(v){return esc(v===null||v===undefined||v===''?'—':v)}
function renderRecords(kind,data){
  const box=$('#recordsPanel'); if(!box)return;
  const defs={
    customers:{title:'Customers',rows:Array.isArray(data)?data:[],cols:[['Name','name'],['Email','email'],['Phone','phone'],['Status','status'],['Updated','updated_at']]},
    sites:{title:'Sites',rows:Array.isArray(data)?data:[],cols:[['Name','name'],['Customer','customer_name'],['Address','address'],['Latitude','latitude'],['Longitude','longitude']]},
    assets:{title:'Assets',rows:Array.isArray(data)?data:[],cols:[['Name','name'],['Type','asset_type'],['Status','status'],['Site','site_name'],['Updated','updated_at']]},
    inventory:{title:'Inventory',rows:Array.isArray(data)?data:[],cols:[['SKU','sku'],['Part','part_name'],['Location','location_name'],['Quantity','quantity'],['Reserved','reserved_quantity']]},
    members:{title:'Members',rows:Array.isArray(data)?data:[],cols:[['Email','email'],['Role','role'],['Status','status'],['Created','created_at']]}
  };
  const d=defs[kind]||defs.customers;
  box.innerHTML=`<div class="records-count"><b>${esc(d.title)}</b><span class="status-chip">${d.rows.length} loaded</span></div><div class="records-scroll"><table class="records-table"><thead><tr>${d.cols.map(c=>`<th>${esc(c[0])}</th>`).join('')}</tr></thead><tbody>${d.rows.slice(0,500).map(r=>`<tr>${d.cols.map(c=>`<td>${recordCell(r[c[1]])}</td>`).join('')}</tr>`).join('')||`<tr><td colspan="${d.cols.length}"><span class="muted">No persisted ${esc(d.title.toLowerCase())} records.</span></td></tr>`}</tbody></table></div>`;
}
async function loadRecords(kind=currentRecordKind){
  currentRecordKind=kind;
  const box=$('#recordsPanel'); if(!box)return;
  box.innerHTML='<p class="muted">Loading…</p>';
  try{
    const paths={customers:'/api/v1/customers',sites:'/api/v1/sites',assets:'/api/v1/assets',inventory:'/api/v1/inventory',members:'/api/v1/members'};
    const d=await api(paths[kind]);
    renderRecords(kind,d);
  }catch(e){box.textContent=e.message;}
}
$$('.record-tab').forEach(b=>b.onclick=()=>{$$('.record-tab').forEach(x=>x.classList.toggle('active',x===b));loadRecords(b.dataset.recordKind)});
$('#refreshRecords')?.addEventListener('click',()=>loadRecords(currentRecordKind));

function switchView(view){$$('.view-section').forEach(s=>s.classList.toggle('hidden',s.dataset.section!==view));$$('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.view===view));$('#viewTitle').textContent=view==='overview'?'Overview':view==='work'?'Work orders':view==='dispatch'?'Dispatch':view==='records'?'Records':view==='ops'?'Field map & demo':view==='security'?'Security':'Build';if(view==='builder')window.initOpscoreBuilder?.();if(view==='records'){loadRecords();}if(view==='ops'){loadDispatcherMap();loadProviderStatus();loadOperationsHealth();loadControlPlane();}}
$$('.nav-item').forEach(b=>b.onclick=async()=>{switchView(b.dataset.view);if(b.dataset.view==='dispatch'){await loadDispatchBoard();await loadDailyPlanningBoard();}});
$('#refreshDispatch')?.addEventListener('click',loadDispatchBoard);

async function restoreSession(){
  try{
    const me=await api('/api/v1/me');
    await loadApp(me);
  }catch(err){
    // An unauthenticated visitor is still on the public landing page.
    // Never open or scroll to the sign-in form just because the silent
    // session probe returned 401; explicit user interaction owns auth UI.
    setVisible('#appPanel',false);
    setVisible('#loginPanel',false);
    setVisible('#setupPanel',false);
  }
}

restoreSession();

let opsMap=null;
async function loadDispatcherMap(){
  const box=$('#dispatcherMap'); if(!box) return;
  const host=$('#geoMapCanvas'), list=$('#dispatcherMapList');
  try{
    const [d,fences,trailFc]=await Promise.all([
      api('/api/v1/dispatcher-map/v2'),
      api('/api/v1/geofences').catch(()=>[]),
      api('/api/v1/technicians/trail.geojson?limit=2000').catch(()=>({features:[]}))
    ]);
    const points=d.points||[];
    const trails=(trailFc.features||[]).map(f=>({
      technicianId:f.properties&&f.properties.technicianId,
      coordinates: f.geometry && f.geometry.type==='LineString' ? f.geometry.coordinates
        : (f.geometry && f.geometry.type==='Point' ? [f.geometry.coordinates] : [])
    })).filter(tr=>tr.coordinates.length);
    if(host&&window.OpsGeo){
      if(!opsMap) opsMap=new OpsGeo.GeoMap(host);
      opsMap._resize(); opsMap.setData({points,geofences:Array.isArray(fences)?fences:[],trails});
    }
    if(!points.length){list.innerHTML='<p class="muted">No stored check-in points. Run field check-in or demo closeout first.</p>';return;}
    list.innerHTML=points.map(p=>`<div class="map-point"><div><b>${esc(p.technicianEmail||p.technicianId)}</b><div class="muted">${esc(p.workOrderNumber||'')} · ${esc(p.appointmentStatus||'')}</div><div class="muted">${Number(p.latitude).toFixed(5)}, ${Number(p.longitude).toFixed(5)} · ±${esc(p.accuracyMeters??'—')} m${p.distanceToSiteKm!=null?' · '+esc(p.distanceToSiteKm)+' km straight-line to site':''}</div><div class="muted">${p.checkedInAt?new Date(p.checkedInAt).toLocaleString():''}</div></div><span class="status-chip">check-in</span></div>`).join('');
  }catch(e){list.textContent=e.message;}
}
async function loadProviderStatus(){
  const box=$('#providerStatus'); if(!box) return;
  try{
    const d=await api('/api/v1/notification-providers');
    const row=(name,ch)=>`<div class="provider-row"><b>${esc(name)}</b><span class="status-chip">${ch.configured?'configured':'not configured'}</span><small>${esc(ch.provider||'none')}</small></div>`;
    box.innerHTML=row('Email',d.email)+row('SMS',d.sms)+row('WhatsApp',d.whatsapp)+`<p class="muted">${esc(d.note||'')}</p>`;
  }catch(e){box.textContent=e.message;}
}
async function runCloseoutDemo(){
  const box=$('#closeoutDemoResult'); if(!box) return;
  box.innerHTML='<p class="muted">Running…</p>';
  try{
    const d=await api('/api/v1/demo/closeout-path',{method:'POST',body:JSON.stringify({})});
    box.innerHTML=`<div class="mini-title">DEMO CLOSEOUT COMPLETE</div>
      <div class="detail-grid">
        <div><small>Work order</small><b>${esc(d.workOrderNumber||d.workOrderId)}</b></div>
        <div><small>Invoice</small><b>${esc(d.invoiceId)}</b></div>
        <div><small>Map points</small><b>${esc(d.dispatcherMapPointCount)}</b></div>
        <div><small>Completion PDF</small><b>${esc((d.pdf?.completionSha256||'').slice(0,12))}…</b></div>
        <div><small>Invoice PDF</small><b>${esc((d.pdf?.invoiceSha256||'').slice(0,12))}…</b></div>
      </div>
      <p class="muted">${esc(d.note||'')}</p>
      <div class="row-actions">
        <a class="tiny" href="/api/v1/work-orders/${encodeURIComponent(d.workOrderId)}/completion.pdf" target="_blank">Download closeout PDF</a>
        <a class="tiny" href="/api/v1/invoices/${encodeURIComponent(d.invoiceId)}/pdf" target="_blank">Download invoice PDF</a>
      </div>`;
    await loadDispatcherMap();
    await loadApp();
  }catch(e){box.innerHTML=`<p class="muted">${esc(e.message)}</p>`;}
}
const _rc=$('#runCloseoutDemo'); if(_rc) _rc.onclick=()=>runCloseoutDemo();
const _rm=$('#refreshMap'); if(_rm) _rm.onclick=()=>loadDispatcherMap();
const _rp=$('#refreshProviders'); if(_rp) _rp.onclick=()=>loadProviderStatus();

async function loadControlPlane(){
  const box=$('#controlPlane'); if(!box) return;
  try{
    const d=await api('/api/v1/control-plane');
    const sev=(d.anomalies||[]).slice(0,8).map(x=>`<div class="simple-row"><div><b>${esc(x.code)}</b><p>${esc(x.action)}</p></div><span class="risk-chip">${esc(x.severity)} · ${esc(x.count)}</span></div>`).join('')||'<p class="muted">No active anomalies detected from local evidence.</p>';
    const flags=(d.featureFlags||[]).map(x=>`<div class="simple-row"><div><b>${esc(x.flag_key)}</b><p>${esc(x.reason||'No reason recorded')}</p></div><span class="status-chip">${x.enabled?'ON':'OFF'}</span></div>`).join('')||'<p class="muted">No tenant feature flags configured.</p>';
    box.innerHTML=`<div class="detail-grid"><div><small>Control status</small><b>${esc(d.status)}</b></div><div><small>Safe Mode</small><b>${d.safeMode?.enabled?'ACTIVE':'clear'}</b></div><div><small>Open work</small><b>${esc(d.twin?.openStatusCount)}</b></div><div><small>Error rate</small><b>${esc(d.runtime?.errorRate)}</b></div><div><small>Outbox failed</small><b>${esc(d.outbox?.failed)}</b></div><div><small>Snapshot hash</small><b>${esc((d.resultSha256||'').slice(0,12))}…</b></div></div><div class="mini-title">Anomalies</div>${sev}<div class="mini-title">Feature flags</div>${flags}`;
  }catch(e){box.textContent=e.message;}
}
async function loadOperationsHealth(){
  const box=$('#operationsHealth'); if(!box) return;
  try{
    const d=await api('/api/v1/operations-health');
    box.innerHTML=`<div class="detail-grid">
      <div><small>DB</small><b>${esc(d.database?.status)}</b></div>
      <div><small>Sync pending/failed</small><b>${esc(d.sync?.pending)} / ${esc(d.sync?.failed)}</b></div>
      <div><small>Outbox q/fail/dead</small><b>${esc(d.outbox?.queued)} / ${esc(d.outbox?.failed)} / ${esc(d.outbox?.deadLetterPresentation)}</b></div>
      <div><small>Attachments</small><b>${esc(d.storage?.attachmentCount)}</b></div>
      <div><small>Error rate</small><b>${esc(d.runtime?.errorRate)}</b></div>
      <div><small>Correlation header</small><b>${esc(d.correlation?.header)}</b></div>
    </div><p class="muted">${esc(d.database?.note||'')}</p>`;
  }catch(e){box.textContent=e.message;}
}
const _rh=$('#refreshHealth'); if(_rh)_rh.onclick=()=>loadOperationsHealth();

async function loadDailyPlanningBoard(){
  const box=$('#dailyPlanningBoard'); if(!box) return;
  try{
    const d=await api('/api/v1/daily-planning-board');
    box.innerHTML=`<div class="detail-grid">
      <div><small>Appointments</small><b>${esc(d.counts?.appointments)}</b></div>
      <div><small>Unassigned</small><b>${esc(d.counts?.unassigned)}</b></div>
      <div><small>Delayed</small><b>${esc(d.counts?.delayed)}</b></div>
      <div><small>SLA at risk</small><b>${esc(d.counts?.slaAtRisk)}</b></div>
      <div><small>Gaps ≥30m</small><b>${esc(d.counts?.gaps)}</b></div>
    </div>
    <div class="mini-title">Delayed</div>${(d.delayed||[]).slice(0,8).map(x=>`<div class="simple-row"><div><b>${esc(x.number)}</b><p>${esc(x.title)}</p><small>${esc(x.reason)} · ${esc(x.startAt)}</small></div></div>`).join('')||'<p class="muted">None</p>'}
    <div class="mini-title">Unassigned</div>${(d.unassigned||[]).slice(0,8).map(x=>`<div class="simple-row"><div><b>${esc(x.number||x.work_order_id)}</b><p>${esc(x.title||'')}</p></div></div>`).join('')||'<p class="muted">None</p>'}
    <p class="muted">${esc(d.note||'')}</p>`;
  }catch(e){box.textContent=e.message;}
}
const _rplan=$('#refreshPlanning'); if(_rplan)_rplan.onclick=()=>loadDailyPlanningBoard();
const _sf=$('#unifiedSearchForm');
if(_sf)_sf.onsubmit=async e=>{
  e.preventDefault();
  const q=new FormData(e.target).get('q');
  const box=$('#unifiedSearchResults'); if(!box) return;
  try{
    const d=await api('/api/v1/search?q='+encodeURIComponent(q));
    const block=(title,rows,fmt)=>`<div class="mini-title">${title} (${rows.length})</div>${rows.slice(0,5).map(fmt).join('')||'<p class="muted">None</p>'}`;
    box.innerHTML=
      block('Work orders',d.workOrders||[],x=>`<div class="simple-row"><b>${esc(x.number)}</b><span class="status-chip">${esc(x.status)}</span></div>`)+
      block('Customers',d.customers||[],x=>`<div class="simple-row"><b>${esc(x.name)}</b><small>${esc(x.email||'')}</small></div>`)+
      block('Sites',d.sites||[],x=>`<div class="simple-row"><b>${esc(x.name)}</b><small>${esc(x.address||'')}</small></div>`)+
      block('Assets',d.assets||[],x=>`<div class="simple-row"><b>${esc(x.name)}</b><small>${esc(x.asset_type||'')}</small></div>`)+
      block('Technicians',d.technicians||[],x=>`<div class="simple-row"><b>${esc(x.email)}</b></div>`);
  }catch(err){box.textContent=err.message;}
};


// Universal slash commands: safe, server-authorized operational shortcuts only.
function initSlashCommands(){
  if(document.querySelector('#slashCommandInput')) return;
  const box=document.createElement('div'); box.id='slashCommandInput'; box.className='panel-soft slash-command-bar'; box.innerHTML='<input id="slashCommandText" aria-label="Slash command" placeholder="Type /closeout, /recon, /firewall-status…" /> <button id="slashCommandRun" class="tiny">Run</button><span id="slashCommandResult" class="muted"></span>';
  const host=document.querySelector('main')||document.body; host.prepend(box);
  const run=async()=>{const input=document.querySelector('#slashCommandText');const out=document.querySelector('#slashCommandResult');try{const r=await api('/api/v1/commands/execute',{method:'POST',body:JSON.stringify({command:input.value})});out.textContent=JSON.stringify(r.result); }catch(e){out.textContent=e.message;}};
  document.querySelector('#slashCommandRun').onclick=run; document.querySelector('#slashCommandText').addEventListener('keydown',e=>{if(e.key==='Enter')run();});
}
initSlashCommands();

window.addEventListener('keydown',e=>{ if((e.key==='/') && !['INPUT','TEXTAREA'].includes(document.activeElement?.tagName)){const i=document.querySelector('#slashCommandText');if(i){i.focus();e.preventDefault();}} });

const _rcp=$('#refreshControlPlane'); if(_rcp)_rcp.onclick=()=>loadControlPlane();
const _dr=$('#downloadRecovery'); if(_dr)_dr.onclick=()=>{location.href='/api/v1/control-plane/recovery-bundle'};
const _sm=$('#toggleSafeMode'); if(_sm)_sm.onclick=async()=>{try{const current=await api('/api/v1/control-plane/safe-mode');const reason=prompt(current.enabled?'Reason to clear Safe Mode:':'Reason to activate Safe Mode:');if(reason===null)return;await api('/api/v1/control-plane/safe-mode',{method:'POST',body:JSON.stringify({enabled:!current.enabled,reason})});await loadControlPlane();}catch(e){alert(e.message)}};
