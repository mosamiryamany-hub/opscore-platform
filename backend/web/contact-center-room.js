/* OpsCore Contact Center Control Room — real tenant-scoped operations only. */
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const state = { items: [], selected: null, conversation: null, currentUserId: null, busy: false, queueError: null };

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
    if (error?.status === 401 || error?.code === 'AUTH_REQUIRED') return 'Sign in through the Control Plane, then return to this room.';
    if (error?.status === 403 || error?.code === 'FORBIDDEN') return 'Your current role cannot operate the human escalation queue.';
    return 'The API did not confirm access. No queue data or action is assumed.';
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
    if (reply) reply.disabled = state.busy || !permitted;
    if (replyText) replyText.disabled = state.busy || !permitted;
    if (resolve) resolve.disabled = state.busy || !permitted;
    if (confirm) confirm.disabled = state.busy || !permitted || !$('ccrResolutionNote')?.value.trim();
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
  }
  function renderQueue() {
    const list = $('ccrQueueList');
    if (!list) return;
    list.replaceChildren();
    const q = $('ccrSearch').value.trim().toLowerCase();
    const filter = $('ccrFilter').value;
    const visible = state.items.filter(item => {
      if (filter !== 'all' && item.status !== filter) return false;
      const haystack = [item.conversationId,item.reasonCode,item.channel,item.languageCode,item.priority,item.assignedTo].join(' ').toLowerCase();
      return !q || haystack.includes(q);
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
      renderTranscript(conversation.messages);
      renderQueue();
      setText('ccrQueueMessage','Assignment loaded through the authenticated API.');
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
      const [status,queue] = await Promise.all([
        api('/api/v1/contact-center/status'),
        api('/api/v1/contact-center/handoffs?status=open&limit=50')
      ]);
      renderService(status);
      state.queueError = null;\n      state.items = Array.isArray(queue.items) ? queue.items : [];
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
      if (!canOperateSelected()) throw new Error('CONTACT_CENTER_HUMAN_ASSIGNMENT_REQUIRED');\n      const payload = {content,clientMessageId:'human:'+crypto.randomUUID()};
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
  $('ccrReplyForm').addEventListener('submit',sendReply);
  $('ccrResolve').addEventListener('click',() => $('ccrResolveDialog').showModal());
  $('ccrResolveCancel').addEventListener('click',() => $('ccrResolveDialog').close());
  $('ccrResolveConfirm').addEventListener('click',resolveHandoff);
  $('ccrResolutionNote').addEventListener('input',() => { $('ccrResolveConfirm').disabled = state.busy || !canOperateSelected() || !$('ccrResolutionNote').value.trim(); });
  refreshQueue();
})();
