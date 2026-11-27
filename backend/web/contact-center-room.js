/* OpsCore Contact Center Control Room — real tenant-scoped operations only. */
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const state = { items: [], selected: null, conversation: null, currentUserId: null, currentUserRole: null, busy: false, queueError: null };

  const ROOM_I18N = {
    en: {
      authRequired: 'Sign in through the Control Plane, then return to this room.',
      authReady: 'Operator session active',
      authChecking: 'Checking operator access',
      forbidden: 'Your current role cannot operate the human escalation queue.',
      apiUnconfirmed: 'The API did not confirm access. No queue data or action is assumed.',
      replyAccepted: 'Human reply accepted and transcript reloaded from the API.',
      resolveNoteRequired: 'Enter a resolution note before closing this handoff.',
      resolved: 'Resolution accepted by the server. Queue refreshed.'
    },
    ar: {
      authRequired: 'سجّل الدخول عبر لوحة التحكم ثم ارجع إلى هذه الغرفة.',
      authReady: 'جلسة الموظف نشطة',
      authChecking: 'جارٍ التحقق من صلاحية الموظف',
      forbidden: 'دورك الحالي لا يسمح بتشغيل طابور التصعيد البشري.',
      apiUnconfirmed: 'لم يؤكد الخادم صلاحية الوصول. لا تُفترض بيانات طابور أو إجراء.',
      replyAccepted: 'قُبل رد الموظف وأُعيد تحميل المحادثة من الواجهة البرمجية.',
      resolveNoteRequired: 'أدخل ملاحظة الإغلاق قبل إغلاق هذا التصعيد.',
      resolved: 'قَبل الخادم الإغلاق. تم تحديث الطابور.'
    }
  };
  function roomLocale() {
    const lang = String(document.documentElement.lang || 'en').toLowerCase();
    return lang.startsWith('ar') ? 'ar' : 'en';
  }
  function tx(key, fallback) {
    const pack = ROOM_I18N[roomLocale()] || ROOM_I18N.en;
    return pack[key] || fallback || key;
  }

  function setText(id, value) {
    const node = $(id);
    if (node) node.textContent = String(value ?? '');
  }
  function setState(id, level, value) {
    const node = $(id);
    if (!node) return;
    node.className = 'ccr-state ' + (level === 'ready' ? 'is-ready' : level === 'blocked' ? 'is-blocked' : 'is-pending');
    node.textContent = String(value);
  }
  async function api(path, options = {}) {
    const response = await fetch(path, {
      method: options.method || 'GET',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { accept: 'application/json', ...(options.body ? { 'content-type': 'application/json' } : {}) },
      body: options.body ? JSON.stringify(options.body) : undefined
    });
    let payload = {};
    try { payload = await response.json(); } catch {}
    if (!response.ok) {
      const code = payload?.error?.code || 'HTTP_' + response.status;
      const error = new Error(code);
      error.status = response.status;
      error.code = code;
      throw error;
    }
    return payload;
  }
  function accessMessage(error) {
    if (error?.status === 401 || error?.code === 'AUTH_REQUIRED') return tx('authRequired', 'Sign in through the Control Plane, then return to this room.');
    if (error?.status === 403 || error?.code === 'FORBIDDEN') return tx('forbidden', 'Your current role cannot operate the human escalation queue.');
    return tx('apiUnconfirmed', 'The API did not confirm access. No queue data or action is assumed.');
  }
  function renderService(status) {
    const enabled = Boolean(status?.enabled);
    const encrypted = Boolean(status?.encryptionConfigured);
    const textReady = Boolean(status?.textAssistantConfigured);
    const voiceReady = Boolean(status?.realtimeBrowserVoiceConfigured);
    setState('ccrFeatureState', enabled ? 'ready' : 'blocked', enabled ? 'Enabled' : 'Disabled');
    setState('ccrTextState', textReady ? 'ready' : 'blocked', textReady ? 'Configured' : 'Not configured');
    setState('ccrEncryptionState', encrypted ? 'ready' : 'blocked', encrypted ? 'Key configured' : 'Key missing');
    setState('ccrVoiceState', voiceReady ? 'ready' : 'blocked', voiceReady ? 'Configured' : 'Unavailable');
    const actions = status?.policy?.executeExternalActions === false;
    setState('ccrActionsState', actions ? 'ready' : 'pending', actions ? 'Disabled by policy' : 'Policy not confirmed');
  }
  function canOperateSelected() {
    return Boolean(state.selected && state.currentUserId && state.selected.assignedTo === state.currentUserId);
  }
  function updateCaseControls() {
    const permitted = canOperateSelected();
    const reply = $('ccrSendReply');
    const replyText = $('ccrReply');
    const resolve = $('ccrResolve');
    const confirm = $('ccrResolveConfirm');
    const resolutionNote = $('ccrResolutionNote');
    if (reply) reply.disabled = state.busy || !permitted;
    if (replyText) replyText.disabled = state.busy || !permitted;
    if (resolve) resolve.disabled = state.busy || !permitted;
    if (resolutionNote) resolutionNote.disabled = state.busy || !permitted;
    if (confirm) confirm.disabled = state.busy || !permitted || !resolutionNote?.value.trim();
    const guard = $('ccrAssignmentGuard');
    if (guard) {
      guard.hidden = permitted || !state.selected;
      guard.textContent = state.selected && !permitted
        ? 'This handoff is assigned to another operator. You may review the transcript, but reply and resolution actions are disabled.'
        : '';
    }
  }
  function setBusy(busy) {
    state.busy = busy;
    const refresh = $('ccrRefresh');
    if (refresh) refresh.disabled = busy;
    updateCaseControls();
  }
  function metrics(items) {
    setText('ccrTotal', items.length);
    setText('ccrQueued', items.filter(item => item.status === 'queued').length);
    setText('ccrClaimed', items.filter(item => item.status === 'claimed').length);
    setText('ccrPriority', items.filter(item => ['high','urgent'].includes(String(item.priority || '').toLowerCase())).length);
  }
  function makeNode(tag, className, value) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (value !== undefined) node.textContent = String(value);
    return node;
  }
  function aggregate(field) {
    const counts = new Map();
    state.items.forEach(item => {
      const value = String(item?.[field] || '').trim();
      if (value) counts.set(value, (counts.get(value) || 0) + 1);
    });
    return [...counts.entries()].sort((a,b) => b[1]-a[1] || a[0].localeCompare(b[0])).slice(0,5);
  }
  function renderBreakdown(id, entries) {
    const root = $(id);
    if (!root) return;
    root.replaceChildren();
    if (!entries.length) {
      root.appendChild(makeNode('div','ccr-bars-empty','No categorized rows returned in this snapshot.'));
      return;
    }
    const max = Math.max(...entries.map(entry => entry[1]),1);
    entries.forEach(([label,count]) => {
      const row = makeNode('div','ccr-bar-row');
      const heading = makeNode('div','ccr-bar-heading');
      heading.append(makeNode('span','ccr-bar-label',label),makeNode('strong','ccr-bar-count',count));
      const track = makeNode('div','ccr-bar-track');
      const fill = makeNode('span','ccr-bar-fill');
      fill.style.width = Math.max(3,Math.round((count/max)*100)) + '%';
      track.appendChild(fill);
      row.append(heading,track);
      root.appendChild(row);
    });
  }
  function renderAnalytics() {
    const priorities = ['urgent','high','normal','low']
      .map(priority => [priority,state.items.filter(item => String(item.priority || '').toLowerCase() === priority).length])
      .filter(entry => entry[1] > 0);
    renderBreakdown('ccrPriorityBreakdown',priorities);
    renderBreakdown('ccrReasonBreakdown',aggregate('reasonCode'));
    renderBreakdown('ccrChannelBreakdown',aggregate('channel'));
    renderBreakdown('ccrLanguageBreakdown',aggregate('languageCode'));
    setText('ccrInsightScope',state.items.length
      ? 'Derived from ' + state.items.length + ' open handoff row(s) returned by the tenant-scoped API. Maximum request size: 50 rows.'
      : 'No open rows were returned. No distribution values are inferred.');
    renderAgentDistribution();
  }
  function renderAgentDistribution() {
    const panel=$('ccrSupervisorPanel'),root=$('ccrAgentDistribution'),filterWrap=$('ccrAgentFilterWrap'),filter=$('ccrAgentFilter');
    const permitted=['owner','admin','manager'].includes(state.currentUserRole);
    if(!panel||!root)return;
    panel.hidden=!permitted;
    if(filterWrap)filterWrap.hidden=!permitted;
    if(!permitted)return;
    const groups=new Map();
    for(const item of state.items){
      const owner=String(item.assignedTo||'unassigned');
      const group=groups.get(owner)||{owner,total:0,urgent:0,oldest:Infinity};
      group.total++;
      if(['urgent','high'].includes(String(item.priority||'').toLowerCase()))group.urgent++;
      const created=Date.parse(item.createdAt||'');
      if(Number.isFinite(created))group.oldest=Math.min(group.oldest,created);
      groups.set(owner,group);
    }
    const list=[...groups.values()].sort((a,b)=>b.total-a.total||a.owner.localeCompare(b.owner));
    setText('ccrSupervisorCount',list.length+' operator group(s)');
    root.replaceChildren();
    if(filter){
      const prior=filter.value;
      filter.replaceChildren(new Option('All agents','all'));
      list.forEach(group=>filter.add(new Option(group.owner==='unassigned'?'Unassigned':group.owner,group.owner)));
      filter.value=list.some(group=>group.owner===prior)?prior:'all';
    }
    if(!list.length){root.appendChild(makeNode('div','empty','No open handoffs were returned for workload distribution.'));return;}
    list.forEach(group=>{
      const card=makeNode('article','ccr-agent-load');
      const head=makeNode('div','ccr-agent-load-head');
      head.appendChild(makeNode('strong','',group.owner==='unassigned'?'Unassigned':group.owner));
      head.appendChild(makeNode('span','ccr-agent-load-count',String(group.total)));
      card.appendChild(head);
      card.appendChild(makeNode('p','',group.urgent+' high / urgent item(s)'));
      card.appendChild(makeNode('small','',Number.isFinite(group.oldest)?'Oldest open handoff: '+new Date(group.oldest).toLocaleString():'Oldest wait unavailable'));
      root.appendChild(card);
    });
  }
  function renderQueue() {
    const list = $('ccrQueueList');
    if (!list) return;
    list.replaceChildren();
    const q = $('ccrSearch').value.trim().toLowerCase();
    const filter = $('ccrFilter').value;
    const priorityFilter = $('ccrPriorityFilter')?.value || 'all';
    const sort = $('ccrSort')?.value || 'priority';
    const agentFilter = $('ccrAgentFilter')?.value || 'all';
    const visible = state.items.filter(item => {
      if (['owner','admin','manager'].includes(state.currentUserRole) && agentFilter !== 'all' && String(item.assignedTo || 'unassigned') !== agentFilter) return false;
      if (filter !== 'all' && item.status !== filter) return false;
      if (priorityFilter !== 'all' && String(item.priority || '').toLowerCase() !== priorityFilter) return false;
      const haystack = [item.conversationId,item.reasonCode,item.reasonDetail,item.channel,item.languageCode,item.priority,item.assignedTo].join(' ').toLowerCase();
      return !q || haystack.includes(q);
    });
    const priorityRank = { urgent: 0, high: 1, normal: 2, low: 3 };
    visible.sort((a,b) => {
      if (sort === 'newest') return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
      if (sort === 'oldest') return String(a.createdAt || '').localeCompare(String(b.createdAt || ''));
      return (priorityRank[String(a.priority || '').toLowerCase()] ?? 9) - (priorityRank[String(b.priority || '').toLowerCase()] ?? 9)
        || String(a.createdAt || '').localeCompare(String(b.createdAt || ''));
    });
    if (!visible.length) {
      list.appendChild(makeNode('div','empty',state.items.length ? 'No queue rows match this filter.' : 'No open handoffs were returned for this organization.'));
      return;
    }
    visible.forEach(item => {
      const card = makeNode('article','ccr-queue-item' + (state.selected?.id === item.id ? ' is-selected' : ''));
      const top = makeNode('div','ccr-queue-item-top');
      const identity = makeNode('div','ccr-queue-identity');
      identity.append(makeNode('strong','mono',item.conversationId || 'Unknown conversation'),makeNode('small','',item.reasonCode || 'Reason not supplied'));
      const priority = makeNode('span','ccr-priority p-' + (['low','normal','high','urgent'].includes(String(item.priority || '').toLowerCase()) ? String(item.priority).toLowerCase() : 'normal'),String(item.priority || 'normal').toUpperCase());
      top.append(identity,priority);
      const meta = makeNode('div','ccr-queue-meta');
      [item.channel,item.languageCode,item.status,item.assignedTo ? 'Assigned' : 'Unassigned'].filter(Boolean).forEach(v => meta.appendChild(makeNode('span','',v)));
      const action = makeNode('button','btn btn--sm ' + (item.status === 'queued' ? 'btn--primary' : 'btn--ghost'),item.status === 'queued' ? 'Claim & inspect' : 'Open assignment');
      action.type = 'button';
      action.disabled = state.busy;
      action.addEventListener('click',() => openHandoff(item));
      card.append(top,meta,action);
      list.appendChild(card);
    });
  }
  function renderTranscript(messages) {
    const transcript = $('ccrTranscript');
    transcript.replaceChildren();
    const rows = Array.isArray(messages) ? messages : [];
    if (!rows.length) transcript.appendChild(makeNode('div','empty','No transcript messages were returned for this conversation.'));
    rows.forEach(message => {
      const actor = ['customer','assistant','human','system'].includes(message.actorType) ? message.actorType : 'system';
      const row = makeNode('article','ccr-message ccr-' + actor);
      row.append(makeNode('span','ccr-message-role',actor),makeNode('p','',message.content || ''));
      if (message.createdAt) row.appendChild(makeNode('time','ccr-message-time',new Date(message.createdAt).toLocaleString()));
      transcript.appendChild(row);
    });
    setText('ccrMessageCount',rows.length + (rows.length === 1 ? ' message' : ' messages'));
    transcript.scrollTop = transcript.scrollHeight;
  }
  function updateElapsedClock(createdAt) {
    const node = $('ccrWaitClock');
    if (!node) return;
    const start = Date.parse(createdAt || '');
    if (!Number.isFinite(start)) { node.textContent = 'Elapsed unavailable'; return; }
    const seconds = Math.max(0, Math.floor((Date.now() - start) / 1000));
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    node.textContent = 'Queue wait ' + (hours ? hours + 'h ' : '') + minutes + 'm';
    node.dataset.startedAt = String(start);
  }
  async function loadCaseEvents(handoffId, conversationId) {
    const root = $('ccrEventTimeline');
    if (!root) return;
    root.replaceChildren();
    setText('ccrEventCount', 'Loading');
    try {
      const ids = [...new Set([handoffId, conversationId].filter(Boolean))];
      const results = await Promise.all(ids.map(id => api('/api/v1/audit?resourceId=' + encodeURIComponent(id))));
      const events = results.flatMap(value => Array.isArray(value) ? value : (value.entries || value.items || value.events || value.rows || []));
      events.sort((a,b) => String(b.created_at || b.createdAt || '').localeCompare(String(a.created_at || a.createdAt || '')));
      setText('ccrEventCount', events.length + ' events');
      if (!events.length) {
        root.appendChild(makeNode('div','empty','No audit events were returned for this handoff or conversation identifier.'));
        return;
      }
      events.slice(0,30).forEach(event => {
        const row = makeNode('article','ccr-event-item');
        row.appendChild(makeNode('strong','',event.action || event.eventType || event.resourceType || 'Recorded event'));
        row.appendChild(makeNode('time','',event.created_at || event.createdAt || 'Timestamp not returned'));
        row.appendChild(makeNode('p','',[
          event.actor_user_id || event.actorUserId || event.actor || '',
          event.resource_type || event.resourceType || '',
          event.resource_id || event.resourceId || '',
          event.reason || event.summary || ''
        ].filter(Boolean).join(' · ') || 'Audit event returned by the tenant-scoped audit endpoint.'));
        root.appendChild(row);
      });
    } catch (error) {
      setText('ccrEventCount','Unavailable');
      root.appendChild(makeNode('div','empty','Audit history unavailable: ' + error.message));
    }
  }
  async function openHandoff(item) {
    if (state.busy) return;
    setBusy(true);
    setText('ccrQueueMessage','Loading protected conversation…');
    try {
      let assignment = item;
      if (item.status === 'queued') {
        assignment = await api('/api/v1/contact-center/handoffs/' + encodeURIComponent(item.id) + '/claim',{method:'POST',body:{}});
      }
      const conversation = await api('/api/v1/contact-center/conversations/' + encodeURIComponent(item.conversationId));
      state.selected = {...item,...assignment};
      state.conversation = conversation;
      $('ccrDetailEmpty').hidden = true;
      $('ccrCase').hidden = false;
      setText('ccrDetailState',assignment.status === 'claimed' ? 'Claimed assignment' : 'Case opened');
      setText('ccrConversationId',conversation.id);
      setText('ccrLanguageChannel',[conversation.languageName || conversation.languageCode,conversation.channel].filter(Boolean).join(' · '));
      setText('ccrReason',conversation.escalationReason || item.reasonCode || '—');
      setText('ccrCaseStatus',conversation.status || item.status || '—');
      setText('ccrAssignedOperator',conversation.assignedTo || item.assignedTo || 'Unassigned');
      setText('ccrCreatedAt',conversation.createdAt ? new Date(conversation.createdAt).toLocaleString() : 'Not returned');
      setText('ccrLastActivity',conversation.lastActivityAt ? new Date(conversation.lastActivityAt).toLocaleString() : 'Not returned');
      setText('ccrCaseChannel',conversation.channel || item.channel || 'Not returned');
      setText('ccrCaseLanguage',conversation.languageName || conversation.languageCode || item.languageCode || 'Not returned');
      updateElapsedClock(item.createdAt);
      renderTranscript(conversation.messages);
      await loadCaseEvents(item.id, item.conversationId);
      renderQueue();
      setText('ccrQueueMessage','Assignment and transcript loaded through the authenticated tenant-scoped API.');
    } catch (error) {
      setText('ccrQueueMessage',accessMessage(error));
      setText('ccrDetailState',error.code || 'Access not confirmed');
    } finally {
      setBusy(false);
      renderQueue();
    }
  }
  async function refreshQueue() {
    if (state.busy) return;
    setBusy(true);
    setText('ccrQueueMessage','Requesting current open handoffs…');
    try {
      const [status,queue,me] = await Promise.all([
        api('/api/v1/contact-center/status'),
        api('/api/v1/contact-center/handoffs?status=open&limit=50'),
        api('/api/v1/me')
      ]);
      state.currentUserId = me?.user?.id ? String(me.user.id) : null;
      state.currentUserRole = me?.role || null;
      renderService(status);
      state.queueError = null;
      state.items = Array.isArray(queue.items) ? queue.items : [];
      metrics(state.items);
      renderAnalytics();
      setText('ccrAuthState','Authenticated queue access confirmed');
      $('ccrAuthState').className = 'badge good';
      $('ccrQueueState').textContent = 'Queue response received';
      $('ccrQueueState').className = 'badge good';
      setText('ccrLastRefresh','Updated ' + new Date().toLocaleTimeString());
      setText('ccrQueueMessage',state.items.length + ' open row(s) returned. The API limit is 50 rows per request.');
      renderQueue();
      if (state.selected) {
        const current = state.items.find(item => item.id === state.selected.id);
        if (!current) {
          state.selected = null;
          state.conversation = null;
          $('ccrCase').hidden = true;
          $('ccrDetailEmpty').hidden = false;
          setText('ccrDetailState','No case selected');
        }
      }
    } catch (error) {
      state.currentUserId = null;
      state.currentUserRole = null;
      state.queueError = accessMessage(error);
      state.items = [];
      metrics([]);
      renderAnalytics();
      setText('ccrAuthState',error.status === 401 || error.status === 403 ? 'Operator access not granted' : 'API access unverified');
      $('ccrAuthState').className = 'badge bad';
      $('ccrQueueState').textContent = 'Queue unavailable';
      $('ccrQueueState').className = 'badge bad';
      setText('ccrQueueMessage',accessMessage(error));
      $('ccrQueueList').replaceChildren(makeNode('div','empty',accessMessage(error)));
      setText('ccrLastRefresh','No successful refresh');
      renderService(null);
    } finally {
      setBusy(false);
      renderQueue();
    }
  }
  async function sendReply(event) {
    event.preventDefault();
    if (!state.selected?.conversationId || state.busy) return;
    const content = $('ccrReply').value.trim();
    if (!content) return;
    setBusy(true);
    try {
      if (!canOperateSelected()) throw new Error('CONTACT_CENTER_HUMAN_ASSIGNMENT_REQUIRED');
      const payload = {content,clientMessageId:'human:'+crypto.randomUUID()};
      await api('/api/v1/contact-center/conversations/' + encodeURIComponent(state.selected.conversationId) + '/human-reply',{method:'POST',body:payload});
      $('ccrReply').value = '';
      const response = await api('/api/v1/contact-center/conversations/' + encodeURIComponent(state.selected.conversationId));
      state.conversation = response;
      renderTranscript(response.messages);
      setText('ccrQueueMessage','Human reply accepted and transcript reloaded from the API.');
    } catch (error) {
      setText('ccrQueueMessage',accessMessage(error));
    } finally { setBusy(false); }
  }
  async function resolveHandoff() {
    if (!state.selected?.id || state.busy || !canOperateSelected()) return;
    setBusy(true);
    try {
      const note = $('ccrResolutionNote').value.trim();
      if (!note) { setText('ccrQueueMessage','Enter a resolution note before closing this handoff.'); return; }
      await api('/api/v1/contact-center/handoffs/' + encodeURIComponent(state.selected.id) + '/resolve',{method:'POST',body:{note}});
      $('ccrResolutionNote').value = '';
      $('ccrResolveDialog').close();
      state.selected = null;
      state.conversation = null;
      $('ccrCase').hidden = true;
      $('ccrDetailEmpty').hidden = false;
      setText('ccrDetailState','Handoff resolved');
      await refreshQueueAfterBusy();
      setText('ccrQueueMessage','Resolution accepted by the server. Queue refreshed.');
    } catch (error) {
      setText('ccrQueueMessage',accessMessage(error));
    } finally { setBusy(false); }
  }
  async function refreshQueueAfterBusy() {
    const queue = await api('/api/v1/contact-center/handoffs?status=open&limit=50');
    state.items = Array.isArray(queue.items) ? queue.items : [];
    metrics(state.items);
    renderAnalytics();
    setText('ccrLastRefresh','Updated ' + new Date().toLocaleTimeString());
    renderQueue();
  }

  $('ccrRefresh').addEventListener('click',refreshQueue);
  $('ccrSearch').addEventListener('input',renderQueue);
  $('ccrFilter').addEventListener('change',renderQueue);
  $('ccrPriorityFilter')?.addEventListener('change',renderQueue);
  $('ccrSort')?.addEventListener('change',renderQueue);
  $('ccrAgentFilter')?.addEventListener('change',renderQueue);
  $('ccrReplyForm').addEventListener('submit',sendReply);
  $('ccrResolve').addEventListener('click',() => $('ccrResolveDialog').showModal());
  $('ccrResolveCancel').addEventListener('click',() => $('ccrResolveDialog').close());
  $('ccrResolveConfirm').addEventListener('click',resolveHandoff);
  $('ccrResolutionNote').addEventListener('input',() => { $('ccrResolveConfirm').disabled = state.busy || !canOperateSelected() || !$('ccrResolutionNote').value.trim(); });
  refreshQueue();
  window.setInterval(() => {
    if (!document.hidden && state.selected) updateElapsedClock(state.selected.createdAt);
  }, 60000);
  window.setInterval(() => {
    if (!document.hidden && !state.busy) refreshQueue();
  }, 30000);
})();
